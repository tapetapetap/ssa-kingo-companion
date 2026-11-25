// 학생 앱(3단계 research R1): /에서 api가 web/app/dist를 준다. 개발 서버는 /api를 api(8080)로 넘긴다
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [react()],
  // ponytail: 덩어리 하나. 새 판이 올라간 뒤 옛 앱이 없는 덩어리를 부르는 일이 없다(R1)
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200, rolldownOptions: { output: { codeSplitting: false } } },
  server: { proxy: { '/api': process.env.KINGO_API_URL ?? 'http://127.0.0.1:8080' } }
});
