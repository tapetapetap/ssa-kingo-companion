import { useEffect, useMemo, useState } from 'react';
import { Button, Legend, PageHeader, Switch, type LegendItem } from '../../components';
import { openEntity, useEntity } from '../../app/entity';
import { navigate, useQuery, withParam } from '../../app/router';
import { useApp } from '../../app/AppState';
import { planOf } from '../../domain/courses/plan';
import { isTerm, TERMS, termLabel, type CsrGroup } from '../../domain/courses/types';
import { AREA_GROUP, WORLD } from '../../data/courses';
import { CSR_GROUP_LABEL } from '../../data/courses/csrankings';
import { CourseMap } from './CourseMap';
import './CourseEntity';
import { LabList } from './LabList';
import { mapShape } from './map';
import { PlanList } from './PlanList';
import './courses.css';

const GROUPS: CsrGroup[] = ['ai', 'systems', 'theory', 'inter'];
const BY_GROUP = GROUPS.map(g => ({ g, dirs: WORLD.directions.filter(d => AREA_GROUP.get(d.area) === g) })).filter(x => x.dirs.length);
const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ block: 'start' });
/** 목록에서 고른 과목의 점을 강조해 두는 시간 */
const FOUND_MS = 1600;

/**
 * 교과: 소프트웨어학과 로드맵 과목을 학기 8칸 × 지도 줄(CSRankings 기준)에 놓은 지도 하나가 주인공이다.
 * 진로 방향을 고르면 그 길이 밝아지고, 같은 스크롤 칸의 지도 아래에 이 길의 과목·연구실이 붙는다(spec 20261116-055246-sw-course-map).
 */
export default function CoursesPage() {
  const { state, run } = useApp();
  const cs = state.courses;
  // 거르기 스위치는 주소에 남긴다(?closed=1). 서랍 주소(?drawer=)와 함께 쓴다
  const showClosed = useQuery().get('closed') === '1';
  const setShowClosed = (on: boolean) => navigate(withParam(location.hash, 'closed', on ? '1' : undefined), { replace: true });
  // 같은 줄을 다시 골라도 강조 시간을 새로 센다(at)
  const [found, setFound] = useState<{ code: string; at: number }>();
  const current = useEntity().current;
  const selected = current?.kind === 'course' ? current.id : undefined;
  const dir = WORLD.directions.find(d => d.id === cs.direction);
  const plan = useMemo(() => planOf(WORLD, cs), [cs]);
  const shape = useMemo(() => mapShape(WORLD, cs, plan, showClosed, selected), [cs, plan, showClosed, selected]);
  const nowCount = plan.items.filter(i => i.group === 'now').length;
  const open = (code: string) => openEntity({ kind: 'course', id: code });
  // 한 화면에서 같은 서랍으로 가는 길은 하나(ia-navigation 2절): 지도에 그려진 과목은 목록 줄이 점을 찾아 가고, 서랍은 점에서 연다.
  const pick = (code: string) => {
    if (!shape.drawn.has(code)) return open(code);
    setFound({ code, at: Date.now() });
    const dot = document.querySelector<HTMLElement>(`.cm__item[data-code="${code}"]`);
    dot?.scrollIntoView({ block: 'center' });
    dot?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!found) return;
    const t = setTimeout(() => setFound(undefined), FOUND_MS);
    return () => clearTimeout(t);
  }, [found]);

  // 범례에는 지금 지도에 보이는 모양만(FR-003)
  const dots = [...shape.lines.flatMap(l => (l.kind === 'row' ? l.dots : [])), ...shape.experience, ...shape.outside];
  const has = (st: string) => dots.some(d => d.state === st);
  const marks: (LegendItem | false)[] = [
    has('taken') && { label: '들은 과목', mark: 'dot', tone: 'dev' },
    has('open') && { label: '들을 수 있는 과목', mark: 'dashed', tone: 'other' },
    has('now') && { label: '지금 들을 만한 과목', mark: 'ring', tone: 'accent' },
    has('closed') && { label: '최근 안 열린 과목', mark: 'ring', tone: 'muted' },
    dots.some(d => d.dim) && { label: '이 길 밖 과목', mark: 'faded', tone: 'muted' }
  ];
  const legend = marks.filter((x): x is LegendItem => !!x);

  return (
    <div className="os">
      <PageHeader
        title="교과 지도"
        actions={
          <select className="cm-pick" aria-label="지금 학년·학기" data-on={cs.term ? true : undefined} value={cs.term ?? ''} onChange={e => isTerm(e.target.value) && run({ type: 'courses/term', term: e.target.value })}>
            {!cs.term && <option value="" disabled>학년·학기 고르기</option>}
            {TERMS.map(t => <option key={t} value={t}>{termLabel(t)}</option>)}
          </select>
        }
      />
      <div className="os__body cm-home">
        <section className="os-card cm-card" aria-labelledby="cm-title">
          <div className="cm-card__head">
            <h2 id="cm-title" className="cm-card__title">소프트웨어학과 로드맵</h2>
            <select className="cm-pick" aria-label="진로 방향" data-on={dir ? true : undefined} value={dir?.id ?? ''} onChange={e => run({ type: 'courses/direction', direction: e.target.value || null })}>
              <option value="">{dir ? '방향 없이 보기' : '진로 방향 고르기'}</option>
              {BY_GROUP.map(({ g, dirs }) => (
                <optgroup key={g} label={CSR_GROUP_LABEL[g]}>
                  {dirs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </optgroup>
              ))}
            </select>
            <Legend items={legend} place="head" />
          </div>
          <div className="cm-card__meta">
            <p className="cm-card__status">
              {dir && plan.progress ? (
                <>
                  이 길의 과목 {plan.progress.total}개 중 {plan.progress.done}개 들었어요{cs.term && <> · 지금 들을 만한 과목 {nowCount}개</>}
                  <Button size="sm" variant="ghost" onClick={() => goTo('cm-plan-title')}>목록 보기</Button>
                </>
              ) : !cs.term ? '학년·학기를 고르면 지금 칸과 들을 만한 과목이 보여요' : '진로 방향을 고르면 그 길이 밝아져요'}
            </p>
            <span className="cm-card__note">분야: CSRankings 기준{WORLD.major.checked === 'example' && ' · 연결은 학과 확인 전'}</span>
            <Switch checked={showClosed} onChange={setShowClosed} label="최근 안 열린 과목" />
          </div>
          <div className="os-scroll cm-card__body">
            <CourseMap shape={shape} selected={selected} found={found?.code} onSelect={open} />
            {dir && (
              <div className="cm-lists">
                <PlanList w={WORLD} plan={plan} onPick={pick} onLabs={() => goTo('cm-labs-title')} />
                <LabList w={WORLD} dir={dir} />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
