import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './', // Tauri 自定义协议需要相对资源路径
  plugins: [vue()],
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
