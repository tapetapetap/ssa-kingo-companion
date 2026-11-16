import { Badge, Icon, type BadgeTone } from '../../components';
import type { CourseWorld } from '../../domain/courses/plan';
import type { Direction, Lab } from '../../domain/courses/types';
import { areaLabel } from '../../data/courses';
import { LABS_CHECKED } from '../../data/courses/directions';

const UNDERGRAD: Record<Lab['undergrad'], { label: string; tone: BadgeTone }> = {
  open: { label: '학부생 모집·인턴 안내', tone: 'green' },
  member: { label: '학부생 있음(공고 없음)', tone: 'neutral' },
  none: { label: '학부생 안내 없음', tone: 'neutral' }
};

/** 이 길의 연구실: 교수·연구실(새 창)·CSRankings 분야·주제·학부생 표시·졸업생 진로 요약. 출처는 머리에 한 번. */
export function LabList({ w, dir }: { w: CourseWorld; dir: Direction }) {
  const labs = dir.labs.map(id => w.lab.get(id)).filter((l): l is Lab => !!l);
  return (
    <section className="cm-labs" aria-labelledby="cm-labs-title">
      <div className="cm-labs__head">
        <h3 id="cm-labs-title" className="cm-sub__title">이 길의 연구실</h3>
        <span className="cm-labs__src">연구실 홈페이지 기준({LABS_CHECKED} 확인)</span>
      </div>
      <ul className="cm-labs__list">
        {labs.map(l => (
          <li key={l.id} className="cm-lab">
            <p className="cm-lab__who">
              <b>{l.prof}</b>
              {l.url ? (
                <a href={l.url} target="_blank" rel="noopener noreferrer">{l.name || '연구실 홈페이지'}<Icon name="external" size={12} /><span className="sr-only">(새 창)</span></a>
              ) : <span>{l.name}</span>}
            </p>
            <p className="cm-lab__areas">CSRankings {l.areas.map(areaLabel).join(', ')}</p>
            <p className="cm-lab__topics">{l.topics.slice(0, 2).join(', ')}</p>
            <p className="cm-lab__meta">
              <Badge tone={UNDERGRAD[l.undergrad].tone}>{UNDERGRAD[l.undergrad].label}</Badge>
              {l.alumni && <span>졸업생 {l.alumni}</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
