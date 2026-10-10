import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';

// 版本号唯一源头：src-tauri/Cargo.toml（tauri.conf.json 省略 version 时也回退到它）
const version = readFileSync(new URL('./src-tauri/Cargo.toml', import.meta.url), 'utf8')
  .match(/^version = "([^"]+)"/m)[1];

export default defineConfig({
  base: './', // Tauri 自定义协议需要相对资源路径
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
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
