// 앱 파일이 내려오는 동안 첫 자료를 함께 청해 왕복을 줄인다(SC-002). 받은 답은 api.ts가 처음 한 번만 쓴다
(() => {
  const here = location.pathname + location.search;
  const urls = ['/api/me', ...(here === '/' ? ['/api/home'] : location.pathname === '/notices' ? ['/api' + here] : [])];
  window.boot = new Map(urls.map(u => [u, fetch(u).catch(() => null)]));
})();
