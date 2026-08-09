import { defineConfig } from "vitest/config"

// 纯函数单测 (node 环境)。组件测试需另加 jsdom + @testing-library，后续按需。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
