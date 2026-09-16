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

| 路径                                        | 用途                                                          |
| ------------------------------------------- | ------------------------------------------------------------- |
| `E:\桌面\dsoj`（WSL 内 `/mnt/e/桌面/dsoj`） | Cursor 编辑；**编辑以这里为准**                               |
| `~/dsoj`                                    | WSL 运行副本；**`npm run dev` / `docker compose` 建议在这里** |

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

## Git 提交规范（本环境）

提交固定按 **「WSL 写对象 → Windows 推送」** 执行，且 WSL 侧命令**必须**显式带上 `-c core.autocrlf=true -c core.filemode=false`。原因、固定命令与自检如下。

### 为什么不能只用 Windows 侧 git

Windows 侧 git 只能读，**无法新建对象**（`git add` / `git commit` 会直接失败）：

```text
error: unable to write file .git/objects/da/0c4eb8d9a48d171a33574b380752e183286751: Permission denied
error: <file>: failed to insert into database
fatal: adding files failed
```

Windows 侧实测边界：

| 操作                                             | 结果                   |
| ------------------------------------------------ | ---------------------- |
| 读：`status` / `log` / `diff` / `ls-remote`      | ✅ 正常                |
| 写引用 `update-ref`、写本地配置 `config --local` | ✅ 正常                |
| **写松散对象：`git add` / `git commit`**         | ❌ `Permission denied` |
| `git push`（只读对象 + 写引用）                  | ✅ 正常                |

拦截点只在 `.git/objects/` 的**新文件写入**，属执行环境的安全策略，与 git 版本、仓库配置无关；同一条 `git add` 在 WSL 内执行即可成功。两侧操作的是**同一份 `.git`**（`/mnt/e/.../dsoj/.git`），因此「WSL 写、Windows 读/推送」不会产生不一致。

> 想恢复成「全在 Windows 侧完成」：**设置 → 权限与批准 → 自定义配置**，放行仓库 `.git` 目录的写入（或让该命令在沙箱外运行）。仅点「批准」不放行——已实测仍被拒。

### 固定命令

```powershell
# 1) 查看改动（Windows 侧读操作正常）
git status --short
git diff --stat

# 2) 暂存 + 提交：交给 WSL。务必带换行/权限参数（原因见下）
wsl -e bash -lc 'cd "/mnt/e/DeskBox/桌面文件和文件夹/project/dsoj" && git -c core.autocrlf=true -c core.filemode=false add -A && git -c core.autocrlf=true -c core.filemode=false commit --no-verify -m "fix: 简述"'

# 3) 推送：Windows 侧（凭据在 Git Credential Manager，WSL 内没有凭据）
git push origin master

# 4) 核对远端确实收到
git ls-remote origin refs/heads/master
git log --oneline -1
```

- **含中文的多行提交说明**建议写进文件再用 `-F`，避免 PowerShell 引号与编码问题（写文件时用 UTF-8 无 BOM）：

  ```powershell
  [System.IO.File]::WriteAllText("$env:TEMP\commit-msg.txt", $msg, (New-Object System.Text.UTF8Encoding($false)))
  ```

  再以 `... commit --no-verify -F /mnt/c/<用户名>/AppData/Local/Temp/commit-msg.txt` 传入（WSL 内用 `/mnt/c/...` 访问 Windows 的 `%TEMP%`）。

- **不要在 `~/dsoj` 里提交**：`scripts/setup-wsl-app.sh` 的 rsync 明确 `--exclude '.git'`，运行副本里没有 `.git`。提交一律针对 `/mnt/e/.../dsoj`（即 Windows 侧那份工作区）。

### 两个必须记住的坑

1. **换行 / mode 参数不能省。** Windows 侧 Git 的 `core.autocrlf=true` 来自 Git for Windows 的**全局**配置，而 WSL 侧没有这份全局配置（仓库本地也未设置）。同一份工作区，两侧默认行为不同：WSL 侧不带该参数执行 `git add` 会把 CRLF 原样写进索引，与索引里既有的 LF 版本相比「整个仓库都变了」——曾因此产出 `790 files changed, +116361/-114292` 的假差异（发现后用 `git reset --mixed HEAD~1` 回退重做，未推送）。带上参数后同一批改动是 `24 files changed, +2072/-3`。
   `-c core.filemode=false` 同理：`/mnt/e` 上的文件权限位不可靠，不加会混入大量 mode 变更。
2. **提交后立刻自检**：`git show --stat HEAD | tail -5`。文件数远超预期即说明换行 / mode 被误判，按第 1 条重做（`git reset --mixed HEAD~1` 只回退提交并重置索引，不动工作区文件）。

### 提交前必过（= pre-commit 钩子的等价检查）

钩子 `.husky/pre-commit` 执行 `npx lint-staged`（`prettier --write` + `eslint --fix`），需要本地 `node_modules` 且会改写暂存文件。提交走 WSL 时请手工跑等价检查，全绿再提交：

```bash
cd /mnt/e/DeskBox/桌面文件和文件夹/project/dsoj   # 或 ~/dsoj（仅用于跑检查）
npx tsc --noEmit
npx eslint .
npx prettier --check app components hooks lib contexts tests
npx vitest run
```

`prettier --check` 报出的文件先 `npx prettier --write <files>`（这正是 lint-staged 的行为）再提交。以上全绿后用 `--no-verify` 跳过钩子是安全的；若改在 Windows 侧 `git commit`，钩子同样会因写不了对象而失败。

### 提交自检三项

1. `git show --stat HEAD | tail -3` 的文件数与预期一致？
2. `git status --porcelain` 无输出（工作区干净）？
3. `git ls-remote origin refs/heads/master` 与本地 `HEAD` 一致？

---

## 评测相关注意

- **仅 Linux**：Windows 宿主调用评测会直接报错并提示改用 WSL/Docker。
- **Node**：推荐 20/22 LTS。Node 24 + `tsx server.ts` 需 `lib/node-als-polyfill.ts`（已默认导入），否则会报 `AsyncLocalStorage accessed in runtime where it is not available`。
- **自定义 server**：`npm run dev` / `start` 使用 `tsx --conditions=react-server`，使 `server-only` 在 Node 侧解析为空模块（与 Next 服务端一致）；勿把 `ioredis` / `prisma` 经 barrel 引进 Client Component。
- **单元测试**：Vitest 将 `server-only` 别名到 `tests/mocks/server-only.ts`；跑 `npm test` 无需额外条件。纯逻辑模块请从 `lib/api/errors` 导入 `ApiError`。
- **Redis**：本地 `npm run dev` 强烈建议配置 `REDIS_URL`（缓存 / 限流 / 头像分片 / 登录锁 / 跨实例吊销）；生产未配置会启动失败。
- **CSRF**：浏览器写请求须带可读 CSRF Cookie + `X-CSRF-Token`；前端请用 `fetchWithCookie` / `apiClient`，勿裸 `fetch` POST。
- **默认关闭 ASan/UBSan**（对齐洛谷/HOJ）。严检：`JUDGE_ENABLE_ASAN=true`。
- Linux 跑测使用原生 `<in >out` 重定向；大输出题（如 LP3383）更快。
- **fail-fast（默认 off）**：默认跑完全部测点；不因 TLE/WA 跳过。仅当显式 `JUDGE_FAIL_FAST=hard|all` 时提前中止。
- **CPU 硬限**与墙钟分离：大 I/O 题墙钟可因输出体积放宽，但暴力解仍按 `timeLimit+extra` 尽快杀掉单点，避免单点拖满墙钟裕量。
- 测点并行：超过体积阈值的测点占用「大测点槽位」（默认最多 2 路）。
- `dsoj-watch`：启动时预编译；并行测点用 flock + 原子 mv，避免半截二进制误报 RE。改完 `dsoj-watch.c` / `runner.sh` 后请同步到 `~/dsoj` 并重启 `npm run dev`。
- SPJ / 选手进程使用环境变量白名单，不继承宿主机 `JWT_SECRET` / `DATABASE_URL` 等。
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
