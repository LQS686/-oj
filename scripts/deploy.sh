#!/usr/bin/env bash
# ============================================================
# ⚠️ 已废弃：旧版云服务器一键部署脚本已移除。
#
# 请改用：
#   宝塔 / 完整 Docker 部署：sudo bash scripts/bt-deploy.sh https://你的域名
#   仅拉起重栈（已有 Docker）：docker compose up -d --build
#
# 旧脚本会安装系统包、硬编码 Git 仓库并可能在确认后 rm -rf 项目目录，
# 与当前 Docker/Prisma/内存保护流程不一致，保留执行入口容易造成误操作。
# ============================================================
set -euo pipefail
cat <<'MSG'
[✗] scripts/deploy.sh 已废弃并停止执行。

请使用：
  宝塔 / 完整 Docker 部署：sudo bash scripts/bt-deploy.sh https://你的域名
  已有 Docker 环境：      docker compose up -d --build

数据库结构请在启动应用前同步：
  docker compose run --rm --no-deps app /opt/prisma-cli/node_modules/.bin/prisma db push --skip-generate
MSG
exit 1
