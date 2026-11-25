/**
 * 학생 앱 자동 화면 검사(3단계 research R19, FR-061): 시험 스키마에 공지·분야·개발 계정을 넣고 서버를 띄워 걸음을 끝까지 돈다.
 * 걸음마다 320·390·768px과 글자 200%에서 가로 넘침 0, axe 심각·중대 위반 0, 앱이 쓴 글의 문구 검사, 누르는 자리 44px.
 * 쓰는 법: npm run build:app && npm run e2e:app [--shots <폴더>]
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { loadTaxonomy } from '../../etl/taxonomy/taxonomy.ts';
import { defaultMethods, routes } from '../../server/app.ts';
import { APP_DIR, createServer } from '../../server/http.ts';
import { readConsent } from '../../server/me/onboarding.ts';
import { testDb } from '../../server/test/db.ts';
import { notice } from '../../server/test/notice.ts';
import { createDevStudent, PASSWORD, seedTaxonomy } from '../../server/test/student.ts';
import { findCopyIssues } from '../audit-copy/rules.mjs';

if (!existsSync(join(APP_DIR, 'index.html'))) {
  console.error('먼저 npm run build:app을 돌려요');
  process.exit(1);
}
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const db = await testDb();
const ctx = { sql: db.sql, mode: 'dev', consent: readConsent('deploy/consent.dev.md'), methods: defaultMethods() };
const server = createServer(routes(ctx), () => {});
const browser = await chromium.launch();
const problems = [];
let checks = 0;

/** 가로로 넘치는 것, 44px보다 작은 누르는 자리, 앱이 쓴 글 */
const probe = () => {
  const visible = e => e.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  const doc = document.documentElement;
  const over = doc.scrollWidth - doc.clientWidth;
  const small = [...document.querySelectorAll('a, button, input, select, textarea, [role=radio], [role=tab], [role=switch]')].filter(e => e.matches('input[type=radio], input[type=checkbox]') ? e.closest('label, li') : visible(e)).map(e => {
    // 라디오·확인란은 줄 전체(label이나 목록 줄)를 누른다
    const hit = e.matches('input[type=radio], input[type=checkbox]') ? e.closest('label, li, [role=listitem]') ?? e : e.matches('input, textarea') ? e.parentElement : e;
    const r = hit.getBoundingClientRect();
    return { name: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('name') || e.tagName).slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(x => x.w > 1 && x.h > 1 && (x.h < 44 || x.w < 44));
  const texts = [...document.querySelectorAll('body *')].filter(e => visible(e) && !e.closest('[data-server-text], script, style') && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => e.innerText ?? '');
  return { over, small, texts };
};

async function check(page, name) {
  checks++;
  await page.waitForLoadState('networkidle');
  for (const [width, font] of [[320, ''], [390, ''], [768, ''], [1280, ''], [390, '200%']]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(f => { document.documentElement.style.fontSize = f; }, font);
    await page.waitForTimeout(150);
    const p = await page.evaluate(probe);
    if (p.over > 0) problems.push(`${name} ${width}px${font}: 가로로 ${p.over}px 넘침`);
    if (width === 390 && !font) {
      for (const s of p.small) problems.push(`${name}: 누르는 자리 ${s.w}×${s.h} '${s.name}'`);
      for (const t of p.texts) for (const i of findCopyIssues(t)) problems.push(`${name}: 문구 ${i.kind} ${i.hit} '${t.slice(0, 40)}'`);
    }
    if (shots && !font && (width === 390 || width === 1280)) await page.screenshot({ path: join(shots, `${name}-${width}.png`), fullPage: true });
    if (shots && font) await page.screenshot({ path: join(shots, `${name}-200.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.waitForTimeout(400); // 색이 바뀌는 움직임이 끝난 뒤
    // CSP가 인라인 스크립트를 막으므로 주소창 명령처럼 넣는다
    await page.evaluate(AXE);
    const r = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
    for (const v of r.violations.filter(x => x.impact === 'serious' || x.impact === 'critical')) problems.push(`${name} ${scheme}: axe ${v.id} (${v.nodes.length}) ${v.nodes[0].html.slice(0, 120)} ${v.nodes[0].any[0]?.message ?? ''}`);
    if (shots && scheme === 'dark') await page.screenshot({ path: join(shots, `${name}-dark.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
}
const at = async (page, want) => {
  await page.waitForFunction(w => location.pathname + location.search === w, want, { timeout: 10_000 }).catch(async () => { throw new Error(`주소가 ${want}가 아니라 ${await page.evaluate(() => location.pathname + location.search)}예요`); });
};
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

async function newPage(base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', timezoneId: 'America/New_York', hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', e => problems.push(`화면 오류: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/status of (401|403|404|422)/.test(m.text())) problems.push(`콘솔: ${m.text().slice(0, 200)}`); });
  return { page, open: path => page.goto(base + path) };
}
async function login(page, email, password = PASSWORD) {
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '들어가기' }).click();
}

async function us1(base) {
  const { page, open } = await newPage(base);
  await open('/notices?kind=job');
  await at(page, '/login?to=%2Fnotices%3Fkind%3Djob');
  await page.getByText('개발용 로그인').waitFor();
  await check(page, 'login');
  for (let i = 0; i < 5; i++) {
    await login(page, 'lock@example.com', 'wrong pass');
    await page.getByText('이메일이나 비밀번호가 맞지 않아요').first().waitFor();
  }
  await login(page, 'lock@example.com');
  await page.getByText(/(오전|오후) \d+:\d\d부터 다시 할 수 있어요/).first().waitFor();
  await check(page, 'login-locked');

  await login(page, 'new@example.com');
  await at(page, '/start/consent?to=%2Fnotices%3Fkind%3Djob');
  const old = ctx.consent;
  await page.getByText('개발용 동의 문구예요').waitFor();
  await check(page, 'consent');
  // 보는 사이 판이 바뀌면 새 문구를 다시 읽는다
  ctx.consent = { version: 'dev-new', text: '새 문구예요.' };
  await page.getByRole('button', { name: '동의하고 시작하기' }).click();
  await page.getByText('새 문구예요.').waitFor();
  ctx.consent = old;
  await page.reload();
  await page.getByText('개발용 동의 문구예요').waitFor();
  await page.getByRole('button', { name: '동의하고 시작하기' }).click();

  await at(page, '/start/answers?to=%2Fnotices%3Fkind%3Djob');
  const next = page.getByRole('button', { name: '다음' });
  await page.getByText('남은 것: 학년, 학기, 진로 목표').waitFor();
  ok(await next.isDisabled(), '처음 질문: 다 고르기 전에 다음이 눌린다');
  await check(page, 'answers');
  await open('/start/fields?to=%2Fnotices%3Fkind%3Djob'); // 순서는 서버가 정한다
  await at(page, '/start/answers?to=%2Fnotices%3Fkind%3Djob');
  await page.getByRole('button', { name: '3학년' }).click();
  await page.getByRole('button', { name: '2학기' }).click();
  await page.getByRole('radio', { name: '취업' }).click();
  await check(page, 'answers-picked');
  await next.click();

  await at(page, '/start/fields?to=%2Fnotices%3Fkind%3Djob');
  await page.getByText('0개 골랐어요').waitFor();
  await check(page, 'fields');
  await page.getByRole('button', { name: '인공지능' }).click();
  await page.getByRole('checkbox', { name: /^머신러닝/ }).click();
  await page.getByRole('searchbox', { name: '분야 찾기' }).fill('웹 프론트 엔드');
  await page.getByRole('searchbox', { name: '분야 찾기' }).fill('데이터 베이스');
  await page.getByRole('checkbox').first().click();
  await page.getByText('2개 골랐어요').waitFor();
  ok(await next.isDisabled(), '분야: 3개 미만인데 다음이 눌린다');
  await check(page, 'fields-search');
  await page.getByRole('searchbox', { name: '분야 찾기' }).fill('보안');
  await page.getByRole('checkbox').first().click();
  await page.getByRole('searchbox', { name: '분야 찾기' }).fill('');
  await page.getByText('3개 골랐어요').waitFor();
  await check(page, 'fields-picked');
  await page.reload(); // 같은 걸음에서 이어진다
  await at(page, '/start/fields?to=%2Fnotices%3Fkind%3Djob');
  for (const q of ['머신러닝', '데이터베이스', '보안']) {
    await page.getByRole('searchbox', { name: '분야 찾기' }).fill(q);
    await page.getByRole('checkbox').first().click();
  }
  await next.click();
  await at(page, '/notices?kind=job');

  // 네 메뉴와 없는 화면
  for (const [name, path] of [['홈', '/'], ['내 목록', '/list'], ['나', '/me'], ['공지', '/notices']]) {
    await page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
    await at(page, path);
    ok(await page.getByRole('link', { name, exact: true }).getAttribute('aria-current') === 'page', `메뉴 ${name}: 지금 표시가 없다`);
  }
  await page.goBack();
  await at(page, '/me');
  await open('/없는곳');
  await page.getByRole('heading', { name: '없는 화면이에요' }).waitFor();
  await check(page, 'none');
  // 쓰던 학생도 문구 판이 바뀌면 동의가 먼저이고 하던 곳으로 돌아온다
  ctx.consent = { version: 'dev-3', text: '세 번째 문구예요.' };
  await open('/me/prompt');
  await at(page, '/start/consent?to=%2Fme%2Fprompt');
  await page.getByText('세 번째 문구예요.').waitFor();
  await page.getByRole('button', { name: '동의하고 시작하기' }).click();
  await at(page, '/me/prompt');
  ctx.consent = old;
  // 로그아웃
  await open('/start/consent');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await at(page, '/login');
  await page.context().close();
}

let failed = null;
try {
  const t = loadTaxonomy('custom');
  await seedTaxonomy(db.sql, t);
  for (let i = 1; i <= 45; i++) await notice(db.sql, { no: i, title: `공지 ${i}`, kind: i % 3 ? 'job' : 'hackathon', posted: -i, deadline: i % 7 ? i : null, core: [t.fields[i % t.fields.length].id] });
  for (const email of ['new@example.com', 'lock@example.com']) await createDevStudent(db.sql, email);
  await new Promise(done => { server.listen(0, '127.0.0.1', done); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, run] of [['US1', us1]]) {
    const t0 = Date.now();
    await run(base);
    console.log(`${name} ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  }
} catch (e) {
  failed = e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(done => { server.close(done); });
  await db.close();
}
for (const p of [...new Set(problems)]) console.log(`- ${p}`);
if (failed) console.error(failed);
console.log(`화면 ${checks}곳 · 문제 ${new Set(problems).size}개${failed ? ' · 끝까지 못 감' : ''}`);
process.exitCode = failed || problems.length ? 1 : 0;
