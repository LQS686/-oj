#!/usr/bin/env bash
# ============================================================
# OJ 平台 - 宝塔面板部署 / 升级脚本
# 架构：宝塔 Nginx(80/443) → Docker 应用(3000) + Docker MongoDB + Docker Redis
# 用法：
#   初次部署：sudo bash bt-deploy.sh https://dsoj.run
#   升级更新：sudo bash bt-deploy.sh
# ============================================================
set -euo pipefail

RED='\033[0;31m'   GREEN='\033[0;32m'   CYAN='\033[0;36m'
NC='\033[0m'       BOLD='\033[1m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
step()  { echo -e "\n${BOLD}${CYAN}:: $1${NC}"; }
warn()  { echo -e "${RED}[!]${NC} $1"; }

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_URL="${1:-}"

step "检查环境"
if ! command -v docker &>/dev/null; then
  warn "未检测到 Docker，请在宝塔软件商店安装「Docker管理器」后重试"
  exit 1
fi
info "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# ========================================================
# 配置 Docker 镜像加速（国内服务器必需）
# ========================================================
step "配置 Docker 镜像加速"
if [ ! -f /etc/docker/daemon.json ] || ! grep -q "registry-mirrors" /etc/docker/daemon.json 2>/dev/null; then
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'DOCKERCONF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKERCONF
  systemctl restart docker
  info "Docker 镜像加速已配置（docker.1ms.run + docker.xuanyuan.me）"
else
  info "Docker 镜像加速已存在"
fi

cd "$PROJECT_DIR"

# ============================================================
# 1. 生成 .env（仅首次，已存在则跳过）
# ============================================================
if [ ! -f ".env" ]; then
  step "首次部署：生成配置"

  if [ -z "$FRONTEND_URL" ]; then
    read -rp "请输入站点完整 URL（如 https://dsoj.run）: " FRONTEND_URL
  fi

  PASS=$(openssl rand -base64 24 | tr -d '+/=' | head -c 24)

  cat > .env <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=mongodb://ojuser:${PASS}@mongo:27017/oj_platform?authSource=oj_platform&replicaSet=rs0
JWT_SECRET=$(openssl rand -base64 32 | tr -d '+/=' | head -c 43)
AI_CONFIG_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '+/=' | head -c 43)
REDIS_URL=redis://:${PASS}@redis:6379
FRONTEND_URL=${FRONTEND_URL}
NEXT_PUBLIC_API_URL=${FRONTEND_URL}
NEXT_PUBLIC_BASE_URL=${FRONTEND_URL}
USE_DOCKER=false
TRUSTED_PROXIES=1
FORCE_SECURE_COOKIE=true
JUDGE_COMPILE_TIMEOUT=20000
JUDGE_JOB_TIMEOUT=300
JUDGE_EXTRA_TIME_RATIO=0.1
JUDGE_REJUDGE_TIMES=1
JUDGE_MAX_CONCURRENT=1
LOG_LEVEL=info
AI_JOB_TIMEOUT_MS=300000
AI_SOLUTION_TIMEOUT_MS=180000
AI_SOLUTION_MAX_CONCURRENT=2
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=${PASS}
MONGO_APP_USER=ojuser
MONGO_APP_PASSWORD=${PASS}
REDIS_PASSWORD=${PASS}
EOF
  info ".env 已生成"
else
  info ".env 已存在，跳过生成"
fi

# ============================================================
# 2. 生成 MongoDB KeyFile（仅首次）
# ============================================================
if [ ! -f "mongo-keyfile" ]; then
  openssl rand -base64 756 > mongo-keyfile
  chmod 400 mongo-keyfile
  info "MongoDB KeyFile 已生成"
else
  chmod 400 mongo-keyfile
fi

# ============================================================
# 3. 拉取基础镜像 + 构建应用
# ============================================================
step "拉取基础镜像"
docker compose pull mongo redis

step "构建应用镜像（约 5 分钟）"
docker compose build app

# ============================================================
# 4. 启动服务
# ============================================================
step "启动服务"
docker compose up -d

# ============================================================
# 5. 等待健康检查
# ============================================================
echo -n "等待服务就绪"
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/health/db > /dev/null 2>&1; then
    echo ""
    info "应用已就绪"
    break
  fi
  echo -n "."
  sleep 4
done
echo ""

# ============================================================
# 6. 输出宝塔 Nginx 配置模板（仅首次）
# ============================================================

# 从 .env 提取域名
DOMAIN=$(grep FRONTEND_URL .env | head -1 | sed 's|.*https\?://||')

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  🎉  Docker 服务已启动${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo -e "  容器状态:"
docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose ps
echo ""
echo -e "  默认账号: ${GREEN}admin / admin123${NC}"
echo ""

if [ -n "$DOMAIN" ]; then
  echo -e "  ${BOLD}下一步：在宝塔配置 Nginx 反代${NC}"
  echo "  ──────────────────────────────────────"
  echo "  宝塔 → 网站 → 添加站点 → 域名填 ${DOMAIN}"
  echo "  创建后 → SSL → Let's Encrypt → 申请证书"
  echo "  然后 → 设置 → 配置文件 → 粘贴以下内容："
  echo ""
  echo -e "${CYAN}────────────────── 复制以下内容 ──────────────────${NC}"
  cat <<NGINX

server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate /www/server/panel/vhost/cert/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/${DOMAIN}/privkey.pem;

    client_max_body_size 50M;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  echo -e "${CYAN}────────────────── 复制结束 ──────────────────${NC}"
fi

echo ""
echo -e "  ${BOLD}升级命令:${NC}"
echo -e "    cd ${PROJECT_DIR} && git pull && sudo bash scripts/bt-deploy.sh"
echo ""
