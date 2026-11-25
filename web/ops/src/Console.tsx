// 판정 검토 화면(ops-screen.md): 머리 | 확인할 것 목록 | 오른쪽 칸(파일 값·고치는 칸·고친 기록). 틀은 astryx incident-console
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Switch } from '@astryxdesign/core/Switch';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { useToast } from '@astryxdesign/core/Toast';
import { Token } from '@astryxdesign/core/Token';
import { KIND_LABEL } from '../../../etl/notices/classify.ts';
import { api, ApiError, type FieldList, type LogItem, type OpsNotice, type ReviewItem } from './api.ts';

const styles: Record<string, CSSProperties> = {
  contentFill: { height: '100%', minHeight: 0 },
  rows: { overflowY: 'auto', minHeight: 0 },
  inspector: { padding: 'var(--spacing-4)', height: '100%', overflowY: 'auto' }
};

const KST = 'Asia/Seoul';
const FIELD_LABEL: Record<string, string> = { isNotice: '공지인지', kind: '종류', deadline: '마감', fields: '분야' };
const kindName = (k: string | null) => (k ? KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k : '없음');
const reasonName = (r: string) => (r.startsWith('review:') ? `확인 필요: ${r.slice(7)}` : r === 'no_deadline' ? '마감 없음' : r === 'no_fields' ? '분야 칸 빔' : r);
const names = (xs: { name: string }[]) => (xs.length ? xs.map(x => x.name).join(', ') : '없음');

type Draft = { isNotice: boolean; kind: string | null; deadline: string | null; core: string[]; related: string[] };
const draftOf = (n: OpsNotice): Draft => ({
  isNotice: n.shown.isNotice, kind: n.shown.kind, deadline: n.shown.deadline,
  core: n.shown.fields?.core.map(f => f.id) ?? [], related: n.shown.fields?.related.map(f => f.id) ?? []
});
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 고친 기록의 값 한 줄 */
function valueText(field: string | null, v: unknown, fieldName: (id: string) => string): string {
  if (v === null || v === undefined) return field === 'deadline' ? '마감 없음' : field === 'fields' ? '분야 없음' : '없음';
  if (field === 'isNotice') return v ? '공지' : '공지 아님';
  if (field === 'kind') return kindName(String(v));
  if (field === 'fields') {
    const f = v as { core: string[]; related: string[] };
    return `핵심 ${f.core.map(fieldName).join(', ') || '없음'} · 관련 ${f.related.map(fieldName).join(', ') || '없음'}`;
  }
  return String(v);
}

function Inspector({ notice, log, fields, onDone, onDirty }: { notice: OpsNotice; log: LogItem[]; fields: FieldList; onDone: () => Promise<void>; onDirty: (dirty: boolean) => void }) {
  const showToast = useToast();
  const [draft, setDraft] = useState(() => draftOf(notice));
  const [error, setError] = useState<ApiError | null>(null);
  const now = draftOf(notice);
  const fieldName = useCallback((id: string) => fields.fields.find(f => f.id === id)?.name ?? id, [fields]);
  const options = useMemo(() => fields.groups.map(g => ({
    type: 'section' as const, title: g.name, options: fields.fields.filter(f => f.group === g.id).map(f => ({ value: f.id, label: f.name }))
  })).filter(s => s.options.length), [fields]);
  const changes: Record<string, unknown> = {};
  if (draft.isNotice !== now.isNotice) changes.isNotice = draft.isNotice;
  if (draft.kind !== now.kind) changes.kind = draft.kind;
  if (draft.deadline !== now.deadline) changes.deadline = draft.deadline;
  if (!same(draft.core, now.core) || !same(draft.related, now.related)) changes.fields = { core: draft.core, related: draft.related };
  const dirty = Object.keys(changes).length > 0;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const statusOf = (field: string) => (error?.field === field ? { type: 'error' as const, message: error.message } : undefined);
  const f = notice.file;
  /** 칸 아래 설명: 결과 파일 값과, 운영자가 고쳤으면 누가 */
  const note = (k: keyof OpsNotice['human'], fileValue: string) => {
    const h = notice.human[k];
    return `파일 값: ${fileValue}${h ? ` · 운영자가 고침(${h.by})` : ''}`;
  };
  const fileFields = (lv: 'core' | 'related') => (f.fields ? names(f.fields[lv]) : '판정 안 함');

  const run = async (what: string, call: () => Promise<unknown>) => {
    setError(null);
    try {
      await call();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('server_error', '잠시 뒤에 다시 해 주세요');
      setError(err);
      if (!err.field || !FIELD_LABEL[err.field]) showToast({ body: err.message, type: 'error', uniqueID: 'ops-action' });
      return;
    }
    showToast({ body: what, uniqueID: 'ops-action' });
    // 처리는 됐다. 새로 받기가 실패해도 처리 실패로 알리지 않는다(다시 누르면 기록이 겹친다)
    await onDone().catch(() => showToast({ body: '처리는 됐는데 목록을 새로 받지 못했어요', type: 'error', uniqueID: 'ops-refresh' }));
  };

  return (
    <VStack gap={4} style={styles.inspector}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <Text type="supporting" color="secondary">{notice.id} · 게시 {notice.postedOn}{notice.host ? ` · ${notice.host}` : ''}</Text>
          {notice.down && <Token size="sm" color="gray" label="내려감" />}
        </HStack>
        <Heading level={2}>{notice.title}</Heading>
        <Link href={notice.url} isExternalLink>원문 보기</Link>
      </VStack>

      <MetadataList columns="single" label={{ position: 'start', width: 96 }}>
        <MetadataListItem label="파일 판정"><Text type="body">{f.verdict === 'review' ? `확인 필요(${f.reason ?? '이유 없음'})` : '기회'}</Text></MetadataListItem>
        <MetadataListItem label="판정한 곳"><Text type="body">{f.rule ?? '없음'}{f.deadlineRule ? ` · 마감은 ${f.deadlineRule}` : ''}</Text></MetadataListItem>
      </MetadataList>
      <Divider />

      <VStack gap={3}>
        <Heading level={3}>학생에게 보이는 값</Heading>
        <Switch label="학생에게 보이는 공지예요" value={draft.isNotice} onChange={v => setDraft({ ...draft, isNotice: v })} description={note('isNotice', f.verdict === 'review' ? '공지 아님' : '공지')} status={statusOf('isNotice')} />
        <Selector label="종류" value={draft.kind ?? undefined} placeholder="종류를 고르세요" options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={v => setDraft({ ...draft, kind: v })} description={note('kind', kindName(f.kind))} status={statusOf('kind')} />
        <DateInput label="마감" value={(draft.deadline ?? undefined) as ISODateString | undefined} hasClear format="date" placeholder="마감 없음" presentation="popover"
          onChange={v => setDraft({ ...draft, deadline: v ?? null })} description={`${note('deadline', f.deadline ?? '없음')} · 지우면 마감 없음으로 정해요`} status={statusOf('deadline')} />
        <MultiSelector label="핵심 분야(2개까지)" value={draft.core} options={options} hasSearch searchPlaceholder="분야 찾기" triggerDisplay="labels" placeholder="없음"
          onChange={v => setDraft({ ...draft, core: v })} description={note('fields', fileFields('core'))}
          status={draft.core.length > 2 ? { type: 'error', message: '핵심 분야는 2개까지예요' } : statusOf('fields')} />
        <MultiSelector label="관련 분야(5개까지)" value={draft.related} options={options} hasSearch searchPlaceholder="분야 찾기" triggerDisplay="labels" placeholder="없음"
          onChange={v => setDraft({ ...draft, related: v })} description={`파일 값: ${fileFields('related')}`}
          status={draft.related.length > 5 ? { type: 'error', message: '관련 분야는 5개까지예요' } : undefined} />
        <HStack gap={2} wrap="wrap">
          <Button label="고친 값 저장" variant={dirty ? 'primary' : 'secondary'} isDisabled={!dirty || draft.core.length > 2 || draft.related.length > 5}
            clickAction={() => run('고친 값을 저장했어요', () => api('PUT', `/api/ops/notices/${encodeURIComponent(notice.id)}/verdict`, changes))} />
          <Button label="맞아요" variant={dirty ? 'secondary' : 'primary'} isDisabled={dirty} tooltip="값을 그대로 두고 확인한 것으로 남겨요"
            clickAction={() => run('확인한 것으로 남겼어요', () => api('POST', `/api/ops/notices/${encodeURIComponent(notice.id)}/confirm`))} />
          <Button label="다시 판정" variant="ghost" tooltip="원문이 고쳐졌을 때 써요. 다음 매일 작업에서 다시 판정해요"
            clickAction={() => run('다음 매일 작업에서 다시 판정해요', () => api('POST', `/api/ops/notices/${encodeURIComponent(notice.id)}/rejudge`))} />
          {dirty && <Button label="되돌리기" variant="ghost" onClick={() => { setDraft(now); setError(null); }} />}
        </HStack>
      </VStack>

      <Divider />

      <VStack gap={2}>
        <Heading level={3}>고친 기록</Heading>
        {log.length === 0 ? <Text type="supporting" color="secondary">아직 고친 적이 없어요</Text> : (
          <List density="compact">
            {log.map((l, i) => (
              <ListItem key={`${l.at}-${i}`}
                label={l.action === 'confirm' ? '맞아요' : l.action === 'rejudge' ? '다시 판정 표시' : `${FIELD_LABEL[l.field ?? ''] ?? l.field} 고침`}
                description={l.action === 'edit' ? `${valueText(l.field, l.old, fieldName)} → ${valueText(l.field, l.new, fieldName)} · ${l.by}` : l.by}
                endContent={<Timestamp value={l.at} format="date_time" timezoneID={KST} />} />
            ))}
          </List>
        )}
      </VStack>
    </VStack>
  );
}

/** first는 열자마자 고를 공지(지도에서 왔을 때), onDirty는 저장하지 않은 값이 있는가 */
export function Console({ first, onDirty }: { first: string | null; onDirty: (dirty: boolean) => void }) {
  const [reason, setReason] = useState('all');
  const [showChecked, setShowChecked] = useState(false);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldList>({ groups: [], fields: [] });
  const [selectedId, setSelectedId] = useState<string | null>(first);
  const [detail, setDetail] = useState<{ notice: OpsNotice; log: LogItem[] } | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const [pending, setPending] = useState<string | null>(null);
  const panel = useResizable({ defaultSize: 520, minSize: 400, maxSize: 680 });
  /** 저장하지 않은 값이 있으면 묻고 고른다 */
  const select = (id: string) => (dirty && id !== selectedId ? setPending(id) : setSelectedId(id));

  const latest = useRef(0); // 늦게 온 앞 요청의 답이 새 답을 덮지 않게
  const load = useCallback(async () => {
    setFailed(null);
    const n = ++latest.current;
    try {
      const q = new URLSearchParams({ ...(reason === 'all' ? {} : { reason }), ...(showChecked ? {} : { checked: 'false' }) });
      const next = (await api<{ items: ReviewItem[] }>('GET', `/api/ops/review?${q}`)).items;
      if (n !== latest.current) return null;
      setItems(next);
      return next;
    } catch (e) {
      if (n === latest.current) setFailed(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [reason, showChecked]);
  /** 처리한 뒤: 목록을 새로 받고, 처리한 공지가 목록에서 빠졌으면 그 아래 공지로 넘어간다 */
  const afterAction = async (id: string) => {
    const before = items ?? [];
    const next = await load();
    if (next && !next.some(x => x.notice.id === id)) {
      const after = before.slice(before.findIndex(x => x.notice.id === id) + 1).find(x => next.some(y => y.notice.id === x.notice.id));
      setSelectedId(after?.notice.id ?? next[0]?.notice.id ?? null);
    } else await loadDetail(id);
  };
  const loadDetail = useCallback(async (id: string) => {
    setDetail(await api<{ notice: OpsNotice; log: LogItem[] }>('GET', `/api/ops/notices/${encodeURIComponent(id)}`));
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api<FieldList>('GET', '/api/fields').then(setFields, () => {}); }, []);
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let stale = false;
    api<{ notice: OpsNotice; log: LogItem[] }>('GET', `/api/ops/notices/${encodeURIComponent(selectedId)}`)
      .then(d => { if (!stale) setDetail(d); }, () => { if (!stale) setDetail(null); });
    return () => { stale = true; };
  }, [selectedId]);

  const open = items?.filter(x => !x.checkedAt).length ?? 0;
  const rows = failed ? (
    <EmptyState title="불러오지 못했어요" description={failed} actions={<Button label="다시 불러오기" onClick={() => void load()} />} />
  ) : items === null ? (
    <Spinner label="불러오는 중이에요" />
  ) : items.length === 0 ? (
    <EmptyState title="확인할 것이 없어요" description={showChecked ? '이 이유로 모인 공지가 없어요.' : '확인한 것도 보려면 위에서 켜세요.'} />
  ) : (
    <List density="compact" hasDividers>
      {items.map(x => (
        <ListItem key={x.notice.id} label={x.notice.title} isSelected={x.notice.id === selectedId} onClick={() => select(x.notice.id)}
          description={`${x.reasons.map(reasonName).join(' · ')} · ${kindName(x.notice.shown.kind)} · 게시 ${x.notice.postedOn}`}
          endContent={x.checkedAt ? <Token size="sm" color="green" label="확인함" /> : undefined} />
      ))}
    </List>
  );

  return (
    <Layout height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <HStack gap={2} vAlign="center">
                <Heading level={1}>판정 검토</Heading>
                <Text type="supporting" color="secondary">{showChecked ? `확인 전 ${open}개 · 모두 ${items?.length ?? 0}개` : `남은 것 ${open}개`}</Text>
              </HStack>
            </StackItem>
            <SegmentedControl label="이유로 거르기" value={reason} onChange={setReason} size="sm">
              <SegmentedControlItem label="모두" value="all" />
              <SegmentedControlItem label="확인 필요" value="review" />
              <SegmentedControlItem label="마감 없음" value="no_deadline" />
              <SegmentedControlItem label="분야 칸 빔" value="no_fields" />
            </SegmentedControl>
            <Switch label="확인한 것도 보기" value={showChecked} onChange={setShowChecked} size="sm" />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <VStack gap={0} style={styles.contentFill}>
            <StackItem size="fill" style={styles.rows}>{rows}</StackItem>
          </VStack>
        </LayoutContent>
      }
      end={
        <>
          <ResizeHandle direction="horizontal" hasDivider isAlwaysVisible={false} resizable={panel.props} label="오른쪽 칸 너비 바꾸기" />
          <LayoutPanel width={panel.size} padding={0} role="complementary" label="공지 자세히">
            {detail && detail.notice.id === selectedId ? (
              <Inspector key={`${detail.notice.id}-${detail.log.length}-${JSON.stringify(detail.notice.shown)}`} notice={detail.notice} log={detail.log} fields={fields}
                onDone={() => afterAction(detail.notice.id)} onDirty={setDirty} />
            ) : (
              <EmptyState title="왼쪽에서 공지를 고르세요" description="원문과 결과 파일 값을 보고 고치거나 맞아요를 눌러요." isCompact />
            )}
          </LayoutPanel>
          <AlertDialog isOpen={pending !== null} onOpenChange={o => { if (!o) setPending(null); }} title="저장하지 않은 값이 있어요"
            description="다른 공지로 넘어가면 고친 값이 사라져요." actionLabel="버리고 넘어가기" cancelLabel="계속 고치기"
            onAction={() => { setSelectedId(pending); setPending(null); setDirty(false); }} />
        </>
      }
    />
  );
}
