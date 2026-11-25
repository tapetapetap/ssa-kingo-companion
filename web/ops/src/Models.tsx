// 모델(US8): 지금 모델과 후보, 오늘 밤 재기, 나란히 비교, 85%를 넘고 조건이 같은 결과로만 바꾸기
import { useCallback, useEffect, useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { pixel, Table } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { api, type Models as Data, type ModelTrial, type Ratio } from './api.ts';
import { percent, when } from './format.ts';
import { Page } from './Page.tsx';

const OPEN = ['waiting', 'running', 'paused'];
const ratio = (r: Ratio) => `${percent(r.num, r.den)} (${r.num}/${r.den})`;
/** 분수로 비교한다: a가 b보다 작은가 */
const less = (a: Ratio, b: Ratio) => a.num * b.den < b.num * a.den;

const Share = ({ r }: { r: Ratio }) => <VStack gap={0}><Text hasTabularNumbers>{percent(r.num, r.den)}</Text><Text type="supporting" color="secondary" hasTabularNumbers>{r.num}/{r.den}</Text></VStack>;

/** 재기 요청의 상태 글 */
function status(r: NonNullable<Data['request']>): string {
  const at = r.total ? ` ${r.total}건 가운데 ${r.done}건을 쟀어요.` : '';
  const why = r.error ? ` ${r.error}.` : '';
  if (r.status === 'waiting') return `${r.model}: 오늘 밤에 재요.`;
  if (r.status === 'running') return `${r.model}: 재는 중이에요.${at}`;
  if (r.status === 'paused') return `${r.model}: 멈춰 있어요.${at}${why}`;
  if (r.status === 'done') return `${r.model}: 다 쟀어요. ${when(r.endedAt!)}`;
  if (r.status === 'canceled') return `${r.model}: 취소했어요.`;
  return `${r.model}: 재지 못했어요.${why}`;
}

/** 이 결과로 바꿀 수 없는 까닭. 바꿀 수 있으면 null */
function blocked(t: ModelTrial, d: Data): string | null {
  if (t.model === d.current.model) return '지금 모델이에요';
  if (!t.passes) return '핵심 정밀도가 85% 미만이에요';
  if (t.stale) return '조건이 바뀌어 다시 재야 해요';
  if (!d.installed.some(m => m.name === t.model)) return d.serverOk ? '설치돼 있지 않아요' : '모델 서버에 닿지 못했어요';
  return null;
}

/** 기회 판정이 지금 모델보다 나빠지는가(FR-054). 지금 모델의 같은 조건 값이 없으면 비교하지 못한다 */
function warning(t: ModelTrial, now: ModelTrial | undefined): string {
  if (!now) return '지금 모델의 값이 같은 조건으로 없어 기회 판정을 비교하지 못했어요. ';
  const bad = [
    ...(less(t.metrics.oppRight, now.metrics.oppRight) ? [`맞은 비율이 ${percent(now.metrics.oppRight.num, now.metrics.oppRight.den)}에서 ${percent(t.metrics.oppRight.num, t.metrics.oppRight.den)}로 낮아져요.`] : []),
    ...(less(now.metrics.oppMissed, t.metrics.oppMissed) ? [`놓친 비율이 ${percent(now.metrics.oppMissed.num, now.metrics.oppMissed.den)}에서 ${percent(t.metrics.oppMissed.num, t.metrics.oppMissed.den)}로 높아져요.`] : [])
  ];
  return bad.length ? `주의: 기회 판정의 ${bad.join(' ')} ` : '';
}

export function Models() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [change, setChange] = useState<{ id: number | 'initial'; model: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = useCallback(async () => {
    try {
      setData(await api<Data>('GET', '/api/ops/models'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);
  const send = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    try {
      await api('POST', `/api/ops/models${path}`, body);
      toast({ body: done, isAutoHide: true });
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: 'error', isAutoHide: true });
    }
    setBusy(false);
    await load();
  };

  return (
    <Page data={data} error={error} reload={load} title="모델" note="밤에 정답셋으로 재고, 핵심 정밀도가 85% 이상이면 바꿀 수 있어요">
      {d => {
        const r = d.request;
        const open = !!r && OPEN.includes(r.status);
        const now = d.trials.find(t => t.model === d.current.model && !t.stale);
        // 지금 모델을 맨 위에 두어 후보와 나란히 본다. 바뀐 조건의 결과는 아래로
        const rows = [...d.trials].sort((a, b) => Number(b === now) - Number(a === now) || Number(a.stale) - Number(b.stale) || b.id - a.id);
        const initial = d.initial && d.initial.model !== d.current.model ? d.initial : null;
        return (
          <>
            {!d.serverOk && <Banner status="warning" title="모델 서버에 닿지 못했어요" description="후보를 고르거나 모델을 바꿀 수 없어요. 지금 모델은 그대로예요." />}
            {!d.goldReady && <Banner status="info" title="정답셋을 확인하지 못했어요" description="서버 컴퓨터에 정답셋을 두면 10분 안에 여기서 잴 수 있어요. 그 전에는 모든 결과가 '다시 재야 해요'예요." />}
            <Card padding={4}>
              <HStack gap={4} justify="between" vAlign="center" wrap="wrap">
                <VStack gap={1}>
                  <Text type="supporting" color="secondary">지금 모델</Text>
                  <Heading level={2}>{d.current.model}</Heading>
                  <Text color="secondary">{d.current.since ? `${when(d.current.since)}, ${d.current.by}가 바꿨어요` : '처음 모델이에요'}
                    {d.current.trial ? `. 그때 핵심 정밀도 ${ratio(d.current.trial.metrics.corePrecision)}` : d.initial?.model === d.current.model ? `. 고를 때 핵심 정밀도 ${ratio(d.initial)}` : ''}</Text>
                </VStack>
                {initial && (
                  <VStack gap={1} hAlign="end">
                    <Button label="처음 모델로 되돌리기" variant="secondary" isDisabled={!initial.usable || busy} onClick={() => setChange({ id: 'initial', model: initial.model, note: '' })} />
                    <Text type="supporting" color="secondary">{initial.usable ? `${initial.model}, 고를 때 ${ratio(initial)}` : '조건이 바뀌었거나 설치돼 있지 않아요'}</Text>
                  </VStack>
                )}
              </HStack>
            </Card>
            <Card padding={4}>
              <VStack gap={3}>
                <Heading level={2}>오늘 밤 재기</Heading>
                <HStack gap={3} vAlign="end" wrap="wrap">
                  <Selector label="후보 모델" placeholder="모델 고르기" options={d.installed.map(m => ({ value: m.name, label: `${m.name} (${m.parameterSize}, ${(m.size / 1e9).toFixed(1)}GB)` }))} value={pick ?? undefined} onChange={setPick} isDisabled={open || !d.serverOk} />
                  <Button label="오늘 밤 재기" variant="secondary" isDisabled={!pick || open || busy || !d.goldReady} onClick={() => void send('/trial', { model: pick }, '오늘 밤에 재요')} />
                  {open && <Button label="재기 취소" variant="ghost" isDisabled={r.status === 'running' || busy} onClick={() => void send('/trial/cancel', {}, '재기를 취소했어요')} />}
                </HStack>
                <Text color="secondary" role="status">{r ? status(r) : '아직 잰 적이 없어요.'}{r?.status === 'running' ? ' 멈춘 뒤에 취소할 수 있어요.' : ''}</Text>
                <Text type="supporting" color="secondary">22:00부터 02:50, 그리고 매일 작업이 끝난 뒤부터 07:00까지만 재요. 시간이 지나면 멈췄다가 다음 밤에 이어서 재요.</Text>
              </VStack>
            </Card>
            <VStack gap={3}>
              <Heading level={2}>잰 결과</Heading>
              {rows.length === 0 ? <Text color="secondary">아직 결과가 없어요.</Text> : (
                <Table<ModelTrial & Record<string, unknown>> data={rows as never} idKey="id" density="compact" verticalAlign="top"
                  columns={[
                    { key: 'model', header: '모델', width: pixel(170), renderCell: t => <VStack gap={0.5} hAlign="start"><Text>{t.model}</Text>{t === now && <Badge variant="info" label="지금 모델" />}<Text type="supporting" color="secondary">{when(t.at)}</Text>{t.metrics.failed > 0 && <Text type="supporting" color="secondary">답을 못 받은 글 {t.metrics.failed}건</Text>}</VStack> },
                    { key: 'core', header: '핵심 정밀도', renderCell: t => <Share r={t.metrics.corePrecision} /> },
                    { key: 'recall', header: '핵심 재현율', renderCell: t => <Share r={t.metrics.coreRecall} /> },
                    { key: 'related', header: '관련 정밀도', renderCell: t => <Share r={t.metrics.relatedPrecision} /> },
                    { key: 'right', header: '기회 맞음', renderCell: t => <Share r={t.metrics.oppRight} /> },
                    { key: 'missed', header: '기회 놓침', renderCell: t => <Share r={t.metrics.oppMissed} /> },
                    { key: 'sec', header: '공지 하나', renderCell: t => (t.metrics.secPerAsk === null ? '보관한 답' : `${t.metrics.secPerAsk}초`) },
                    { key: 'load', header: '부하', renderCell: t => (t.metrics.gpuAvg === null && t.metrics.tempMax === null ? '없음' : `${t.metrics.gpuAvg?.toFixed(0) ?? '?'}%, ${t.metrics.tempMax?.toFixed(0) ?? '?'}°C`) },
                    { key: 'go', header: '바꾸기', width: pixel(180), renderCell: t => {
                      const why = blocked(t, d);
                      if (t.model === d.current.model) return t === now ? null : <Text type="supporting" color="secondary">{t.stale ? '다시 재야 해요' : '앞서 잰 값이에요'}</Text>;
                      return <VStack gap={0.5} hAlign="start"><Button label={`이 모델로 바꾸기 (${t.model})`} size="sm" variant="secondary" isDisabled={!!why || busy} onClick={() => setChange({ id: t.id, model: t.model, note: warning(t, now) })}>이 모델로 바꾸기</Button>{why && <Text type="supporting" color="secondary">{why}</Text>}</VStack>;
                    } }
                  ]} />
              )}
              <Text type="supporting" color="secondary">기회 맞음은 확인 필요를 뺀 글 가운데, 기회 놓침은 정답이 기회인 글 가운데 셌어요.</Text>
            </VStack>
            <VStack gap={3}>
              <Heading level={2}>바꾼 기록</Heading>
              {d.changes.length === 0 ? <Text color="secondary">아직 바꾼 적이 없어요.</Text> : (
                <Table<Data['changes'][number] & Record<string, unknown>> data={d.changes as never} idKey="at" density="compact"
                  columns={[
                    { key: 'at', header: '때', renderCell: c => when(c.at) }, { key: 'old', header: '앞 모델', renderCell: c => c.old }, { key: 'new', header: '새 모델', renderCell: c => c.new },
                    { key: 'core', header: '핵심 정밀도', renderCell: c => (c.corePrecision ? ratio(c.corePrecision) : '처음 고른 기록') }, { key: 'by', header: '바꾼 사람', renderCell: c => c.by }
                  ]} />
              )}
            </VStack>
            <AlertDialog isOpen={!!change} onOpenChange={o => { if (!o) setChange(null); }} title={`${change?.model ?? ''}로 바꿀까요?`} actionLabel="바꾸기" cancelLabel="그만두기" actionVariant="primary"
              description={`${change?.note ?? ''}다음 매일 작업부터 새 공지를 이 모델로 판정해요. 앞서 판정한 공지는 그대로예요.`}
              onAction={() => { const c = change!; setChange(null); void send('/current', { trialId: c.id }, `${c.model}로 바꿨어요`); }} />
          </>
        );
      }}
    </Page>
  );
}
