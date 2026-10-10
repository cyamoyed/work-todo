import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './', // Tauri 自定义协议需要相对资源路径
  plugins: [vue()],
  define: {
    // 前端版本号由 package.json 注入，避免第四处版本拷贝
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js', 'tests/component/**/*.test.js'],
  },
});
