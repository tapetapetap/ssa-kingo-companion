import { Fragment, useMemo } from 'react';
import { useLinkPaths } from '../../components';
import { termLabel } from '../../domain/courses/types';
import { OUTSIDE_LABEL, STATE_LABEL, type MapDot, type MapShape } from './map';

/**
 * 교과 지도(기록 지도와 같은 틀): 학기 8칸 위에 줄마다 과목 점과 이름. 학기 머리 줄은 스크롤 칸 위에 붙는다.
 * 색은 분야가 아니라 과목 상태(들음·지금 들을 만함·들을 수 있음·최근 안 열림), 길 밖 과목은 옅게. 점을 누르면 과목 서랍이 열린다.
 */
export function CourseMap({ shape, selected, found, onSelect }: { shape: MapShape; selected?: string; found?: string; onSelect: (code: string) => void }) {
  const links = useMemo(() => shape.links.map(l => ({ key: `${l.from}>${l.to}`, ...l, className: 'cm__line' })), [shape.links]);
  const { wrap, nodeRef, paths } = useLinkPaths<HTMLDivElement>(links);

  const item = (d: MapDot) => (
    <button
      key={d.code} ref={nodeRef(d.code)} type="button" className="cm__item" data-code={d.code} data-state={d.state} data-dim={d.dim || undefined} data-found={found === d.code || undefined} aria-pressed={selected === d.code} title={d.name}
      aria-label={`${d.name}, ${d.row}, ${d.term ? `권장 ${termLabel(d.term)}` : '학기 없음'}, ${STATE_LABEL[d.state]}${d.dim ? ', 이 길 밖' : ''}`}
      onClick={() => onSelect(d.code)}
    >
      <span className="cm__dot" aria-hidden="true" />
      <span className="cm__label">{d.name}</span>
    </button>
  );

  return (
    <div ref={wrap} className="cm" role="group" aria-label="교과 지도" style={{ gridTemplateColumns: `fit-content(var(--cm-label-w)) repeat(${shape.cols.length}, minmax(0, 1fr))` }}>
      <svg className="cm__lines" aria-hidden="true">
        {paths.map(p => <path key={p.key} d={p.d} className={p.className} />)}
      </svg>
      <span className="cm__corner" />
      {shape.cols.map(c => (
        <span key={c.id} className="cm__col" data-now={c.now || undefined}>
          {c.label}{c.now && <b className="cm__now">지금</b>}
        </span>
      ))}
      {shape.lines.map(l => l.kind === 'group' ? (
        <p key={`g-${l.id}`} className="cm__group">{l.label}</p>
      ) : (
        <Fragment key={l.field.id}>
          <span className="cm__row">{l.field.label}</span>
          {shape.cols.map(c => <div key={c.id} className="cm__cell">{l.dots.filter(d => d.term === c.id).map(item)}</div>)}
        </Fragment>
      ))}
      {shape.folded.length > 0 && <p className="cm__folded"><span>이 길에 없는 분야</span><b>{shape.folded.map(f => f.label).join(', ')}</b></p>}
      {shape.experience.length > 0 && (
        <>
          <span className="cm__row">경험</span>
          <div className="cm__cell cm__cell--wide">{shape.experience.map(item)}</div>
        </>
      )}
      {shape.outside.length > 0 && (
        <>
          <span className="cm__row">{OUTSIDE_LABEL}</span>
          <div className="cm__cell cm__cell--wide">{shape.outside.map(item)}</div>
        </>
      )}
    </div>
  );
}
