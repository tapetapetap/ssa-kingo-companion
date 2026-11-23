// 운영자 판정 검토 화면(research R17): /ops/에서 api가 web/ops/dist를 준다. 개발 서버는 /api를 api(8080)로 넘긴다
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/ops/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 }, // ponytail: PC 운영자 화면 하나라 덩어리를 나누지 않는다
  server: { proxy: { '/api': process.env.KINGO_API_URL ?? 'http://127.0.0.1:8080' } }
});
