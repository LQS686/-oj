#!/bin/bash
# MongoDB 容器 entrypoint wrapper
# 1. 准备 keyFile（优先使用宿主机挂载的 /tmp/mongo-keyfile）
# 2. 启动 mongod
# 3. 每次启动确保副本集 rs0 已 initiate 且本节点为 PRIMARY
#    （docker-entrypoint-initdb.d 仅在空数据卷首次执行，体积已存在时不会跑 init-mongo.js）

set -euo pipefail

KEYFILE_DIR="/etc/mongo"
KEYFILE="$KEYFILE_DIR/keyfile"
HOST_KEYFILE="/tmp/mongo-keyfile"

mkdir -p "$KEYFILE_DIR"

if [ -f "$HOST_KEYFILE" ]; then
  # 从只读挂载复制，保证 mongodb 用户可读且权限为 400
  cp "$HOST_KEYFILE" "$KEYFILE"
  chmod 400 "$KEYFILE"
  chown mongodb:mongodb "$KEYFILE" 2>/dev/null || true
  echo "Using host-mounted MongoDB replica set keyfile"
elif [ ! -f "$KEYFILE" ]; then
  echo "Generating MongoDB replica set keyfile..."
  openssl rand -base64 756 > "$KEYFILE"
  chmod 400 "$KEYFILE"
  chown mongodb:mongodb "$KEYFILE" 2>/dev/null || true
fi

# 后台启动官方 entrypoint（勿 exec，否则无法做副本集自愈）
docker-entrypoint.sh "$@" &
mongo_pid=$!

shutdown() {
  if kill -0 "$mongo_pid" 2>/dev/null; then
    kill "$mongo_pid" 2>/dev/null || true
    wait "$mongo_pid" 2>/dev/null || true
  fi
}
trap shutdown EXIT INT TERM

mongosh_try() {
  # 无认证（首次初始化窗口）或 root 认证
  if mongosh --quiet --eval "$1" >/dev/null 2>&1; then
    return 0
  fi
  if [[ -n "${MONGO_INITDB_ROOT_USERNAME:-}" && -n "${MONGO_INITDB_ROOT_PASSWORD:-}" ]]; then
    mongosh --quiet \
      -u "$MONGO_INITDB_ROOT_USERNAME" \
      -p "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "$1" >/dev/null 2>&1
    return $?
  fi
  return 1
}

echo "[mongo-init] waiting for mongod to accept connections..."
ready=0
for _ in $(seq 1 90); do
  if mongosh_try 'db.adminCommand({ ping: 1 })'; then
    ready=1
    break
  fi
  # 进程已死则立刻失败
  if ! kill -0 "$mongo_pid" 2>/dev/null; then
    echo "[mongo-init] mongod exited unexpectedly"
    wait "$mongo_pid" || true
    exit 1
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "[mongo-init] mongod did not become reachable in time"
  exit 1
fi

# 确保副本集：未初始化则 initiate；host 不对则 reconfig（常见于旧卷用了 localhost）
ENSURE_RS_JS='
(function () {
  const desiredHost = "mongo:27017";
  try {
    const st = rs.status();
    if (st && st.ok) {
      try {
        const cfg = rs.conf();
        const m0 = cfg.members && cfg.members[0];
        if (m0 && m0.host !== desiredHost) {
          print("[mongo-init] fixing member host: " + m0.host + " -> " + desiredHost);
          m0.host = desiredHost;
          rs.reconfig(cfg, { force: true });
        } else {
          print("[mongo-init] replica set already configured");
        }
      } catch (e) {
        print("[mongo-init] rs.conf/reconfig skipped: " + e);
      }
      return;
    }
  } catch (e) {
    // not yet initialized
  }
  print("[mongo-init] initiating replica set rs0...");
  rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: desiredHost }],
  });
})();
'

run_ensure_rs() {
  if mongosh --quiet --eval "$ENSURE_RS_JS" 2>/dev/null; then
    return 0
  fi
  if [[ -n "${MONGO_INITDB_ROOT_USERNAME:-}" && -n "${MONGO_INITDB_ROOT_PASSWORD:-}" ]]; then
    mongosh --quiet \
      -u "$MONGO_INITDB_ROOT_USERNAME" \
      -p "$MONGO_INITDB_ROOT_PASSWORD" \
      --authenticationDatabase admin \
      --eval "$ENSURE_RS_JS"
    return $?
  fi
  return 1
}

if ! run_ensure_rs; then
  echo "[mongo-init] WARN: failed to ensure replica set (will keep mongod up; app may 503 until PRIMARY)"
else
  echo "[mongo-init] waiting for PRIMARY..."
  primary=0
  for _ in $(seq 1 60); do
    if mongosh_try 'quit(db.hello().isWritablePrimary ? 0 : 1)'; then
      primary=1
      break
    fi
    sleep 1
  done
  if [[ "$primary" -eq 1 ]]; then
    echo "[mongo-init] replica set PRIMARY ready"
  else
    echo "[mongo-init] WARN: PRIMARY not ready within 60s"
  fi
fi

# ============================================================
# 确保 oj_platform 应用用户存在（每次启动都校验，幂等）
# 背景：docker-entrypoint-initdb.d/init-mongo.js 仅在空数据卷首次执行；
#       若首启时副本集尚未 PRIMARY、或卷已存在残留数据，ojuser 不会被创建，
#       导致 Prisma 抛 SCRAM AuthenticationFailed → 全站 500/503。
#       此处由 mongo-init.sh 每次启动后兜底补建。
# ============================================================
if [[ -n "${MONGO_INITDB_ROOT_USERNAME:-}" && -n "${MONGO_INITDB_ROOT_PASSWORD:-}" \
      && -n "${MONGO_APP_USER:-}" && -n "${MONGO_APP_PASSWORD:-}" ]]; then
  ENSURE_APP_USER_JS='
(function () {
  const appDb = db.getSiblingDB("oj_platform");
  const appUser = process.env.MONGO_APP_USER;
  const appPwd = process.env.MONGO_APP_PASSWORD;
  // 幂等：已存在则 updateUser，否则 createUser
  const existing = appDb.getUser(appUser);
  if (existing) {
    appDb.updateUser(appUser, { pwd: appPwd, roles: [{ role: "readWrite", db: "oj_platform" }] });
    print("[mongo-init] app user updated: " + appUser);
  } else {
    appDb.createUser({
      user: appUser,
      pwd: appPwd,
      roles: [{ role: "readWrite", db: "oj_platform" }]
    });
    print("[mongo-init] app user created: " + appUser);
  }
})();
'
  if mongosh --quiet \
    -u "$MONGO_INITDB_ROOT_USERNAME" \
    -p "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "$ENSURE_APP_USER_JS" 2>&1 | grep -E "app user (created|updated)"; then
    :
  else
    echo "[mongo-init] WARN: failed to ensure app user (may need PRIMARY); app may fail until next restart"
  fi
fi

trap - EXIT INT TERM
wait "$mongo_pid"
