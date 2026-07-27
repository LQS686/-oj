# WSL + Docker 本地开发指南

本项目**不支持 Windows 宿主本地评测**。请在 **WSL Ubuntu** 中运行应用与评测（`runner.sh` 或 `docker compose`）。

可用 Cursor 在 Windows 侧编辑源码，但 Node / 评测进程必须跑在 WSL 或容器内。两边目录**不会自动同步**。

## 推荐：WSL 内 Docker Compose（完整栈）

与生产最接近，维护面最小：

```bash
# 在 WSL 中进入仓库（可用 ~/dsoj 副本，或 /mnt/e/... 仅作源码）
cd ~/dsoj   # 或先 rsync：bash scripts/setup-wsl-app.sh

cp -n .env.example .env
# 编辑 JWT_SECRET / ENCRYPTION_KEY / MONGO_* / REDIS_PASSWORD 等

# 首次需 mongo keyfile（若 compose 要求）
# openssl rand -base64 512 | tr -d '\n' > mongo-keyfile && chmod 600 mongo-keyfile

docker compose up -d --build
docker compose logs -f app
```

浏览器访问 http://localhost:3000 。评测在 **Linux 容器**内通过 `runner.sh` 执行。

---

## 备选：WSL 内 `npm run dev`（热更新）

适合改前端/API 时快速迭代。评测仍走 Linux `runner.sh`，**不要**在 Windows PowerShell 里 `npm run dev`。

### 两套目录

| 路径 | 用途 |
|------|------|
| `E:\桌面\dsoj`（WSL 内 `/mnt/e/桌面/dsoj`） | Cursor 编辑；**编辑以这里为准** |
| `~/dsoj` | WSL 运行副本；**`npm run dev` / `docker compose` 建议在这里** |

为什么复制到家目录：在 `/mnt/e` 上跑 `node_modules` 又慢又容易坏；评测需要 Linux 原生文件系统。

相关脚本：

- `scripts/setup-wsl-mongo.sh` — 安装并启动 WSL 内 MongoDB（副本集 `rs0`）
- `scripts/setup-wsl-app.sh` — 把 Windows 源码 rsync 到 `~/dsoj` 并 `npm install`
- `scripts/wsl-dev.ps1` / `wsl-dev.cmd` — Windows 侧一键：同步 → WSL 内 `npm run dev`
- `scripts/wsl-dev.sh` — 上述流程的 WSL 内实现

### Windows 一键同步并启动

```powershell
.\scripts\wsl-dev.ps1
.\scripts\wsl-dev.ps1 -Full      # 强制 npm install
.\scripts\wsl-dev.ps1 -SyncOnly  # 只同步
```

等价：`bash scripts/wsl-dev.sh`（可选 `--full` / `--sync-only`）。

### 日常三条

1. 在 Cursor 改 `E:\桌面\dsoj`。
2. 同步到 `~/dsoj`（`wsl-dev` 或 `setup-wsl-app.sh`）。
3. 在 WSL 的 `~/dsoj` 跑 `npm run dev` 或 `docker compose up`。

---

## 评测相关注意

- **仅 Linux**：Windows 宿主调用评测会直接报错并提示改用 WSL/Docker。
- **默认关闭 ASan/UBSan**（对齐洛谷/HOJ）。严检：`JUDGE_ENABLE_ASAN=true`。
- Linux 跑测使用原生 `<in >out` 重定向；大输出题（如 LP3383）更快。
- **fail-fast（默认 off）**：默认跑完全部测点；不因 TLE/WA 跳过。仅当显式 `JUDGE_FAIL_FAST=hard|all` 时提前中止。
- **CPU 硬限**与墙钟分离：大 I/O 题墙钟可因输出体积放宽，但暴力解仍按 `timeLimit+extra` 尽快杀掉单点，避免单点拖满墙钟裕量。- 测点并行：超过体积阈值的测点占用「大测点槽位」（默认最多 2 路）。
- 改完 `lib/judge/*.ts` / `runner.sh` 后：`npm run dev` 一般热更新；异常则重启。Docker 路径需重建/重启容器。

---

## 快速自检

1. 改的是 `E:\桌面\dsoj` 还是误改了 `~/dsoj`？
2. 是否已 rsync 到 `~/dsoj`？
3. `npm run dev` / `docker compose` 的 cwd 是否在 WSL Linux 文件系统？
4. 是否误在 Windows 宿主直接跑了评测（会报错）？

对比文件是否已同步：

```bash
diff -q /mnt/e/桌面/dsoj/lib/judge/runner.sh ~/dsoj/lib/judge/runner.sh
```

---

## 已移除（勿再使用）

- Windows 本地 `win-runner` / `ALLOW_LOCAL_JUDGE_ON_WINDOWS`
- `scripts/local-dev.ps1`、`scripts/deploy.ps1`（请用 WSL/Linux 的 `deploy.sh` 或 `docker compose`）
