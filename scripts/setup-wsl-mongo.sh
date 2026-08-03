#!/usr/bin/env bash
# 在 WSL Ubuntu 中安装并启动 MongoDB 8（单节点副本集 rs0）
# 默认使用清华镜像加速；可用环境变量覆盖：
#   MONGODB_APT_MIRROR=https://mirrors.aliyun.com/mongodb/apt/ubuntu
# 用法：
#   bash scripts/setup-wsl-mongo.sh
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "请在 WSL Ubuntu 内运行本脚本，不要在 Windows PowerShell 里跑。"
  exit 1
fi

echo "==> 检测发行版..."
. /etc/os-release
echo "    $PRETTY_NAME"
CODENAME="${VERSION_CODENAME:-noble}"
# 清华 / 阿里云 对 noble 的 mongodb 路径与官方一致
MIRROR="${MONGODB_APT_MIRROR:-https://mirrors.tuna.tsinghua.edu.cn/mongodb/apt/ubuntu}"

echo "==> 使用镜像: $MIRROR"

echo "==> 安装依赖（需要 sudo 密码）..."
sudo apt-get update -qq
sudo apt-get install -y curl gnupg ca-certificates

# 若上次卡在官方源半下载，先清掉残留锁/半成品，避免干扰
sudo killall apt-get apt 2>/dev/null || true
sudo rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock 2>/dev/null || true
sudo dpkg --configure -a 2>/dev/null || true

if [[ ! -f /usr/share/keyrings/mongodb-server-8.0.gpg ]]; then
  # GPG 仍从官方拉（很小）；失败则试镜像旁路
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor \
    || curl -fsSL "${MIRROR%/ubuntu}/apt/ubuntu/doc/server-8.0.asc" \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
fi

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] ${MIRROR} ${CODENAME}/mongodb-org/8.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null

echo "==> apt update + 安装 mongodb-org（镜像）..."
sudo apt-get update -qq
sudo apt-get install -y mongodb-org

echo "==> 配置数据目录与 mongod.conf..."
sudo mkdir -p /var/lib/mongodb /var/log/mongodb
if id mongodb &>/dev/null; then
  sudo chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb
  MONGO_USER=mongodb
else
  sudo chown -R "$(whoami):$(whoami)" /var/lib/mongodb /var/log/mongodb
  MONGO_USER="$(whoami)"
fi

sudo tee /etc/mongod.conf >/dev/null <<EOF
storage:
  dbPath: /var/lib/mongodb
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
replication:
  replSetName: rs0
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
EOF

echo "==> 启动 mongod..."
if command -v systemctl >/dev/null && systemctl is-system-running --quiet 2>/dev/null; then
  sudo systemctl enable mongod
  sudo systemctl restart mongod
  sleep 2
  sudo systemctl --no-pager --full status mongod | head -20 || true
else
  echo "    systemd 不可用，改为后台进程启动..."
  if pgrep -x mongod >/dev/null; then
    echo "    mongod 已在运行"
  else
    if id mongodb &>/dev/null; then
      sudo -u mongodb mongod --config /etc/mongod.conf --fork
    else
      mongod --config /etc/mongod.conf --fork
    fi
  fi
fi

echo "==> 初始化单节点副本集 rs0（若已初始化会跳过）..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; then
    break
  fi
  echo "    等待 mongod 就绪 ($i/10)..."
  sleep 1
done

mongosh --quiet <<'EOF' || true
try {
  const s = rs.status();
  print("副本集已存在:", s.set);
} catch (e) {
  print("初始化 rs.initiate() ...");
  rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: "127.0.0.1:27017" }]
  });
}
EOF

sleep 2
mongosh --quiet --eval 'rs.status().ok' || true

echo
echo "============================================"
echo " MongoDB (WSL) 已就绪"
echo " DATABASE_URL=mongodb://127.0.0.1:27017/oj_platform?replicaSet=rs0&directConnection=true"
echo "============================================"
