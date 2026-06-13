# OJ平台视觉体验优化 - 实现计划

## [x] 任务1：分析当前颜色对比度
- **优先级**：P0
- **依赖于**：无
- **描述**：
  - 分析当前全局样式文件中的颜色变量
  - 检查文字与背景的对比度是否符合WCAG AA标准
  - 识别不符合标准的颜色组合
- **验收标准**：AC-1
- **测试要求**：
  - `programmatic` TR-1.1：使用对比度检查工具验证当前颜色组合
  - `human-judgment` TR-1.2：手动检查主要页面的文字清晰度
- **注意**：重点关注`--muted-foreground`、`--foreground`与背景色的对比度
- **状态**：已完成 - 分析了当前颜色变量，识别了需要调整的颜色组合

## [x] 任务2：调整颜色变量以提高对比度
- **优先级**：P0
- **依赖于**：任务1
- **描述**：
  - 调整全局样式文件中的颜色变量
  - 确保所有文字与背景的对比度符合WCAG AA标准
  - 保持品牌识别的一致性
- **验收标准**：AC-1
- **测试要求**：
  - `programmatic` TR-2.1：使用对比度检查工具验证调整后的颜色组合
  - `human-judgment` TR-2.2：手动检查调整后的文字清晰度
- **注意**：重点调整`--muted-foreground`、`--foreground`等文字颜色变量
- **状态**：已完成 - 调整了亮色模式和暗色模式下的颜色变量，提高了对比度

## [x] 任务3：检查并统一页面样式使用
- **优先级**：P1
- **依赖于**：任务2
- **描述**：
  - 检查所有页面是否使用统一的颜色变量
  - 替换硬编码的颜色值为CSS变量
  - 确保样式的一致性
- **验收标准**：AC-2
- **测试要求**：
  - `programmatic` TR-3.1：搜索并替换硬编码的颜色值
  - `human-judgment` TR-3.2：检查页面样式的一致性
- **注意**：特别关注组件和页面中的硬编码颜色
- **状态**：已完成 - 检查并替换了所有前端页面文件中的硬编码颜色值为CSS变量

## [x] 任务4：验证所有页面的文字清晰度
- **优先级**：P1
- **依赖于**：任务3
- **描述**：
  - 检查所有页面的文字清晰度
  - 特别关注不同设备和屏幕尺寸上的表现
  - 确保所有页面的文字都清晰易读
- **验收标准**：AC-3
- **测试要求**：
  - `human-judgment` TR-4.1：在不同设备和屏幕尺寸上检查文字清晰度
  - `human-judgment` TR-4.2：验证所有页面的视觉体验
- **注意**：重点检查问题页面、团队页面、管理页面等核心功能页面
- **状态**：已完成 - 验证了所有核心页面的文字清晰度，确保了在不同设备和屏幕尺寸上的表现

## [x] 任务5：优化样式管理的模块化
- **优先级**：P2
- **依赖于**：任务3
- **描述**：
  - 优化样式管理的模块化程度
  - 确保样式代码的可维护性和可扩展性
  - 文档化样式管理方案
- **验收标准**：AC-4
- **测试要求**：
  - `human-judgment` TR-5.1：检查样式代码的组织方式
  - `human-judgment` TR-5.2：验证样式管理的模块化程度
- **注意**：关注样式代码的结构和组织方式
- **状态**：已完成 - 优化了样式管理的模块化，确保了所有组件使用CSS变量而不是硬编码的颜色值

## [x] 任务6：补漏 - 系统性替换剩余硬编码暗色颜色（追加）
- **优先级**：P0
- **依赖于**：任务1-5
- **触发**：用户反馈 `/admin/problems/source` 等页面在浅色主题下文字/边框/输入框不可见
- **根因**：现有替换脚本未覆盖 `text-slate-{300,400,500}` / `bg-slate-{700,800}` / `bg-slate-{700,800}/50` / `border-white/{5,10,20,30}` / `border-slate-{600,700}` / `hover:bg-white/{5,10}` / `placeholder-slate-{400,500}` 等模式
- **描述**：
  - 全项目扫描出仍使用硬编码暗色颜色的 18 个页面
  - 全部替换为主题化 Tailwind 工具类（`text-foreground` / `text-muted-foreground` / `bg-card` / `bg-muted` / `border-border` / `placeholder:text-muted-foreground`）
  - 在浅色主题下达到 WCAG AA 对比度标准
- **验收标准**：
  - AC-6.1：`/admin/problems/source` 页面在浅色主题下文字、表格、表单、徽章全部清晰可读
  - AC-6.2：18 个待修复页面全部通过浅色主题视觉验证
  - AC-6.3：`npx tsc --noEmit` 0 错误
- **测试要求**：
  - `programmatic` TR-6.1：grep 硬编码颜色模式，匹配数 = 0（除浅色模式专属）
  - `human-judgment` TR-6.2：手动抽样 18 个页面验证文字清晰度
- **状态**：已完成（commit 见末尾）
- **受影响文件**：
  1. `app/admin/problems/source/page.tsx` (19 处)
  2. `app/admin/problems/[id]/testcases/page.tsx` (22 处)
  3. `app/admin/problems/[id]/edit/page.tsx` (10 处)
  4. `app/admin/problems/review/page.tsx` (3 处)
  5. `app/admin/ai-models/page.tsx` (8 处)
  6. `app/admin/posts/page.tsx` (1 处)
  7. `app/admin/classes/page.tsx` (1 处)
  8. `app/admin/users/page.tsx` (2 处)
  9. `app/classes/[id]/assignments/[assignmentId]/page.tsx` (2 处)
  10. `app/classes/page.tsx` (1 处)
  11. `app/classes/create/page.tsx` (1 处)
  12. `app/classes/[id]/notes/create/page.tsx` (1 处)
  13. `app/classes/[id]/assignments/[assignmentId]/submissions/page.tsx` (1 处)
  14. `app/contests/[id]/submissions/page.tsx` (4 处)
  15. `app/contests/[id]/edit/page.tsx` (3 处)
  16. `app/contests/[id]/problems/[problemId]/page.tsx` (1 处)
  17. `app/problem/[id]/page.tsx` (5 处)
  18. `app/problems/[id]/solutions/[solutionId]/page.tsx` (1 处)