#!/usr/bin/env bash
# ============================================================
# OJ 平台 - 宝塔面板部署 / 升级脚本
# 架构：宝塔 Nginx(80/443) → Docker 应用(3000) + Docker MongoDB + Docker Redis
# 用法：
#   初次部署（HTTPS）：sudo bash scripts/bt-deploy.sh https://dsoj.run
#   初次部署（HTTP/IP）：sudo bash scripts/bt-deploy.sh http://服务器IP
#   升级更新：          sudo bash scripts/bt-deploy.sh --yes
#   切换域名：          sudo bash scripts/bt-deploy.sh https://新域名
#   仅重启不重建：      sudo bash scripts/bt-deploy.sh --no-build
#   深度清理构建缓存：  sudo bash scripts/bt-deploy.sh --prune
#   跳过镜像加速配置：  sudo bash scripts/bt-deploy.sh --skip-mirror
#   跳过交互确认：      sudo bash scripts/bt-deploy.sh --yes （宝塔终端推荐）
# ============================================================
set -euo pipefail

RED='\033[0;31m'   GREEN='\033[0;32m'   CYAN='\033[0;36m'   YELLOW='\033[1;33m'
NC='\033[0m'       BOLD='\033[1m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
step()  { echo -e "\n${BOLD}${CYAN}:: $1${NC}"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_URL_ARG=""
NO_BUILD=0
DO_PRUNE=0
SKIP_MIRROR=0
ASSUME_YES=0

usage() {
  cat <<USAGE
用法: sudo bash scripts/bt-deploy.sh [选项] [站点URL]

  站点URL           https://dsoj.run 或 http://IP（首次必填；升级时可省略）
  --no-build        跳过镜像构建，仅 up -d + 健康检查（配置热更适用）
  --prune           构建后清理 7 天前的 BuildKit 缓存（默认仅清悬空镜像）
  --skip-mirror     不写入 /etc/docker/daemon.json 镜像加速
  -y, --yes         跳过所有交互确认（宝塔终端推荐使用，避免 read 阻塞卡死终端）
  -h, --help        显示帮助
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) NO_BUILD=1; shift ;;
    --prune) DO_PRUNE=1; shift ;;
    --skip-mirror) SKIP_MIRROR=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    http://*|https://*) FRONTEND_URL_ARG="$1"; shift ;;
    *)
      err "未知参数: $1"
      usage
      exit 1
      ;;
  esac
done

# ---------- helpers ----------
require_cmd() {
  if ! command -v "$1" &>/dev/null; then
    err "缺少命令: $1"
    exit 1
  fi
}

# 宝塔 / OpenCloudOS 等常见：只有独立二进制 docker-compose，没有 compose 插件
# 统一走 compose()，兼容：docker compose 插件 / docker-compose 独立程序
COMPOSE_KIND=""
COMPOSE_BIN=""

compose() {
  case "$COMPOSE_KIND" in
    plugin) docker compose "$@" ;;
    standalone) "$COMPOSE_BIN" "$@" ;;
    *)
      err "内部错误：Compose 未初始化"
      return 1
      ;;
  esac
}

try_set_standalone() {
  local bin="$1"
  [[ -n "$bin" && -x "$bin" ]] || return 1
  if "$bin" version &>/dev/null || "$bin" --version &>/dev/null; then
    COMPOSE_KIND=standalone
    COMPOSE_BIN="$bin"
    info "Compose 独立程序: $("$bin" version --short 2>/dev/null || "$bin" --version 2>/dev/null | head -1) ($bin)"
    return 0
  fi
  return 1
}

install_compose_standalone() {
  local dest="/usr/local/bin/docker-compose"
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *)
      warn "未知架构 ${arch}，跳过自动安装 Compose"
      return 1
      ;;
  esac

  local ver="v2.29.7"
  local name="docker-compose-linux-${arch}"
  # 国内优先镜像，失败再回退 GitHub
  local urls=(
    "https://get.daocloud.io/docker/compose/releases/download/${ver}/${name}"
    "https://github.com/docker/compose/releases/download/${ver}/${name}"
  )

  info "正在自动安装 docker-compose ${ver} → ${dest}"
  local url tmp
  tmp="$(mktemp)"
  for url in "${urls[@]}"; do
    echo "  尝试: $url"
    if curl -fsSL --connect-timeout 15 --max-time 120 "$url" -o "$tmp"; then
      if [[ -s "$tmp" ]] && head -c 4 "$tmp" | grep -q $'\x7fELF'; then
        install -m 755 "$tmp" "$dest"
        rm -f "$tmp"
        try_set_standalone "$dest" && return 0
      fi
    fi
  done
  rm -f "$tmp"
  return 1
}

detect_compose() {
  # 1) 官方插件：docker compose
  if docker compose version &>/dev/null; then
    COMPOSE_KIND=plugin
    info "Compose 插件: $(docker compose version --short 2>/dev/null || docker compose version | head -1)"
    return 0
  fi

  # 2) PATH / 常见安装路径中的 docker-compose
  local cand
  for cand in \
    "$(command -v docker-compose 2>/dev/null || true)" \
    /usr/local/bin/docker-compose \
    /usr/bin/docker-compose \
    /www/server/docker/docker-compose \
    /usr/libexec/docker/cli-plugins/docker-compose
  do
    if try_set_standalone "$cand"; then
      return 0
    fi
  done

  # 3) root 下尝试自动安装独立二进制（宝塔 OpenCloudOS 常见缺插件）
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    warn "未找到 Compose，尝试自动安装独立 docker-compose…"
    if install_compose_standalone; then
      return 0
    fi
  fi

  err "未检测到 Docker Compose（插件与 docker-compose 均不可用）"
  echo "  请任选一种方式后重试："
  echo "  1) 宝塔 → Docker管理器 → 安装/启用 Compose"
  echo "  2) 插件: dnf/yum install -y docker-compose-plugin   或   apt install -y docker-compose-plugin"
  echo "  3) 一键装独立程序（推荐，OpenCloudOS/宝塔常用）:"
  echo "       curl -fsSL https://get.daocloud.io/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose"
  echo "       chmod +x /usr/local/bin/docker-compose && docker-compose version"
  exit 1
}

compose_cli() {
  if [[ "$COMPOSE_KIND" == "plugin" ]]; then
    echo "docker compose"
  else
    echo "docker-compose"
  fi
}

# 用 docker inspect 读健康状态，兼容旧版 compose 无 --format '{{.Health}}'
service_health() {
  local svc="$1"
  local cid
  cid="$(compose ps -q "$svc" 2>/dev/null | head -1 || true)"
  if [[ -z "$cid" ]]; then
    echo "missing"
    return 0
  fi
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null \
    || echo "unknown"
}

# restart: always 时崩溃容器不会停在 exited，需看 Restarting / RestartCount
service_crash_looping() {
  local svc="$1"
  local cid
  cid="$(compose ps -q "$svc" 2>/dev/null | head -1 || true)"
  [[ -n "$cid" ]] || return 1
  local status restarts
  status="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || true)"
  restarts="$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)"
  # Status=restarting：明确处于重启中
  if echo "$status" | grep -qi 'restarting'; then
    return 0
  fi
  # RestartCount 阈值略高，避免冷启动偶发重启误判；且必须仍探活失败
  if [[ "${restarts:-0}" -ge 5 ]] && ! curl -sf "${HEALTH_URL:-}" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

check_host_port() {
  local bind="$1" port="$2"
  local listeners=""
  if command -v ss &>/dev/null; then
    listeners="$(ss -ltn 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" {print $4}' || true)"
  elif command -v netstat &>/dev/null; then
    listeners="$(netstat -ltn 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" {print $4}' || true)"
  else
    return 0
  fi
  [[ -z "$listeners" ]] && return 0

  # 本项目 compose 已占用则忽略
  if compose ps -q app 2>/dev/null | grep -q .; then
    local app_ports
    app_ports="$(compose port app 3000 2>/dev/null || true)"
    if [[ "$app_ports" == *":${port}"* ]] || [[ "$app_ports" == *" ${port}"* ]]; then
      return 0
    fi
  fi

  err "端口 ${port} 已被占用（绑定目标 ${bind}:${port}），app 无法启动："
  echo "$listeners" | sed 's/^/    /'
  err "若非本项目容器，请修改 .env 中 APP_HOST_PORT，或停止占用进程后重试"
  return 1
}

ensure_docker_mirrors() {
  if [[ "$SKIP_MIRROR" -eq 1 ]]; then
    info "已跳过镜像加速配置（--skip-mirror）"
    return 0
  fi
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    warn "非 root，跳过写入镜像加速；若拉镜像失败请用 sudo 重跑本脚本"
    return 0
  fi

  mkdir -p /etc/docker
  local conf="/etc/docker/daemon.json"

  # 注意：不再因「已有 registry-mirrors」直接跳过——旧源可能已失效（2024 后公共源大量停服），
  # 必须幂等合并追加缺失的新源并重启 Docker，否则 BuildKit 仍直连 docker.io 导致构建极慢。
  if [[ -f "$conf" ]]; then
    # 已有自定义 daemon.json：尝试用 python 合并，避免整文件覆盖
    if command -v python3 &>/dev/null; then
      if python3 - "$conf" <<'PY'
import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    sys.exit(2)
mirrors = data.get("registry-mirrors") or []
# 国内镜像源多源 fallback：1panel.live 实测最稳（2026-08），其余保留作为备选
wanted = ["https://docker.1panel.live", "https://docker.1ms.run", "https://docker.xuanyuan.me", "https://docker.m.daocloud.io"]
changed = False
for m in wanted:
    if m not in mirrors:
        mirrors.append(m)
        changed = True
data["registry-mirrors"] = mirrors
data.setdefault("log-driver", "json-file")
opts = data.setdefault("log-opts", {})
opts.setdefault("max-size", "10m")
opts.setdefault("max-file", "3")
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("MERGED" if changed else "UNCHANGED")
PY
      then
        info "已向现有 daemon.json 合并 registry-mirrors（原配置保留）"
      else
        warn "现有 /etc/docker/daemon.json 无法自动合并，请手动添加 registry-mirrors（未覆盖原文件）"
        return 0
      fi
    else
      warn "已有 /etc/docker/daemon.json 且无 python3，跳过写入以免覆盖自定义配置"
      warn "请手动添加 registry-mirrors 后: systemctl restart docker"
      return 0
    fi
  else
    cat > "$conf" <<'DOCKERCONF'
{
  "registry-mirrors": [
    "https://docker.1panel.live",
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://docker.m.daocloud.io"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKERCONF
    info "已写入 Docker 镜像加速配置"
  fi

  if systemctl restart docker; then
    info "Docker 已重启以应用镜像加速"
    for _ in $(seq 1 30); do
      docker info &>/dev/null && break
      sleep 1
    done
  else
    warn "Docker 重启失败，请手动检查 /etc/docker/daemon.json"
  fi
}

env_get() {
  local key="$1"
  [[ -f .env ]] || return 1
  grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" .env 2>/dev/null \
    | head -1 \
    | sed -E "s/^[[:space:]]*(export[[:space:]]+)?${key}=//" \
    | sed -E 's/^["'\'']//;s/["'\'']$//'
}

env_set() {
  local key="$1" val="$2"
  if grep -qE "^[[:space:]]*(export[[:space:]]+)?${key}=" .env 2>/dev/null; then
    sed -i -E "s|^[[:space:]]*(export[[:space:]]+)?${key}=.*|${key}=${val}|" .env
  else
    printf '\n%s=%s\n' "$key" "$val" >> .env
  fi
}

env_ensure() {
  local key="$1" val="$2"
  local cur
  cur="$(env_get "$key" || true)"
  if [[ -z "${cur// }" ]]; then
    env_set "$key" "$val"
    info "已补齐缺失配置: ${key}"
  fi
}

rand_secret() {
  openssl rand -base64 48 | tr -d '+/=\n' | head -c 43
}

rand_pass() {
  openssl rand -base64 24 | tr -d '+/=\n' | head -c 24
}

is_http_url()  { [[ "$1" == http://* ]]; }
is_https_url() { [[ "$1" == https://* ]]; }

normalize_url() {
  echo "${1%/}"
}

domain_from_url() {
  echo "$1" | sed -E 's|^https?://||; s|/.*||'
}

check_disk() {
  local avail_kb
  avail_kb="$(df -Pk "$PROJECT_DIR" 2>/dev/null | awk 'NR==2{print $4}')"
  if [[ -z "$avail_kb" ]]; then
    warn "无法检测磁盘空间，继续执行"
    return 0
  fi
  if [[ "$avail_kb" -lt 4194304 ]]; then
    err "磁盘可用空间不足 4GB（当前约 $((avail_kb / 1024))MB），构建极易 ENOSPC 失败"
    echo "  可先执行: docker image prune -f && docker builder prune -af --filter until=168h"
    exit 1
  fi
  info "磁盘可用约 $((avail_kb / 1024 / 1024))GB"
}

dump_failure() {
  warn "部署未完全就绪，最近日志如下："
  echo ""
  compose ps 2>/dev/null || true
  echo ""
  echo "---- app (tail) ----"
  compose logs --tail=80 app 2>/dev/null || true
  echo ""
  echo "---- mongo (tail) ----"
  compose logs --tail=40 mongo 2>/dev/null || true
  echo ""
  echo "---- redis (tail) ----"
  compose logs --tail=20 redis 2>/dev/null || true
  echo ""
  warn "排查: compose logs -f app"
}

write_nginx_snippet() {
  local site_url="$1"
  local domain protocol proto_header
  domain="$(domain_from_url "$site_url")"
  if is_https_url "$site_url"; then
    protocol=https
    proto_header=https
  else
    protocol=http
    proto_header=http
  fi

  mkdir -p "$PROJECT_DIR/nginx"
  local out="$PROJECT_DIR/nginx/baota-proxy.conf"
  local app_port
  app_port="$(env_get APP_HOST_PORT 2>/dev/null || echo 3000)"
  [[ -n "${app_port// }" ]] || app_port=3000

  # 公共反代片段（WebSocket + Next）
  local proxy_common
  proxy_common=$(cat <<PROXY
        proxy_pass http://127.0.0.1:${app_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto ${proto_header};
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_buffering off;
PROXY
)

  if [[ "$protocol" == "https" ]]; then
    cat > "$out" <<NGINX
# 宝塔：网站 → 设置 → 配置文件（先申请 Let's Encrypt 证书）
# 若证书路径不同，以面板「SSL」页显示为准
server {
    listen 80;
    server_name ${domain};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    ssl_certificate /www/server/panel/vhost/cert/${domain}/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/${domain}/privkey.pem;

    client_max_body_size 50M;

    location /socket.io/ {
${proxy_common}
        proxy_read_timeout 86400;
    }

    location / {
${proxy_common}
        proxy_read_timeout 300s;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  else
    cat > "$out" <<NGINX
# 宝塔：网站 → 设置 → 配置文件（HTTP / IP 测试用，勿开强制 HTTPS）
server {
    listen 80;
    server_name ${domain};

    client_max_body_size 50M;

    location /socket.io/ {
${proxy_common}
        proxy_read_timeout 86400;
    }

    location / {
${proxy_common}
        proxy_read_timeout 300s;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
  fi

  echo "$out"
}

# ========================================================
# 0. 预检
# ========================================================
step "检查环境"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  warn "建议使用 root 运行（sudo bash scripts/bt-deploy.sh），否则可能无法写 /etc/docker 或重启 Docker"
fi

require_cmd docker
require_cmd openssl
require_cmd curl
info "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
detect_compose

check_disk

# ========================================================
# 配置 Docker 镜像加速（国内服务器必需）
# ========================================================
step "配置 Docker 镜像加速"
ensure_docker_mirrors

cd "$PROJECT_DIR"

# ============================================================
# 1. 生成 / 同步 .env
# ============================================================
if [[ ! -f ".env" ]]; then
  step "首次部署：生成配置"

  FRONTEND_URL="${FRONTEND_URL_ARG:-}"
  if [[ -z "$FRONTEND_URL" ]]; then
    if [[ "$ASSUME_YES" -eq 1 ]]; then
      err "首次部署必须传入站点 URL：sudo bash scripts/bt-deploy.sh https://你的域名"
      exit 1
    elif [[ -t 0 ]]; then
      # 宝塔终端等 Web 终端下 read 会阻塞；加 120s 超时避免永久卡死
      if ! read -r -t 120 -p "请输入站点完整 URL（如 https://dsoj.run 或 http://IP）: " FRONTEND_URL; then
        err "输入超时（120s）。请以参数形式传入：sudo bash scripts/bt-deploy.sh https://你的域名"
        exit 1
      fi
    else
      err "首次部署必须传入站点 URL：sudo bash scripts/bt-deploy.sh https://你的域名"
      exit 1
    fi
  fi
  FRONTEND_URL="$(normalize_url "$FRONTEND_URL")"
  if ! is_http_url "$FRONTEND_URL" && ! is_https_url "$FRONTEND_URL"; then
    err "URL 必须以 http:// 或 https:// 开头，当前: ${FRONTEND_URL}"
    exit 1
  fi

  PASS="$(rand_pass)"
  FORCE_SECURE=true
  if is_http_url "$FRONTEND_URL"; then
    FORCE_SECURE=false
    warn "检测到 HTTP 站点：FORCE_SECURE_COOKIE=false（浏览器才能保存登录 Cookie）"
  fi

  cat > .env <<EOF
NODE_ENV=production
TZ=Asia/Shanghai
PORT=3000
DATABASE_URL=mongodb://ojuser:${PASS}@mongo:27017/oj_platform?authSource=oj_platform&replicaSet=rs0
JWT_SECRET=$(rand_secret)
ENCRYPTION_KEY=$(rand_secret)
REDIS_URL=redis://:${PASS}@redis:6379
FRONTEND_URL=${FRONTEND_URL}
NEXT_PUBLIC_API_URL=${FRONTEND_URL}
NEXT_PUBLIC_BASE_URL=${FRONTEND_URL}
TRUSTED_PROXIES=1
FORCE_SECURE_COOKIE=${FORCE_SECURE}
JUDGE_COMPILE_TIMEOUT=20000
JUDGE_JOB_TIMEOUT=300
JUDGE_EXTRA_TIME_RATIO=0
JUDGE_REJUDGE_TIMES=1
JUDGE_MAX_CONCURRENT=1
JUDGE_CASE_CONCURRENCY=3
JUDGE_LARGE_CASE_CONCURRENCY=3
LOG_LEVEL=info
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=${PASS}
MONGO_APP_USER=ojuser
MONGO_APP_PASSWORD=${PASS}
REDIS_PASSWORD=${PASS}
APP_HOST_BIND=127.0.0.1
APP_HOST_PORT=3000
EOF
  chmod 600 .env
  info ".env 已生成（FORCE_SECURE_COOKIE=${FORCE_SECURE}）"
else
  step "同步已有 .env"
  info ".env 已存在"

  if [[ -n "$FRONTEND_URL_ARG" ]]; then
    FRONTEND_URL="$(normalize_url "$FRONTEND_URL_ARG")"
    if ! is_http_url "$FRONTEND_URL" && ! is_https_url "$FRONTEND_URL"; then
      err "URL 必须以 http:// 或 https:// 开头"
      exit 1
    fi
    old_url="$(env_get FRONTEND_URL || true)"
    env_set FRONTEND_URL "$FRONTEND_URL"
    env_set NEXT_PUBLIC_API_URL "$FRONTEND_URL"
    env_set NEXT_PUBLIC_BASE_URL "$FRONTEND_URL"
    if is_http_url "$FRONTEND_URL"; then
      env_set FORCE_SECURE_COOKIE false
      env_set NODE_ENV production
      warn "已切换为 HTTP：FORCE_SECURE_COOKIE=false"
    else
      env_set FORCE_SECURE_COOKIE true
      env_set NODE_ENV production
      info "已切换为 HTTPS：FORCE_SECURE_COOKIE=true"
    fi
    if [[ -n "$old_url" && "$old_url" != "$FRONTEND_URL" ]]; then
      warn "FRONTEND_URL: ${old_url} → ${FRONTEND_URL}（NEXT_PUBLIC_* 需重建镜像才生效）"
      if [[ "$NO_BUILD" -eq 1 ]]; then
        warn "--no-build 与换域名冲突：将强制重新构建"
        NO_BUILD=0
      fi
    fi
  fi

  env_ensure TZ Asia/Shanghai
  env_ensure NODE_ENV production
  env_ensure TRUSTED_PROXIES 1
  env_ensure LOG_LEVEL info
  env_ensure JUDGE_MAX_CONCURRENT 1
  env_ensure JUDGE_CASE_CONCURRENCY 3
  env_ensure JUDGE_LARGE_CASE_CONCURRENCY 3
  env_ensure APP_HOST_BIND 127.0.0.1
  env_ensure APP_HOST_PORT 3000

  if [[ -z "$(env_get JWT_SECRET || true)" ]]; then
    env_set JWT_SECRET "$(rand_secret)"
  fi
  if [[ -z "$(env_get ENCRYPTION_KEY || true)" ]]; then
    env_set ENCRYPTION_KEY "$(rand_secret)"
  fi

  for k in MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD REDIS_PASSWORD; do
    if [[ -z "$(env_get "$k" || true)" ]]; then
      err ".env 缺少 ${k}。请勿手工删密码字段；若已丢失需对照旧备份恢复或重建数据卷"
      exit 1
    fi
  done

  if [[ -z "$(env_get REDIS_URL || true)" ]]; then
    rp="$(env_get REDIS_PASSWORD)"
    env_set REDIS_URL "redis://:${rp}@redis:6379"
  fi
  if [[ -z "$(env_get DATABASE_URL || true)" ]]; then
    mu="$(env_get MONGO_APP_USER || echo ojuser)"
    mp="$(env_get MONGO_APP_PASSWORD)"
    env_set DATABASE_URL "mongodb://${mu}:${mp}@mongo:27017/oj_platform?authSource=oj_platform&replicaSet=rs0"
  fi

  cur_fe="$(env_get FRONTEND_URL || true)"
  cur_secure="$(env_get FORCE_SECURE_COOKIE || true)"
  if is_https_url "${cur_fe:-}" && [[ "$cur_secure" == "false" ]]; then
    warn "检测到 HTTPS 却 FORCE_SECURE_COOKIE=false，已自动改为 true"
    env_set FORCE_SECURE_COOKIE true
  fi
  if is_http_url "${cur_fe:-}" && [[ "$cur_secure" != "false" ]]; then
    warn "检测到 HTTP 却未关闭 Secure Cookie，已自动 FORCE_SECURE_COOKIE=false（否则无法登录）"
    env_set FORCE_SECURE_COOKIE false
  fi
fi

FRONTEND_URL="$(env_get FRONTEND_URL)"
if [[ -z "$FRONTEND_URL" ]]; then
  err ".env 中 FRONTEND_URL 为空"
  exit 1
fi

# ============================================================
# 2. 生成 MongoDB KeyFile（仅首次）
# ============================================================
step "准备 MongoDB KeyFile"
if [[ ! -f "mongo-keyfile" ]]; then
  openssl rand -base64 512 | tr -d '\n' > mongo-keyfile
  info "MongoDB KeyFile 已生成"
fi
chmod 600 mongo-keyfile
if [[ ! -s mongo-keyfile ]]; then
  err "mongo-keyfile 为空，请删除后重跑脚本"
  exit 1
fi

# ============================================================
# 3. 拉取基础镜像 + 构建应用
# ============================================================
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

step "拉取基础镜像"
if ! compose pull mongo redis; then
  warn "基础镜像拉取失败，将尝试使用本地已有镜像继续"
fi

if [[ "$NO_BUILD" -eq 1 ]]; then
  step "跳过构建（--no-build）"
else
  step "构建应用镜像（首次约 5-10 分钟；BuildKit 缓存可大幅加速后续构建）"
  if ! compose build app; then
    err "应用镜像构建失败"
    echo "  常见原因: 磁盘不足 / 镜像源超时 / 网络中断"
    echo "  清理: docker image prune -f && df -h"
    exit 1
  fi
fi

# ============================================================
# 4. 清理 Docker 构建垃圾（防止磁盘被撑满）
# ============================================================
step "清理 Docker 悬空资源"
docker image prune -f >/dev/null || true
# 仅清理本项目（compose 项目名）的 stopped 容器，避免误删宝塔上其他项目的容器
PROJECT_NAME="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]')"
docker container prune -f --filter "label=com.docker.compose.project=${PROJECT_NAME}" >/dev/null 2>&1 || \
  docker container prune -f --filter "label=com.docker.compose.project=$(basename "$PROJECT_DIR")" >/dev/null 2>&1 || true
if [[ "$DO_PRUNE" -eq 1 ]]; then
  docker builder prune -af --filter "until=168h" >/dev/null 2>&1 || true
  info "已清理悬空镜像/容器，并清理 7 天前 BuildKit 缓存（--prune）"
else
  info "已清理悬空镜像/容器（保留 BuildKit 缓存；需要深度清理请加 --prune）"
fi

# ============================================================
# 5. 启动服务（先依赖，再 app）
# ============================================================
step "启动服务"
APP_PORT="$(env_get APP_HOST_PORT || echo 3000)"
APP_BIND="$(env_get APP_HOST_BIND || echo 127.0.0.1)"
# 端口被非本项目进程占用：直接失败（避免 compose up 绑定失败后才报错）
check_host_port "$APP_BIND" "$APP_PORT" || exit 1

compose up -d mongo redis
echo -n "等待 mongo/redis healthy"
dep_ok=0
# 从 .env 读 root 账号供回退探测。
# export 后经 compose exec -e（不带值，继承本进程环境）注入容器，mongosh 在 --eval 内
# 通过 process.env 读取密码并 db.auth() 认证，密码不进入任何 ps 命令行参数。
MONGO_ROOT_USER="$(env_get MONGO_ROOT_USER || echo admin)"
MONGO_ROOT_PASSWORD="$(env_get MONGO_ROOT_PASSWORD || true)"
export MONGO_ROOT_USER MONGO_ROOT_PASSWORD
for i in $(seq 1 60); do
  mongo_h="$(service_health mongo)"
  redis_h="$(service_health redis)"
  if [[ "$mongo_h" == "healthy" && "$redis_h" == "healthy" ]]; then
    echo ""
    info "mongo / redis 已 healthy"
    dep_ok=1
    break
  fi
  if [[ -n "$MONGO_ROOT_PASSWORD" ]] \
     && timeout 10 compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping' 2>/dev/null | grep -q PONG \
     && timeout 15 compose exec -T -e MONGO_ROOT_USER -e MONGO_ROOT_PASSWORD mongo mongosh --quiet --eval 'const pwd = process.env.MONGO_ROOT_PASSWORD; const admin = db.getSiblingDB("admin"); admin.auth(process.env.MONGO_ROOT_USER, pwd) && db.adminCommand("ping").ok' 2>/dev/null | grep -q 1; then
    echo ""
    info "mongo / redis 可连通（health 字段可能暂不可用：mongo=${mongo_h} redis=${redis_h}）"
    dep_ok=1
    break
  fi
  echo -n "."
  sleep 3
done
echo ""
if [[ "$dep_ok" -ne 1 ]]; then
  warn "mongo/redis 等待超时（mongo=$(service_health mongo) redis=$(service_health redis)），仍继续启动 app"
  compose logs --tail=30 mongo redis || true
fi

# 重启前检测进行中的评测（app 重启会清空内存队列，进行中的提交将被标记为 SE）
# 仅当 app 已在运行且 DB 可查时检测
if compose ps -q app 2>/dev/null | grep -q .; then
  ACTIVE_CNT="$(timeout 30 compose exec -T -e MONGO_ROOT_USER -e MONGO_ROOT_PASSWORD mongo mongosh --quiet \
    --eval 'const pwd = process.env.MONGO_ROOT_PASSWORD; const admin = db.getSiblingDB("admin"); admin.auth(process.env.MONGO_ROOT_USER, pwd); try { print(db.getSiblingDB("oj_platform").Submission.countDocuments({status:{$in:["PENDING","JUDGING","RUNNING"]}})) } catch(e) { print("?") }' 2>/dev/null | tr -d '\r' || true)"
  if [[ "$ACTIVE_CNT" =~ ^[0-9]+$ ]] && [[ "$ACTIVE_CNT" -gt 0 ]]; then
    warn "检测到 ${ACTIVE_CNT} 个进行中的评测；重启 app 将中断它们并标记为 SE（系统错误），需用户重新提交"
    if [[ "$ASSUME_YES" -eq 1 ]]; then
      info "已自动确认继续（--yes）"
    elif [[ -t 0 ]]; then
      # 宝塔终端等 Web 终端下 read 无超时会永久阻塞，导致终端卡死
      # 60s 超时后默认取消（安全侧），避免意外中断评测
      if ! read -r -t 60 -p "确认继续重启？(y/N) " ans; then
        warn "输入超时（60s），已取消部署。如需自动确认请使用: sudo bash scripts/bt-deploy.sh --yes"
        exit 0
      fi
      if [[ ! "$ans" =~ ^[yY]$ ]]; then
        info "已取消部署"
        exit 0
      fi
    fi
  fi
fi

compose up -d

# ============================================================
# 6. 等待健康检查
# ============================================================
step "等待应用就绪"
HEALTH_URL="http://127.0.0.1:${APP_PORT}/healthcheck-static"
DB_HEALTH_URL="http://127.0.0.1:${APP_PORT}/api/health/db"

echo -n "探测 ${HEALTH_URL}"
ready=0
for i in $(seq 1 90); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    echo ""
    info "应用已就绪（/healthcheck-static）"
    ready=1
    break
  fi
  app_state="$(service_health app)"
  if [[ "$app_state" == "exited" || "$app_state" == "dead" ]]; then
    echo ""
    err "app 容器已退出"
    dump_failure
    exit 1
  fi
  # 第 5 轮起再判崩溃循环，避免误伤冷启动（start_period / 首次依赖就绪）
  if [[ "$i" -ge 5 ]] && service_crash_looping app; then
    echo ""
    err "app 疑似崩溃重启循环（Status=restarting 或 RestartCount≥5），停止空等"
    dump_failure
    exit 1
  fi
  echo -n "."
  sleep 3
done
echo ""

if [[ "$ready" -ne 1 ]]; then
  dump_failure
  exit 1
fi

# 修复评测卷属主（幂等）：卷首次挂载时目录属主为 root，评测进程（nextjs uid=1001）
# 无法写入 data/testdata 缓存，导致大测点每次回源 Mongo、性能异常。
# 直接以 root 在 app 容器内对可写卷目录 chown（app 镜像已装 coreutils，无需额外镜像）。
# /app/temp 是 tmpfs 挂载，uid/gid 已在 docker-compose.yml 中指定，无需 chown。
if timeout 60 compose exec -T -u root app chown -R 1001:1001 /app/data /app/public/uploads 2>/dev/null; then
  info "已修复评测卷属主（app_testdata / app_uploads → nextjs 1001）"
else
  warn "自动修复评测卷属主失败，请手动执行："
  echo "  docker compose exec -u root app chown -R 1001:1001 /app/data /app/public/uploads"
fi

if curl -sf "$DB_HEALTH_URL" >/dev/null 2>&1; then
  info "数据库健康检查通过（/api/health/db）"
else
  warn "数据库探针暂未通过: curl -sf ${DB_HEALTH_URL}"
  warn "若刚完成首次初始化，可再等 30 秒后重试"
fi

# ============================================================
# 7. 输出宝塔 Nginx 配置
# ============================================================
SNIPPET="$(write_nginx_snippet "$FRONTEND_URL")"
DOMAIN="$(domain_from_url "$FRONTEND_URL")"
COMPOSE_HINT="$(compose_cli)"

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  Docker 服务已启动${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo -e "  站点 URL:   ${GREEN}${FRONTEND_URL}${NC}"
echo -e "  本机探测:   ${GREEN}${HEALTH_URL}${NC}"
echo -e "  监听绑定:   ${APP_BIND}:${APP_PORT} → 容器 3000"
echo ""
echo -e "  容器状态:"
compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || compose ps
echo ""
echo -e "  ${BOLD}首次使用：浏览器打开站点 → 注册首个账号（自动成为系统管理员）${NC}"
echo -e "  ${YELLOW}说明: 空库时即使后台关闭了「开放注册」，登录页仍会显示「创建管理员账号」入口${NC}"
echo ""

if is_https_url "$FRONTEND_URL"; then
  echo -e "  ${BOLD}下一步：在宝塔配置 Nginx + SSL${NC}"
  echo "  1) 网站 → 添加站点 → 域名 ${DOMAIN}"
  echo "  2) SSL → Let's Encrypt → 申请证书"
  echo "  3) 设置 → 配置文件 → 粘贴下面内容（或直接打开文件）："
else
  echo -e "  ${BOLD}下一步：在宝塔配置 Nginx（HTTP）${NC}"
  echo "  1) 网站 → 添加站点 → 域名填 ${DOMAIN}（或服务器 IP）"
  echo "  2) 不要强制 HTTPS；设置 → 配置文件 → 粘贴下面内容"
  echo "  3) 备案完成后执行: sudo bash scripts/bt-deploy.sh https://你的域名"
fi
echo ""
echo -e "  配置文件已写入: ${CYAN}${SNIPPET}${NC}"
echo -e "  ${YELLOW}注意: 反代端口为 ${APP_PORT}（与 .env APP_HOST_PORT 一致）${NC}"
echo -e "${CYAN}────────────────── 配置预览 ──────────────────${NC}"
cat "$SNIPPET"
echo -e "${CYAN}────────────────── 预览结束 ──────────────────${NC}"

echo ""
echo -e "  ${BOLD}常用命令:${NC}"
echo -e "    cd ${PROJECT_DIR}"
echo -e "    ${COMPOSE_HINT} logs -f app"
echo -e "    sudo bash scripts/bt-deploy.sh                 # 升级（git pull 后）"
echo -e "    sudo bash scripts/bt-deploy.sh --yes           # 跳过交互确认（宝塔终端推荐）"
echo -e "    sudo bash scripts/bt-deploy.sh --no-build      # 仅重启"
echo -e "    sudo bash scripts/bt-deploy.sh --prune         # 升级并深度清理构建缓存"
echo -e "    sudo bash scripts/bt-deploy.sh https://域名    # 切域名并重建"
echo ""
if [[ "$COMPOSE_KIND" == "standalone" ]]; then
  echo -e "  ${YELLOW}提示: 本机使用 docker-compose 独立程序；脚本已自动兼容。${NC}"
  echo ""
fi
