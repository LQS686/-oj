#!/usr/bin/env bash
# ============================================================
# OJ 平台云服务器一键部署脚本
# 支持：Ubuntu 20.04+ / Debian 11+ / CentOS 7+
# 用法：chmod +x deploy.sh && sudo bash deploy.sh
# 也可：curl -fsSL <url>/deploy.sh | sudo bash
# ============================================================
set -euo pipefail

# --------------- 颜色输出 ---------------
RED='\033[0;31m'   GREEN='\033[0;32m'   YELLOW='\033[1;33m'
CYAN='\033[0;36m'  NC='\033[0m'         BOLD='\033[1m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }
step()  { echo -e "\n${CYAN}${BOLD}[$1]${NC} ${CYAN}$2${NC}"; }
title() { echo -e "\n${CYAN}${BOLD}========================================${NC}"; echo -e "${CYAN}${BOLD}  $1${NC}"; echo -e "${CYAN}${BOLD}========================================${NC}"; }

# --------------- 配置变量 ---------------
PROJECT_DIR="/opt/oj-platform"
GIT_REPO="https://gitee.com/carefree-old-man/dashan-oj.git"
MONGO_PASS=$(head -c 24 /dev/urandom | base64 | tr -d '+/=' | head -c 24)
REDIS_PASS=$(head -c 24 /dev/urandom | base64 | tr -d '+/=' | head -c 24)
JWT_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '+/=' | head -c 43)
AI_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '+/=' | head -c 43)

# --------------- 系统检测 ---------------
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
  else
    err "无法检测操作系统"
    exit 1
  fi
}

# --------------- 检查 root ---------------
check_root() {
  if [ "$EUID" -ne 0 ]; then
    err "请使用 root 权限运行: sudo bash deploy.sh"
    exit 1
  fi
}

# --------------- 安装 Docker ---------------
install_docker() {
  step "1/7" "安装 Docker + Docker Compose"

  if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    info "Docker 已安装: $(docker --version)"
    return
  fi

  case $OS in
    ubuntu|debian)
      apt-get update -qq
      apt-get install -y -qq ca-certificates curl gnupg lsb-release
      mkdir -p /etc/apt/keyrings
      curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/$OS $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    centos|rhel)
      yum install -y yum-utils
      yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
      yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    *)
      err "不支持的操作系统: $OS"
      exit 1
      ;;
  esac

  systemctl enable docker --now
  info "Docker 安装完成: $(docker --version)"
}

# --------------- 拉取项目 ---------------
clone_project() {
  step "2/7" "拉取项目代码"

  if [ -d "$PROJECT_DIR" ]; then
    warn "项目目录 $PROJECT_DIR 已存在"
    read -rp "是否删除重新拉取？(y/N): " yn
    if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
      rm -rf "$PROJECT_DIR"
    else
      info "保留现有目录，跳过克隆"
      return
    fi
  fi

  if command -v git &>/dev/null; then
    git clone "$GIT_REPO" "$PROJECT_DIR"
    info "项目已克隆到 $PROJECT_DIR"
  else
    apt-get install -y -qq git 2>/dev/null || yum install -y git 2>/dev/null
    git clone "$GIT_REPO" "$PROJECT_DIR"
    info "项目已克隆到 $PROJECT_DIR"
  fi
}

# --------------- 生成环境变量 ---------------
setup_env() {
  step "3/7" "配置环境变量"

  cd "$PROJECT_DIR"

  DOMAIN="${OJ_DOMAIN:-}"

  if [ -z "$DOMAIN" ]; then
    read -rp "请输入站点域名（如 oj.example.com，直接回车使用IP访问）: " DOMAIN
  fi

  local FRONTEND_URL
  if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "localhost" ]; then
    DOMAIN="localhost"
    FRONTEND_URL="http://localhost:3000"
  else
    FRONTEND_URL="https://$DOMAIN"
  fi

  cat > .env <<EOF
# ====== 自动生成的 OJ 平台配置 ======
NODE_ENV=production
PORT=3000
DATABASE_URL=mongodb://ojuser:${MONGO_PASS}@mongo:27017/oj_platform?authSource=oj_platform&replicaSet=rs0
JWT_SECRET=${JWT_SECRET}
AI_CONFIG_ENCRYPTION_KEY=${AI_KEY}

REDIS_URL=redis://:${REDIS_PASS}@redis:6379

FRONTEND_URL=${FRONTEND_URL}
NEXT_PUBLIC_API_URL=${FRONTEND_URL}
NEXT_PUBLIC_BASE_URL=${FRONTEND_URL}

USE_DOCKER=false
TRUSTED_PROXIES=1

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
MONGO_ROOT_PASSWORD=${MONGO_PASS}
MONGO_APP_USER=ojuser
MONGO_APP_PASSWORD=${MONGO_PASS}
REDIS_PASSWORD=${REDIS_PASS}
EOF

  info ".env 已生成 (JWT_SECRET / 数据库密码已自动生成)"
}

# --------------- 生成 MongoDB KeyFile ---------------
setup_mongo_keyfile() {
  step "4/7" "配置 MongoDB 副本集 KeyFile"

  cd "$PROJECT_DIR"
  local KEYFILE="mongo-keyfile"

  if [ ! -f "$KEYFILE" ]; then
    openssl rand -base64 512 | tr -d '\n' > "$KEYFILE"
    chmod 600 "$KEYFILE"
    info "MongoDB 副本集 KeyFile 已生成"
  else
    chmod 600 "$KEYFILE"
    info "KeyFile 已存在，跳过"
  fi
}

# --------------- 开放防火墙端口 ---------------
config_firewall() {
  step "5/7" "配置防火墙"

  if command -v ufw &>/dev/null && ufw status | grep -q active; then
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
    info "UFW 已放行 80/443"
  elif command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld 2>/dev/null; then
    firewall-cmd --permanent --add-port=80/tcp --add-port=443/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    info "firewalld 已放行 80/443"
  else
    warn "未检测到防火墙，请手动确保 80/443 端口已在安全组放行"
  fi
}

# --------------- 构建并启动 ---------------
deploy() {
  step "6/7" "构建并启动服务"

  cd "$PROJECT_DIR"

  info "拉取基础镜像..."
  docker compose pull mongo redis nginx 2>&1 | tail -1

  info "构建 OJ 应用镜像（约 5-10 分钟）..."
  docker compose build --build-arg JWT_SECRET="${JWT_SECRET}" 2>&1 | tail -5

  info "启动所有服务..."
  docker compose up -d

  info "等待服务就绪（约 30 秒）..."
  sleep 30
}

# --------------- 验证 ---------------
verify() {
  step "7/7" "验证部署"

  info "服务状态:"
  docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose ps

  echo ""
  info "测试 API 连接..."
  if curl -sf http://localhost:3000/api/health/db > /dev/null 2>&1; then
    info "API 健康检查通过！"
  else
    warn "API 尚未就绪，可等待 30 秒后重试：curl http://localhost:3000/api/health/db"
  fi

  echo ""
  echo -e "${BOLD}========================================${NC}"
  echo -e "${BOLD}  🎉  部署完成！${NC}"
  echo -e "${BOLD}========================================${NC}"
  echo ""
  echo -e "  访问地址:  ${GREEN}https://${DOMAIN}${NC}"
  echo -e "  直接访问:  ${GREEN}http://localhost:3000${NC}"
  echo ""
  echo -e "  首次使用: ${YELLOW}访问网站注册首个账号，将自动获得系统管理员权限${NC}"
  echo ""
  echo -e "  常用命令:"
  echo -e "    cd ${PROJECT_DIR}"
  echo -e "    docker compose logs -f app       # 查看应用日志"
  echo -e "    docker compose restart app       # 重启应用"
  echo -e "    docker compose down              # 停止所有服务"
  echo -e "    docker compose up -d             # 启动所有服务"
  echo ""
}

# --------------- 主流程 ---------------
main() {
  clear
  title "OJ 平台云服务器一键部署"

  detect_os
  echo -e "  操作系统: ${GREEN}${OS} ${VER}${NC}"
  echo -e "  安装目录: ${GREEN}${PROJECT_DIR}${NC}"
  echo ""
  read -rp "按 Enter 开始部署，Ctrl+C 取消..." _

  check_root
  install_docker
  clone_project
  setup_env
  setup_mongo_keyfile
  config_firewall
  deploy
  verify
}

main "$@"
