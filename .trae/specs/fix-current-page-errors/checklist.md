# Checklist - 修复当前线上页面/权限/数据异常

## A. 静态扫描

- [ ] A1: `app/api/**/route.ts` 中 `prisma.*` 0 命中
- [ ] A2: `app/api/**/route.ts` 中 `console.*` 0 命中
- [ ] A3: `app/api/**/route.ts` 中所有 ctx.params 使用点已统一在 withApi 中 await
- [ ] A4: `app/api/**/route.ts` 中 `(ctx as any).params` 仅在兼容性场景使用

## B. 响应字段一致性

- [ ] B1: 所有 list 端 API 返回结构统一
- [ ] B2: 前端所有消费点已适配
- [ ] B3: 字段缺失时前端有防御默认值（不崩溃）

## C. 权限校验

- [ ] C1: `lib/permissions.ts` 中 `isAdmin` / `canAccessAdmin` 全部基于 `user.role`
- [ ] C2: 普通用户访问 admin API 返回 403
- [ ] C3: 未登录访问受保护 API 返回 401

## D. ID 校验

- [ ] D1: ObjectId 24 位十六进制
- [ ] D2: problemNumber `P\d+` 格式
- [ ] D3: 错误格式 ID 返回 400/404 而非 500

## E. 前端防御

- [ ] E1: `setProblems(data.data.problems || [])` 模式普及
- [ ] E2: `useMemo([...arr])` 不会因 arr 变 undefined 崩
- [ ] E3: `Number(x) || 0` / `String(x) || ''` 防御 nullish

## F. 错误日志

- [ ] F1: `logs/error.log` 最近 100 行无非预期 PrismaClientValidationError
- [ ] F2: `logs/error.log` 最近 100 行无非预期 500
- [ ] F3: 客户端 console.error 拦截无 TypeError

## G. 路由功能抽样

- [ ] G1: /problems 200 + 渲染
- [ ] G2: /problem/P1025 200 + 渲染
- [ ] G3: /notifications 200 + 红点
- [ ] G4: /user/<id> 200
- [ ] G5: /submissions/<id> 200
- [ ] G6: /solutions/<id> 200
- [ ] G7: /posts/<id> 200
- [ ] G8: /classes/<id> 200
- [ ] G9: /contests/<id> 200
- [ ] G10: /trainings/<id> 200

## H. 部署

- [ ] H1: 修复按域分批 commit
- [ ] H2: `git push origin master` 成功
- [ ] H3: 部署后生产日志 24h 无回归
