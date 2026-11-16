import { Button } from '../../components';
import { PLAN_GROUPS, type CourseWorld, type Plan, type PlanGroup } from '../../domain/courses/plan';

const GROUP_LABEL: Record<PlanGroup, string> = { now: '지금 들을 만한 과목', later: '나중에 들을 과목', left: '남은 과목', closed: '최근 열리지 않은 과목', other: '로드맵 밖 과목' };

/**
 * 이 길의 과목: 묶음마다 과목 줄과 이유 한 줄(plan.md 규칙 9). 겹치는 상태 문장은 위에서부터 모두 보인다.
 * 줄을 누르면 onPick: 지도에 그려진 과목은 그 점을 찾아 가고, 없는 과목은 서랍을 연다(화면이 고른다).
 */
export function PlanList({ w, plan, onPick, onLabs }: { w: CourseWorld; plan: Plan; onPick: (code: string) => void; onLabs: () => void }) {
  const done = !!plan.progress && plan.progress.done === plan.progress.total;
  const noNow = !plan.needsTerm && plan.items.length > 0 && !plan.items.some(i => i.group === 'now');
  return (
    <section className="cm-plan" aria-labelledby="cm-plan-title">
      <h3 id="cm-plan-title" className="cm-sub__title">들을 과목</h3>
      {done && (
        <div className="cm-plan__done">
          <p>이 길의 과목을 다 들었어요.</p>
          <Button size="sm" onClick={onLabs}>연구실 보기</Button>
        </div>
      )}
      {noNow && <p className="cm-plan__note">{plan.items.some(i => i.missing.length) ? '다음 학기에 들을 과목은 없어요. 먼저 들을 과목부터 채워 보세요.' : '다음 학기에 들을 과목은 없어요. 다른 진로 방향도 골라 보세요.'}</p>}
      {PLAN_GROUPS.map(g => {
        const items = plan.items.filter(i => i.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="cm-plan__group" data-group={g}>
            <h4 className="cm-plan__head">{GROUP_LABEL[g]} <span className="num">{items.length}</span></h4>
            {g === 'left' && <p className="cm-plan__note">학년·학기를 고르면 지금 들을 만한 과목을 골라 줘요.</p>}
            <ul className="cm-plan__list">
              {items.map(i => (
                <li key={i.code}>
                  <button type="button" className="cm-plan__row" onClick={() => onPick(i.code)}>
                    <span className="cm-plan__name">{w.course.get(i.code)?.name ?? i.code}</span>
                    <span className="cm-plan__reason">{i.reasons.map(r => <span key={r}>{r}</span>)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
