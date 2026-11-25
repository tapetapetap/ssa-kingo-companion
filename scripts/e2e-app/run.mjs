/**
 * 학생 앱 자동 화면 검사(3단계 research R19, FR-061): 시험 스키마에 공지·분야·개발 계정을 넣고 서버를 띄워 걸음을 끝까지 돈다.
 * 걸음마다 320·390·768px과 글자 200%에서 가로 넘침 0, axe 심각·중대 위반 0, 앱이 쓴 글의 문구 검사, 누르는 자리 44px.
 * 쓰는 법: npm run build:app && npm run e2e:app [-- --shots <폴더> --only US1,US2]
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
import { day as kst, notice } from '../../server/test/notice.ts';
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
let broken = false; // 일부러 끊은 걸음인가

/** 가로로 넘치는 것, 44px보다 작은 누르는 자리, 앱이 쓴 글 */
const probe = () => {
  const visible = e => e.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  const doc = document.documentElement;
  const over = doc.scrollWidth - doc.clientWidth;
  const small = [...document.querySelectorAll('a, button, input, select, textarea, [role=radio], [role=tab], [role=switch]')].filter(e => e.matches('input[type=radio], input[type=checkbox]') ? e.closest('label, li') : visible(e)).map(e => {
    // 라디오·확인란·목록 줄의 링크는 줄 전체를, 입력 칸 안쪽 단추는 칸 전체를 누른다
    const hit = e.matches('input[type=radio], input[type=checkbox]') ? e.closest('label, li, [role=listitem]') ?? e : e.closest('[class*=astryx-date-input], [class*=astryx-multi-selector]') ?? (e.matches('input, textarea, [role=combobox]') ? e.parentElement : e.matches('li a') ? e.closest('li') : e);
    const r = hit.getBoundingClientRect();
    return { name: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('name') || e.tagName).slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(x => x.w > 1 && x.h > 1 && (x.h < 44 || x.w < 44) && x.name !== '알림 닫기'); // 알림은 5초 뒤 저절로 사라진다
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', timezoneId: 'America/New_York', hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', e => problems.push(`화면 오류: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/status of (401|403|404|422)/.test(m.text()) && !(broken && /ERR_FAILED/.test(m.text()))) problems.push(`콘솔: ${m.text().slice(0, 200)}`); });
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

/** 처음 흐름을 마친 학생으로 들어간다 */
async function signIn(base, email, path = '/') {
  const p = await newPage(base);
  await p.open(`/login?to=${encodeURIComponent(path)}`);
  await login(p.page, email);
  await at(p.page, path);
  return p;
}
async function doneStudent(email) {
  const id = await createDevStudent(db.sql, email);
  await db.sql`insert into consents (student_id, text_version) values (${id}, ${ctx.consent.version})`;
  await db.sql`insert into answers (student_id, grade, term, goal) values (${id}, 3, 2, 'job')`;
  for (const f of t.fields.slice(0, 5)) await db.sql`insert into student_fields (student_id, field_id) values (${id}, ${f.id})`;
  return id;
}

async function us2(base) {
  const id = await doneStudent('home@example.com');
  const { page, open } = await signIn(base, 'home@example.com');
  await page.getByText('규칙으로 골랐어요').waitFor();
  await page.getByRole('heading', { name: '마감 임박' }).waitFor();
  ok(await page.getByRole('heading', { name: '비슷한 공지' }).count() === 0, '홈: 빈 선반이 보인다');
  await page.waitForTimeout(5500); // 처음 고른 뒤 다시 고르는 중이면 한 번 다시 부른다
  await db.sql`delete from repick_queue`;
  await open('/');
  await page.getByText('규칙으로 골랐어요').waitFor();
  ok(await page.getByText('이걸 보고 골랐어요').count() === 0, '홈: 참고한 줄이 없는데 펼치기가 있다');
  await check(page, 'home');
  // 참고한 줄과 LLM 표시, 다시 고르는 중 → 5초 뒤 한 번
  await db.sql`insert into prompts (student_id, body) values (${id}, '서류 면제가 있으면 좋아요')`;
  await db.sql`update picks set method = 'llm:gemma4:12b', cited = ${db.sql.json([{ key: 'prompt' }, { key: 'ans' }])}, reason = '고른 분야와 맞고 마감이 가까워요' where student_id = ${id}`;
  await db.sql`insert into repick_queue (student_id, cause) values (${id}, 'answers')`;
  await open('/');
  await page.getByText('AI가 골랐어요').waitFor();
  await page.getByText('다시 고르는 중이에요').first().waitFor();
  await page.getByRole('button', { name: '이걸 보고 골랐어요' }).click();
  await page.getByText('나에 대한 프롬프트').waitFor();
  await check(page, 'home-cited');
  await open('/');
  await page.getByText('다시 고르는 중이에요').first().waitFor();
  await db.sql`delete from repick_queue`;
  await page.getByText('다시 고르는 중이에요').first().waitFor({ state: 'hidden', timeout: 8000 });

  // 공지: 거르기·찾기·정렬·이어 불러오기·같은 자리
  await page.getByRole('link', { name: '공지', exact: true }).click();
  await at(page, '/notices');
  await page.getByRole('link', { name: '공지 45', exact: true }).or(page.getByText('공지 1', { exact: true })).first().waitFor();
  await check(page, 'notices');
  const rows = page.locator('main li a, main [role=listitem] a');
  for (let i = 0; i < 8 && await page.getByText('여기까지예요').count() === 0; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
  }
  await page.getByText('여기까지예요').waitFor();
  const total = await rows.count();
  ok(total === 44, `공지: 열린 것 44개(마감 없는 둘은 30일이 지나 닫힘)인데 ${total}개가 보인다`);
  const target = rows.nth(30);
  await target.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  ok(y > 500, '공지: 아래로 내려가지 않았다');
  await target.evaluate(e => e.click());
  await page.getByRole('link', { name: '원문 열기' }).waitFor();
  ok(await page.evaluate(() => window.scrollY) === 0, '자세히: 맨 위에서 시작하지 않는다');
  ok(await page.getByRole('link', { name: '원문 열기' }).getAttribute('rel') === 'noopener noreferrer', '원문: rel이 다르다');
  await check(page, 'notice');
  await page.getByRole('button', { name: '뒤로' }).click();
  await at(page, '/notices');
  await page.waitForTimeout(300);
  ok(await rows.count() === 44, '뒤로: 이어 받은 목록이 줄었다');
  const back = await page.evaluate(() => window.scrollY);
  ok(Math.abs(back - y) < 60, `뒤로: 자리가 ${y}에서 ${back}으로 바뀌었다`);

  await page.getByRole('button', { name: '필터' }).click();
  await page.getByRole('checkbox', { name: '해커톤' }).click();
  await check(page, 'filter');
  await page.getByRole('button', { name: '이대로 보기' }).click();
  await at(page, '/notices?kind=hackathon');
  await page.getByRole('button', { name: '해커톤 빼기' }).waitFor();
  await page.getByRole('button', { name: '이대로 보기' }).waitFor({ state: 'hidden' });
  await page.waitForTimeout(500);
  await page.getByRole('searchbox', { name: '공지 찾기' }).fill('공지 3');
  await at(page, '/notices?kind=hackathon&q=%EA%B3%B5%EC%A7%80%203');
  await check(page, 'notices-filtered');
  await page.reload();
  await page.getByRole('button', { name: '해커톤 빼기' }).waitFor();
  await page.getByRole('searchbox', { name: '공지 찾기' }).fill('없는 공지');
  await page.getByRole('heading', { name: '찾는 말이나 거르기에 맞는 공지가 없어요' }).waitFor();
  await check(page, 'notices-empty');
  await page.getByRole('button', { name: '거르기 지우기' }).click();
  await at(page, '/notices');
  // 이어 불러오다 실패하면 그 자리에서 다시
  broken = true;
  await page.route('**/api/notices?cursor=*', r => r.abort());
  await open('/notices');
  await rows.first().waitFor();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: '다시 불러오기' }).waitFor();
  await page.unroute('**/api/notices?cursor=*');
  broken = false;
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await page.waitForFunction(() => document.querySelectorAll('main li').length > 20);
  // 닫힌 공지, 내려간 공지, 없는 공지, 주소로 바로 들어온 뒤로 가기
  await open('/notices/cse%3A101');
  await page.getByText('신청이 끝난 공지예요').waitFor();
  await page.getByText('마감 지남').waitFor();
  await page.getByRole('button', { name: '뒤로' }).click();
  await at(page, '/notices');
  await open('/notices/cse%3A102');
  await page.getByText('내려간 글이에요').waitFor();
  await open('/notices/cse%3A999');
  await page.getByRole('heading', { name: '찾을 수 없는 공지예요' }).waitFor();
  await page.context().close();
}

async function us3(base) {
  const id = await doneStudent('act@example.com');
  const { page, open } = await signIn(base, 'act@example.com', '/notices/cse%3A20');
  const action = async (no = 20) => (await db.sql`select kind, revisit_on::text as day, reason from actions where student_id = ${id} and notice_id = ${`cse:${no}`}`)[0] ?? null;
  const settled = async (want, no = 20) => {
    for (let i = 0; i < 40; i++) {
      if (JSON.stringify((await action(no))?.kind ?? null) === JSON.stringify(want)) return;
      await page.waitForTimeout(50);
    }
    problems.push(`행동: ${no}번이 ${want}가 아니라 ${JSON.stringify(await action(no))}`);
  };
  const button = name => page.getByRole('main').getByRole('button', { name, exact: true });
  const pressed = async name => await button(name).getAttribute('aria-pressed') === 'true';
  await button('관심 있어요').click();
  ok(await pressed('관심 있어요'), '행동: 누른 뒤 바로 바뀌지 않는다');
  await page.getByText('내 목록에 담았어요').first().waitFor();
  await check(page, 'acted');
  await settled('like');
  await button('관심 있어요').click();
  await settled(null);
  // 저장이 실패하면 되돌리고 알린다
  broken = true;
  await page.route('**/action', r => r.abort());
  await button('관심 있어요').click();
  await page.getByText('인터넷에 연결되지 않았어요').first().waitFor();
  ok(!await pressed('관심 있어요'), '행동: 실패했는데 눌린 채다');
  await page.unroute('**/action');
  broken = false;
  // 나중에 보기: 기본 3일 뒤
  await button('나중에 보기').click();
  await page.getByRole('heading', { name: '언제 다시 볼까요?' }).waitFor();
  await check(page, 'later');
  await page.getByRole('dialog').getByRole('button', { name: '나중에 보기' }).click();
  await settled('later');
  ok((await action()).day === kst(3), `나중에 보기: 기본 날이 ${(await action()).day}`);
  // 관심 없음과 되돌리기(앞 행동으로)
  await button('관심 없음').click();
  await page.getByRole('heading', { name: '어떤 점이 안 맞았어요?' }).waitFor();
  await check(page, 'dislike');
  await page.getByRole('button', { name: '시간이 안 맞아요' }).click();
  await settled('dislike');
  await page.getByRole('button', { name: '되돌리기' }).click();
  await settled('later');
  // 이미 해 봤어요 → 활동 초안
  await button('관심 없음').click();
  await page.getByRole('button', { name: '이미 해 봤어요' }).click();
  await page.getByRole('heading', { name: '나의 분석에 활동으로 넣을까요?' }).waitFor();
  await check(page, 'suggest');
  await page.getByRole('button', { name: '넣기', exact: true }).click();
  await page.getByLabel('이름').waitFor();
  ok(await page.getByLabel('이름').inputValue() === '공지 20', '활동: 초안이 채워지지 않았다');
  await check(page, 'activity-draft');
  await page.getByLabel('이름').fill('교내 해커톤');
  await page.getByRole('button', { name: '저장하기' }).click();
  await page.getByText('해 온 활동에 넣었어요').first().waitFor();
  ok((await db.sql`select name from activities where student_id = ${id}`)[0]?.name === '교내 해커톤', '활동: 저장되지 않았다');
  await page.waitForTimeout(600);
  // 목록 줄: 한 번 눌러 관심 있어요, 관심 없음이면 빠지고 되돌리면 돌아온다
  await open('/notices');
  const row = no => page.locator('main li').filter({ has: page.getByText(`공지 ${no}`, { exact: true }) });
  await row(5).getByRole('button', { name: '관심 있어요' }).click();
  await settled('like', 5);
  await row(6).getByRole('button', { name: '다른 표시' }).click();
  await check(page, 'menu');
  await page.getByRole('dialog').getByRole('button', { name: '관심 없음' }).click();
  await page.getByRole('button', { name: '이유 없이' }).click();
  await settled('dislike', 6);
  await row(6).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '되돌리기' }).last().click();
  await settled(null, 6);
  await row(6).waitFor();
  // 오늘 닫히는 공지에는 나중에 보기가 없다
  await open('/notices/cse%3A103');
  await page.getByText('오늘 닫히는 공지라').waitFor();
  ok(await button('나중에 보기').isDisabled(), '오늘 닫히는 공지에 나중에 보기가 눌린다');
  // 내 목록
  await db.sql`insert into actions (student_id, notice_id, kind, revisit_on) values (${id}, 'cse:9', 'later', ${kst(0)}), (${id}, 'cse:10', 'later', ${kst(2)}), (${id}, 'cse:101', 'like', null), (${id}, 'cse:102', 'like', null), (${id}, 'cse:3', 'like', null)
    on conflict do nothing`;
  await page.getByRole('link', { name: '내 목록', exact: true }).click();
  await page.getByRole('tab', { name: '관심 있어요 4' }).waitFor();
  const titles = () => page.locator('main li').evaluateAll(ls => ls.map(l => /(공지 \d+|닫힌 공지|내려간 공지)/.exec(l.innerText)[0]));
  ok((await titles()).join() === '공지 3,공지 5,닫힌 공지,내려간 공지', `내 목록 순서: ${await titles()}`);
  await check(page, 'list');
  await page.getByRole('tab', { name: '나중에 보기 2' }).click();
  await at(page, '/list?tab=later');
  await page.getByText('다시 볼 날이에요').waitFor();
  ok((await titles()).join() === '공지 9,공지 10', `나중에 보기 순서: ${await titles()}`);
  await check(page, 'list-later');
  await open('/list');
  await row(5).waitFor();
  await page.locator('main li').filter({ hasText: '내려간 공지' }).getByRole('button', { name: '다른 표시' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '표시 지우기' }).click();
  await settled(null, 102);
  await page.getByRole('tab', { name: '관심 있어요 3' }).waitFor();
  // 다른 기기에서 바꾼 것은 다시 열면 보인다
  await db.sql`delete from actions where student_id = ${id} and notice_id = 'cse:5'`;
  await page.getByRole('link', { name: '홈', exact: true }).click();
  await page.getByRole('link', { name: '내 목록', exact: true }).click();
  await page.getByRole('tab', { name: '관심 있어요 2' }).waitFor();
  // 홈의 가장 추천에 행동: 5초 되돌리기
  await page.getByRole('link', { name: '홈', exact: true }).click();
  const top = page.getByRole('heading', { level: 1 });
  await top.waitFor();
  const before = await top.innerText();
  await button('관심 있어요').first().click();
  await page.getByText('다른 추천을 고르는 중이에요').waitFor();
  await check(page, 'home-acted').catch(() => {});
  await open('/');
  await top.waitFor();
  const second = await top.innerText();
  ok(second !== before, '홈: 행동했는데 같은 추천이다');
  await button('관심 없음').first().click();
  await page.getByRole('button', { name: '이유 없이' }).click();
  await page.getByText('다른 추천을 고르는 중이에요').waitFor();
  await page.getByRole('main').getByRole('button', { name: '되돌리기' }).click();
  await top.waitFor();
  ok(await top.innerText() === second, '홈: 되돌렸는데 카드가 다르다');
  await button('관심 없음').first().click();
  await page.getByRole('button', { name: '이유 없이' }).click();
  await page.getByText('다른 추천을 고르는 중이에요').waitFor();
  await page.waitForTimeout(5800);
  await top.waitFor();
  ok(await top.innerText() !== second, '홈: 5초 뒤 다시 부르지 않았다');
  await page.context().close();
}

async function us4(base) {
  const id = await doneStudent('me@example.com');
  const { page, open } = await signIn(base, 'me@example.com', '/me');
  const button = name => page.getByRole('button', { name, exact: true });
  await page.getByText('3학년 2학기, 취업').waitFor();
  await check(page, 'me');
  // 처음 질문·분야 고치기
  await page.getByRole('link', { name: /처음 질문/ }).click();
  await at(page, '/me/answers');
  await button('4학년 이상').click();
  await check(page, 'me-answers');
  await button('저장하기').click();
  await at(page, '/me');
  await page.getByText('4학년 이상 2학기, 취업').waitFor();
  await page.getByRole('link', { name: /고른 분야/ }).click();
  await page.getByText('5개 골랐어요').waitFor();
  await button('머신러닝 빼기').click();
  await check(page, 'me-fields');
  await button('저장하기').click();
  await at(page, '/me');
  ok(Number((await db.sql`select count(*)::int n from student_fields where student_id = ${id}`)[0].n) === 4, '분야: 고친 것이 저장되지 않았다');
  // 프롬프트: 글자 수, 저장하지 않고 나가면 묻기
  await page.getByRole('link', { name: /나에 대한 프롬프트/ }).click();
  const area = page.getByRole('textbox', { name: '나에 대한 프롬프트' });
  await area.fill('가'.repeat(1001));
  await page.getByText('1,001/1,000').waitFor();
  ok(await button('저장하기').isDisabled(), '프롬프트: 1,000자를 넘는데 저장이 눌린다');
  await area.fill('백엔드 인턴을 찾고 있어요');
  await check(page, 'prompt');
  await button('뒤로').click();
  await page.getByText('저장하지 않고 나갈까요?').waitFor();
  await check(page, 'leave');
  await button('이어서 쓰기').click();
  await page.goBack();
  await page.getByText('저장하지 않고 나갈까요?').waitFor();
  await button('이어서 쓰기').click();
  await at(page, '/me/prompt');
  ok(await area.inputValue() === '백엔드 인턴을 찾고 있어요', '프롬프트: 이어서 쓰는데 글이 사라졌다');
  // 로그인이 끊긴 채 저장 → 다시 로그인하면 글이 남아 있다
  await db.sql`delete from sessions where student_id = ${id}`;
  await button('저장하기').click();
  await at(page, '/login?to=%2Fme%2Fprompt');
  await login(page, 'me@example.com');
  await at(page, '/me/prompt');
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '백엔드 인턴을 찾고 있어요');
  // 다른 학생이면 남지 않는다
  await area.fill('몰래 쓴 글이에요');
  await db.sql`delete from sessions where student_id = ${id}`;
  await button('저장하기').click();
  await at(page, '/login?to=%2Fme%2Fprompt');
  const other = await doneStudent('other@example.com');
  await login(page, 'other@example.com');
  await at(page, '/me/prompt');
  await page.getByText('0/1,000').waitFor();
  ok(await area.inputValue() === '', '프롬프트: 다른 학생에게 쓰던 글이 보인다');
  ok(await page.evaluate(() => sessionStorage.length) === 0, '쓰던 글이 다른 학생의 저장소에 남았다');
  await open('/me');
  await button('로그아웃').click();
  await at(page, '/login');
  await login(page, 'me@example.com');
  await at(page, '/');
  await open('/me/prompt');
  await area.fill('백엔드 인턴을 찾고 있어요');
  await button('저장하기').click();
  await page.getByText('저장했어요').first().waitFor();
  await button('뒤로').click();
  await at(page, '/me');
  // 나의 분석: 활동 넣기·고치기·지우기, 줄 빼기·되살리기
  await db.sql`insert into actions (student_id, notice_id, kind) values (${id}, 'cse:11', 'like')`;
  await notice(db.sql, { no: 201, title: '같은 분야 공지', core: [t.fields[11].id], deadline: 30 });
  await db.sql`insert into actions (student_id, notice_id, kind) values (${id}, 'cse:201', 'like')`;
  await page.getByRole('link', { name: /나의 분석/ }).click();
  await page.getByText(/관심 있어요가 몰린 분야/).first().waitFor();
  await check(page, 'analysis');
  await page.getByRole('link', { name: '해 온 활동 넣기' }).click();
  await page.getByRole('textbox', { name: '이름' }).fill('교내 해커톤');
  await page.getByRole('combobox', { name: '학기' }).click();
  await page.getByRole('option', { name: '2025년 2학기' }).click();
  await page.getByRole('combobox', { name: '종류' }).click();
  await page.getByRole('option', { name: '해커톤' }).click();
  await page.waitForTimeout(500); // 창이 닫히며 초점을 되돌린 뒤
  await page.getByRole('textbox', { name: '증빙 주소' }).fill('내 블로그');
  await button('저장하기').click();
  await page.getByText(/http:\/\/ 나 https/).first().waitFor();
  await check(page, 'activity');
  await page.getByRole('textbox', { name: '증빙 주소' }).fill('https://example.com/me');
  await button('저장하기').click();
  await at(page, '/me/analysis');
  await page.getByText('2025-2 · 교내 해커톤 · 해커톤').waitFor();
  await page.getByText('증빙 링크').waitFor();
  await page.getByRole('main').locator('li').filter({ hasText: '교내 해커톤' }).getByRole('link', { name: '고치기' }).click();
  await page.getByRole('textbox', { name: '이름' }).fill('교외 해커톤');
  await button('저장하기').click();
  await page.getByText('교외 해커톤').waitFor();
  await page.getByRole('main').locator('li').filter({ hasText: '몰린 분야' }).getByRole('button', { name: '빼기' }).click();
  await button('뺀 줄 1개').click();
  await check(page, 'analysis-excluded');
  await button('되살리기').click();
  await page.getByRole('button', { name: /^뺀 줄/ }).waitFor({ state: 'detached' });
  await page.getByRole('main').locator('li').filter({ hasText: '교외 해커톤' }).getByRole('link', { name: '고치기' }).click();
  await button('활동 지우기').click();
  await button('지우기').click();
  await at(page, '/me/analysis');
  await page.getByText('아직 넣은 활동이 없어요.').waitFor();
  const md = await page.evaluate(async () => { const r = await fetch('/api/me/analysis.md'); return [r.headers.get('content-disposition'), await r.text()]; });
  ok(md[0].includes('analysis.md') && md[1].startsWith('# 나의 분석'), '.md가 파일로 오지 않는다');
  ok(await page.getByRole('link', { name: '.md 파일로 내려받기' }).getAttribute('href') === '/api/me/analysis.md', '.md 주소가 다르다');
  // 끄기·켜기
  await page.getByRole('switch', { name: '나의 분석으로 추천받기' }).click();
  await page.getByText('나의 분석을 끌까요?').waitFor();
  await button('끄기').click();
  await page.getByRole('heading', { name: '나의 분석을 꺼 두었어요' }).waitFor();
  await check(page, 'analysis-off');
  await button('다시 켜기').click();
  await page.getByRole('switch', { name: '나의 분석으로 추천받기' }).waitFor();
  // 새 학기
  await db.sql`update answers set answered_at = now() - interval '400 days', grade = 2, term = 1 where student_id = ${id}`;
  await open('/');
  await page.getByText('새 학기예요').waitFor();
  await check(page, 'home-term');
  await button('닫기').click();
  await open('/');
  await page.getByText(/골랐어요$/).first().waitFor();
  ok(await page.getByText('새 학기예요').count() === 0, '새 학기: 닫았는데 다시 나온다');
  await page.evaluate(() => localStorage.clear());
  await open('/');
  await page.getByRole('button', { name: /학기로 바꾸기$/ }).click();
  await page.getByText('새 학기예요').waitFor({ state: 'detached' });
  ok((await db.sql`select grade from answers where student_id = ${id}`)[0].grade > 2, '새 학기: 바뀌지 않았다');
  // 계정 지우기: 두 번 확인
  await open('/me');
  await button('계정 지우기').click();
  await check(page, 'delete');
  await button('다음').click();
  await page.getByText('지우면 되살릴 수 없어요.').waitFor();
  await button('모두 지우기').click();
  await at(page, '/login');
  ok((await db.sql`select 1 from students where id = ${id}`).length === 0, '계정이 지워지지 않았다');
  ok((await db.sql`select 1 from students where id = ${other}`).length === 1, '다른 계정이 지워졌다');
  await page.context().close();
}

const t = loadTaxonomy('custom');
let failed = null;
try {
  await seedTaxonomy(db.sql, t);
  for (let i = 1; i <= 45; i++) await notice(db.sql, { no: i, title: `공지 ${i}`, kind: i % 3 ? 'job' : 'hackathon', posted: -i, deadline: i % 7 ? i : null, core: [t.fields[i % t.fields.length].id] });
  await notice(db.sql, { no: 101, title: '닫힌 공지', deadline: -3, posted: -40 });
  await notice(db.sql, { no: 102, title: '내려간 공지', down: true });
  await notice(db.sql, { no: 103, title: '오늘 닫히는 공지', deadline: 0 });
  for (const email of ['new@example.com', 'lock@example.com']) await createDevStudent(db.sql, email);
  await new Promise(done => { server.listen(0, '127.0.0.1', done); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
  for (const [name, run] of [['US1', us1], ['US2', us2], ['US3', us3], ['US4', us4]]) {
    if (only && !only.includes(name)) continue;
    const t0 = Date.now();
    await run(base);
    console.log(`${name} ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  }
} catch (e) {
  failed = e;
  if (shots) for (const [i, p] of browser.contexts().flatMap(c => c.pages()).entries()) await p.screenshot({ path: join(shots, `failed-${i}.png`) }).catch(() => {});
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
