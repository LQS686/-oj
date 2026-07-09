import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 项目 package.json 为 "type": "module"，ESM 下无原生 __dirname，
// 用 import.meta.url 推导出配置文件所在目录（即项目根目录），与 tsconfig paths "@/*": ["./*"] 一致。
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // api.test.ts 依赖外部已启动的 dev server（端口 3001），属集成测试，不在 CI 默认运行范围
    exclude: ['tests/api.test.ts', 'node_modules/**'],
  },
})
