// 임베딩 지도(US7, 지도 시안): 상태를 색과 모양 둘 다로 나타낸다. 목록만으로도 모든 일을 할 수 있다(점은 눌러도 되고 안 눌러도 된다)
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Switch } from '@astryxdesign/core/Switch';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Heading, Text } from '@astryxdesign/core/Text';
import { KIND_LABEL } from '../../../etl/notices/classify.ts';
import { api, type FieldMap, type MapNotice } from './api.ts';
import { when } from './format.ts';

const W = 860;
const H = 640;
const PAD = 24;
const K = ['3', '5', '10', '15'];
const PERIOD = [['all', '전체 기간'], ['30', '최근 30일'], ['7', '최근 7일']];
const ALL = 'all';
const kindName = (k: string | null) => (k ? KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k : '없음');
const x = (v: number) => PAD + v * (W - PAD * 2);
const y = (v: number) => PAD + v * (H - PAD * 2);
const options = (all: string, xs: [string, string][]) => [{ value: ALL, label: all }, ...xs.map(([value, label]) => ({ value, label }))];
type Focus = { kind: 'notice'; id: string } | { kind: 'fields'; ids: string[] } | null;
type Status = 'ok' | 'far' | 'none';
const NOTE: Record<Status, string> = { ok: '핵심 분야 있음', far: '멀리 붙음', none: '핵심 분야 없음' };

/** 공지 점: 핵심 있음은 파란 동그라미, 멀리 붙음은 노란 세모, 핵심 없음은 빈 동그라미 */
function Mark({ s, cx, cy }: { s: Status; cx: number; cy: number }) {
  if (s === 'far') return <path d={`M${cx} ${cy - 8}l8 13h-16z`} fill="var(--color-warning)" stroke="var(--color-text-primary)" strokeWidth={1} />;
  return s === 'ok' ? <circle cx={cx} cy={cy} r={4} fill="var(--color-accent)" fillOpacity={0.7} /> : <circle cx={cx} cy={cy} r={4} fill="none" stroke="var(--color-text-secondary)" strokeWidth={1.5} />;
}
const Diamond = ({ cx, cy }: { cx: number; cy: number }) => <path d={`M${cx} ${cy - 5}l5 5l-5 5l-5 -5z`} fill="var(--color-text-primary)" />;

export function EmbedMap({ onReview }: { onReview: (noticeId: string) => void }) {
  const [data, setData] = useState<FieldMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setError(null); api<FieldMap>('GET', '/api/ops/map').then(setData, e => setError(e instanceof Error ? e.message : String(e))); };
  useEffect(load, []);
  if (error) return <EmptyState title="불러오지 못했어요" description={error} actions={<Button label="다시 불러오기" onClick={load} />} />;
  if (!data) return <Spinner label="불러오는 중이에요" />;
  return (
    <VStack gap={4} padding={6} style={{ wordBreak: 'keep-all' }}>
      <VStack gap={1}>
        <Heading level={1}>임베딩 지도</Heading>
        <Text type="supporting" color="secondary">{data.at ? `${when(data.at)}에 만듦. 뜻이 가까운 분야와 공지를 가깝게 놓았어요. 점 사이 거리는 대략이에요.` : '뜻이 가까운 분야와 공지를 가깝게 놓은 지도예요.'}</Text>
      </VStack>
      {data.at === null ? <EmptyState title="아직 지도가 없어요" description={data.reason} /> : (
        <>
          {data.stale && <Banner status="warning" title="앞서 만든 지도예요" description="마지막 매일 작업에서 지도를 만들지 못했어요. 까닭은 수집과 판정 메뉴에 있어요." />}
          <Body data={data} onReview={onReview} />
        </>
      )}
    </VStack>
  );
}

function Body({ data, onReview }: { data: Extract<FieldMap, { at: string }>; onReview: (id: string) => void }) {
  const [k, setK] = useState('5');
  const [period, setPeriod] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [group, setGroup] = useState(ALL);
  const [review, setReview] = useState(false);
  const [list, setList] = useState('far');
  const [focus, setFocus] = useState<Focus>(null);
  const field = useMemo(() => new Map(data.fields.map(f => [f.id, f])), [data]);
  const name = (id: string) => field.get(id)?.name ?? '지금 목록에 없는 분야';
  const groups = useMemo(() => [...new Map(data.fields.map(f => [f.group, f.groupName]))], [data]);
  const status = (n: MapNotice): Status => (n.rank === null ? 'none' : n.rank > Number(k) ? 'far' : 'ok');
  const groupOf = (n: MapNotice) => field.get(n.core[0] ?? n.first)?.group;
  const since = period === ALL ? '' : new Date(Date.now() + 9 * 3600_000 - Number(period) * 86400_000).toISOString().slice(0, 10);
  const notices = data.notices.filter(n => n.postedOn >= since && (source === ALL || n.source === source) && (kind === ALL || n.kind === kind) && (group === ALL || groupOf(n) === group) && (!review || n.review));
  const shown = new Set(notices.map(n => n.id));
  const fields = data.fields.filter(f => group === ALL || f.group === group);
  const inGroup = (id: string) => group === ALL || field.get(id)?.group === group;
  const far = notices.filter(n => status(n) === 'far').sort((a, b) => b.rank! - a.rank!);
  const pairs = data.pairs.filter(p => inGroup(p.a) || inGroup(p.b));
  const empty = data.empty.map(e => ({ ...e, notices: e.notices.filter(id => shown.has(id)) })).filter(e => e.notices.length >= 3);
  const unused = data.unused.filter(inGroup);
  const counts = { ok: 0, far: 0, none: 0 };
  for (const n of notices) counts[status(n)]++;

  const picked = focus?.kind === 'notice' ? data.notices.find(n => n.id === focus.id) ?? null : null;
  const ring: CSSProperties = { pointerEvents: 'none' };
  const lists: Record<string, { label: string; n: number; none: string }> = {
    far: { label: '멀리 붙음', n: far.length, none: '이 기준으로 멀리 붙은 공지가 없어요. 분류기는 가까운 3위 안의 분야만 핵심으로 붙여서, 운영자가 고친 공지 말고는 보통 없어요.' }, pairs: { label: '헷갈림', n: pairs.length, none: '없어요.' },
    empty: { label: '빈 곳', n: empty.length, none: '핵심이 없는 공지 3건 이상이 모인 곳이 없어요.' }, unused: { label: '안 쓰임', n: unused.length, none: '모든 분야가 한 번은 쓰였어요.' }
  };
  return (
    <VStack gap={4}>
      <HStack gap={3} wrap="wrap" vAlign="end">
        <Selector label="멀리 붙은 기준" options={K.map(v => ({ value: v, label: `가까운 분야 ${v}위 밖` }))} value={k} onChange={v => setK(v ?? '5')} />
        <Selector label="기간" options={PERIOD.map(([value, label]) => ({ value, label }))} value={period} onChange={v => setPeriod(v ?? ALL)} />
        <Selector label="출처" options={options('모든 출처', [...new Set(data.notices.map(n => n.source))].map(s => [s, s]))} value={source} onChange={v => setSource(v ?? ALL)} />
        <Selector label="종류" options={options('모든 종류', Object.entries(KIND_LABEL))} value={kind} onChange={v => setKind(v ?? ALL)} />
        <Selector label="큰 분야" options={options('모든 큰 분야', groups)} value={group} onChange={v => setGroup(v ?? ALL)} />
        <Switch label="확인할 것만" value={review} onChange={setReview} size="sm" />
      </HStack>
      <HStack gap={4} vAlign="start" wrap="wrap">
        <Card padding={3} style={{ flex: '2 1 560px', minWidth: 0 }}>
          <VStack gap={2}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label={`세부 분야 ${fields.length}개와 공지 ${notices.length}개의 지도. 같은 내용이 오른쪽 목록에 있어요`}>
              {picked && field.has(picked.core[0]) && <line x1={x(picked.x)} y1={y(picked.y)} x2={x(field.get(picked.core[0])!.x)} y2={y(field.get(picked.core[0])!.y)} stroke="var(--color-accent)" strokeWidth={2} />}
              {picked && field.has(picked.first) && <line x1={x(picked.x)} y1={y(picked.y)} x2={x(field.get(picked.first)!.x)} y2={y(field.get(picked.first)!.y)} stroke="var(--color-text-secondary)" strokeWidth={2} strokeDasharray="4 4" />}
              {notices.map(n => <g key={n.id} onClick={() => setFocus({ kind: 'notice', id: n.id })} style={{ cursor: 'pointer' }}><title>{`${n.title} (${NOTE[status(n)]}${n.rank ? `, ${n.rank}위` : ''})`}</title><circle cx={x(n.x)} cy={y(n.y)} r={9} fill="transparent" /><Mark s={status(n)} cx={x(n.x)} cy={y(n.y)} /></g>)}
              {fields.map(f => <g key={f.id} onClick={() => setFocus({ kind: 'fields', ids: [f.id] })} style={{ cursor: 'pointer' }}><title>{`${f.name} (${f.groupName})`}</title><circle cx={x(f.x)} cy={y(f.y)} r={9} fill="transparent" /><Diamond cx={x(f.x)} cy={y(f.y)} /></g>)}
              {(focus?.kind === 'fields' ? focus.ids : picked ? [picked.core[0], picked.first] : []).flatMap(id => field.get(id) ?? []).map(f => (
                <g key={f.id} style={ring}>
                  <circle cx={x(f.x)} cy={y(f.y)} r={12} fill="none" stroke="var(--color-accent)" strokeWidth={3} />
                  <text x={x(f.x) > W - 160 ? x(f.x) - 16 : x(f.x) + 16} y={y(f.y) + 5} textAnchor={x(f.x) > W - 160 ? 'end' : 'start'} fontSize={14} fontWeight={600} fill="var(--color-text-primary)" stroke="var(--color-background-card)" strokeWidth={4} paintOrder="stroke">{f.name}</text>
                </g>
              ))}
              {picked && <circle cx={x(picked.x)} cy={y(picked.y)} r={14} fill="none" stroke="var(--color-accent)" strokeWidth={3} style={ring} />}
            </svg>
            <HStack gap={4} wrap="wrap" vAlign="center">
              {(['ok', 'far', 'none'] as const).map(s => <HStack key={s} gap={1} vAlign="center"><svg width={20} height={20} aria-hidden><Mark s={s} cx={10} cy={10} /></svg><Text type="supporting">{`${NOTE[s]} ${counts[s]}`}</Text></HStack>)}
              <HStack gap={1} vAlign="center"><svg width={20} height={20} aria-hidden><Diamond cx={10} cy={10} /></svg><Text type="supporting">{`세부 분야 ${fields.length}`}</Text></HStack>
              {data.noVector > 0 && <Text type="supporting" color="secondary">{`벡터 없음 ${data.noVector}개는 놓지 않았어요`}</Text>}
            </HStack>
          </VStack>
        </Card>
        <VStack gap={4} style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Card padding={4}>
            {picked ? (
              <VStack gap={2}>
                <Heading level={2}>{picked.title}</Heading>
                <Text type="supporting" color="secondary">{`${kindName(picked.kind)}, 마감 ${picked.deadline ?? '없음'}, 게시 ${picked.postedOn}`}</Text>
                <Text>{picked.core.length ? `핵심 ${picked.core.map(name).join(', ')}` : '핵심 분야 없음'}</Text>
                <Text>{`벡터가 가장 가까운 분야는 ${name(picked.first)}${picked.rank ? `, 첫 핵심은 ${picked.rank}위` : ''}`}</Text>
                <HStack gap={2}><Button label="판정 검토에서 보기" variant="primary" onClick={() => onReview(picked.id)} /><Button label="닫기" variant="ghost" onClick={() => setFocus(null)} /></HStack>
              </VStack>
            ) : <Text color="secondary">점이나 목록을 누르면 그 자리를 보여 줘요. 공지는 첫 핵심 분야를 실선, 벡터가 가장 가까운 분야를 점선으로 이어요.</Text>}
          </Card>
          <Card padding={4}>
            <VStack gap={2}>
              <TabList value={list} onChange={setList} size="sm" role="tablist">{Object.entries(lists).map(([id, l]) => <Tab key={id} value={id} label={`${l.label} ${l.n}`} />)}</TabList>
              {lists[list].n === 0 ? <Text color="secondary">{lists[list].none}</Text> : (
                <List density="compact" hasDividers style={{ maxHeight: 480, overflowY: 'auto' }}>
                  {list === 'far' && far.map(n => <ListItem key={n.id} label={n.title} isSelected={picked?.id === n.id} description={`핵심 ${name(n.core[0])}, ${n.rank}위`} onClick={() => setFocus({ kind: 'notice', id: n.id })} />)}
                  {list === 'pairs' && pairs.map(p => <ListItem key={`${p.a}-${p.b}`} label={`${name(p.a)}, ${name(p.b)}`} description={`뜻이 ${(p.sim * 100).toFixed(0)}% 가까워요`} onClick={() => setFocus({ kind: 'fields', ids: [p.a, p.b] })} />)}
                  {list === 'empty' && empty.map(e => <ListItem key={e.field} label={`${name(e.field)} 근처`} description={`핵심이 없는 공지 ${e.notices.length}건`} onClick={() => setFocus({ kind: 'fields', ids: [e.field] })} />)}
                  {list === 'unused' && unused.map(id => <ListItem key={id} label={name(id)} description={field.get(id)?.groupName} onClick={() => setFocus({ kind: 'fields', ids: [id] })} />)}
                </List>
              )}
            </VStack>
          </Card>
        </VStack>
      </HStack>
    </VStack>
  );
}
