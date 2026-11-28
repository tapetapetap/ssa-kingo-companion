// 학생 앱(3단계 research R1): /에서 api가 web/app/dist를 준다. 개발 서버는 /api를 api(8080)로 넘긴다
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  // 앞단의 gzip보다 작은 brotli를 미리 만들어 둔다(server/http.ts가 준다)
  plugins: [react(), {
    name: 'brotli', generateBundle: { order: 'post', handler(_, bundle) {
      for (const f of Object.values(bundle)) if (/\.(js|css)$/.test(f.fileName)) this.emitFile({ type: 'asset', fileName: `${f.fileName}.br`, source: brotliCompressSync(f.type === 'chunk' ? f.code : f.source) });
    } }
  }],
  // 첫 화면과 나머지(src/rest.ts)를 나눈다. 나머지를 못 받으면 새로 고침을 알린다(R1, parts/Rest.tsx)
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: { proxy: { '/api': process.env.KINGO_API_URL ?? 'http://127.0.0.1:8080' } }
});
