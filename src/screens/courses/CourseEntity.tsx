import { Button, Drawer } from '../../components';
import { EntityDrawer, openEntity, registerEntityView } from '../../app/entity';
import { useApp } from '../../app/AppState';
import { directionsOf } from '../../domain/courses/plan';
import { KIND_LABEL, termLabel } from '../../domain/courses/types';
import { areaLabel, WORLD } from '../../data/courses';

/** 과목 서랍: 사실 줄, 먼저 들을 과목·다음 과목(누르면 그 과목 서랍), 이어지는 진로 방향, '들었어요'. 과목표에 없으면 기본 서랍의 '찾지 못했어요'. */
function CourseEntity({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, run } = useApp();
  const course = WORLD.course.get(id);
  if (!course) return <EntityDrawer target={{ kind: 'course', id }} onClose={onClose} />;

  const place = WORLD.place.get(id);
  const field = place && WORLD.major.fields.find(f => f.id === place.field);
  const taken = new Set(state.courses.taken);
  const facts: [string, string][] = [['학수번호', course.code], ['학점', `${course.credits}학점`]];
  if (course.dept !== WORLD.major.name) facts.push(['개설 학과', course.dept]);
  facts.push(['권장 학기', !place ? '로드맵 밖 과목' : place.term ? termLabel(place.term) : '학기 없음(경험 층)']);
  if (place) facts.push(['이수구분', KIND_LABEL[place.kind]]);
  // 줄 이름과 CSRankings 분야 이름이 같으면(머신러닝 등) 한 번만 쓴다
  const area = place?.area && areaLabel(place.area);
  if (field) facts.push(['분야', !area ? field.label : area === field.label ? `${field.label}(CSRankings 분야)` : `${field.label} · CSRankings ${area}`]);
  facts.push(['개설', course.offered ? '최근 열린 과목' : '최근 열리지 않은 과목(교육과정 표 기준) · 다음 학기 시간표에서 확인해요']);

  const name = (c: string) => WORLD.course.get(c)?.name ?? c;
  const links = (codes: string[], empty: string) => codes.length ? (
    <ul className="cm-drawer__links">
      {codes.map(c => (
        <li key={c}>
          <button type="button" className="cm-drawer__link" onClick={() => openEntity({ kind: 'course', id: c })}>{name(c)}</button>
          {taken.has(c) && <span className="cm-drawer__taken">들음</span>}
        </li>
      ))}
    </ul>
  ) : <p className="cm-drawer__empty">{empty}</p>;
  const dirs = directionsOf(id, WORLD);
  const isTaken = taken.has(id);

  return (
    <Drawer
      open title={course.name} onClose={onClose}
      footer={
        // 누를 때마다 이름이 바뀌는 동작 버튼이라 aria-pressed 는 두지 않는다. 되돌리기는 이 버튼을 다시 누르는 것(토스트 되돌리기는 교과 조각 전체를 되돌려 함께 바꾼 학기·방향까지 지운다)
        <Button variant={isTaken ? 'secondary' : 'primary'} onClick={() => run({ type: 'courses/taken', code: id }, { toast: isTaken ? '들은 과목에서 뺐어요.' : '들은 과목에 넣었어요.' })}>
          {isTaken ? '들었어요 취소' : '들었어요'}
        </Button>
      }
    >
      <div className="cm-drawer">
        <dl className="app-entity__facts">
          {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <section className="cm-drawer__sec" aria-labelledby="cm-before">
          <h3 id="cm-before">먼저 들을 과목</h3>
          {links(WORLD.before.get(id) ?? [], '먼저 들을 과목 없이 바로 들을 수 있어요.')}
        </section>
        <section className="cm-drawer__sec" aria-labelledby="cm-after">
          <h3 id="cm-after">다음 과목</h3>
          {links(WORLD.after.get(id) ?? [], '이 과목을 먼저 들으라는 과목은 아직 없어요.')}
        </section>
        <section className="cm-drawer__sec" aria-labelledby="cm-dirs">
          <h3 id="cm-dirs">이어지는 진로 방향</h3>
          {dirs.length ? <p>{dirs.map(d => d.name).join(', ')}</p> : <p className="cm-drawer__empty">이 과목을 꼽은 연구실이 아직 없어요.</p>}
        </section>
        <p className="cm-drawer__note">{WORLD.major.checked === 'example' && '분야·방향 연결은 학과 확인 전이에요. '}먼저 들을 과목은 권장이에요.</p>
      </div>
    </Drawer>
  );
}

registerEntityView('course', CourseEntity);
