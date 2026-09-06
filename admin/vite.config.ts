import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // 反代场景：允许通过这些域名访问 dev server（Vite 默认只放行 localhost）
    allowedHosts: [".qianyuan.website", "localhost", "127.0.0.1"],
  },
  build: {
    rollupOptions: {
      output: {
        // 手动分包 (函数形式: 按包名整目录匹配, 覆盖 react-dom/client 等子路径引入):
        // 框架层拆出去, 业务主 chunk 显著变小; 三方依赖独立缓存
        manualChunks(id) {
          if (!id.includes("node_modules/")) return undefined
          // React 运行时 (react / react-dom / scheduler)
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return "react"
          }
          // TanStack 全家桶 (router / query / table)
          if (id.includes("node_modules/@tanstack/")) return "tanstack"
          // 其余常驻三方库 (均为实际安装并被引用的依赖)
          if (
            /node_modules\/(axios|sonner|next-themes|react-hook-form|@hookform\/resolvers|zod|lucide-react|clsx|tailwind-merge|class-variance-authority|react-error-boundary)\//.test(
              id,
            )
          ) {
            return "vendor"
          }
          return undefined
        },
      },
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
})
