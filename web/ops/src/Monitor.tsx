// 개요와 수집·판정(FR-042): 오늘 숫자, 상태, 부하, 7일 흐름, 14일 기록, 한 번 더 돌리기
import { useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Table } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { api, type Monitor, type Step } from './api.ts';
import { dayText, num, percent, took, when } from './format.ts';
import { Page, type PageProps } from './Page.tsx';

const STEP: Record<string, string> = { rejudge: '다시 판정', classifier: '분류기', ingest: '넣기', map: '지도', backup: '백업', facts: '사실 칸', flow: '흐름', counts: '하루 숫자', repick: '다시 고르기' };
export const stepName = (k: string) => STEP[k] ?? k;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--spacing-3)' };

const Stat = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <Card padding={4}><VStack gap={1}><Text type="supporting" color="secondary">{label}</Text><Text type="display-3" hasTabularNumbers>{value}</Text>{note && <Text type="supporting" color="secondary">{note}</Text>}</VStack></Card>
);

const REQUEST: Record<string, string> = { waiting: '기다리는 중이에요. 10분 안에 돌기 시작해요', running: '도는 중이에요', done: '끝났어요', failed: '실패했어요' };

/** 매일 작업 한 번 더(FR-045). 요청이 열려 있을 때만 잠근다 */
function Again({ data, reload }: { data: Monitor; reload: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const toast = useToast();
  const r = data.request;
  const open = r?.status === 'waiting' || r?.status === 'running';
  const ask = async () => {
    setAsking(false);
    try {
      await api('POST', '/api/ops/daily');
    } catch (e) {
      toast({ body: e instanceof Error ? e.message : String(e), type: 'error', isAutoHide: true });
    }
    await reload();
  };
  return (
    <Card padding={4}>
      <HStack gap={4} justify="between" vAlign="center" wrap="wrap">
        <VStack gap={1}>
          <Heading level={2}>매일 작업 한 번 더 돌리기</Heading>
          <Text color="secondary" role="status">
            {r ? `${REQUEST[r.status] ?? r.status}${r.error ? ` (${r.error})` : ''}. ${when(r.endedAt ?? r.startedAt ?? r.at)}, ${r.by}` : '아직 요청한 적이 없어요.'}
          </Text>
          {data.dailyRunning && r?.status !== 'running' && <Text color="secondary">정해진 매일 작업이 도는 중이에요. 요청은 그 작업이 끝난 뒤 돌아요.</Text>}
        </VStack>
        <Button label="한 번 더 돌리기" variant="secondary" isDisabled={open} onClick={() => setAsking(true)} />
      </HStack>
      <AlertDialog isOpen={asking} onOpenChange={setAsking} title="매일 작업을 한 번 더 돌릴까요?" actionLabel="돌리기" cancelLabel="그만두기" actionVariant="primary"
        description="수집부터 다시 고르기까지 모두 다시 해요. 분류기가 도는 동안 학생의 다시 고르기가 늦어질 수 있어요. 모델을 재는 중이면 재기가 잠시 물러나요." onAction={() => void ask()} />
    </Card>
  );
}

/** 최근 7일에 새로 받은 글. 하루에 여럿 돌았으면 더한다 */
function Week({ data }: { data: Monitor }) {
  const days = data.counts.slice(0, 7).map(c => c.day).reverse();
  const of = (day: string) => data.days.filter(d => d.day === day);
  const bars = days.map(day => {
    const ran = of(day).filter(d => typeof d.steps.classifier?.fetched === 'number');
    return { day, n: ran.length ? ran.reduce((s, d) => s + (d.steps.classifier!.fetched as number), 0) : null };
  });
  const max = Math.max(1, ...bars.map(b => b.n ?? 0));
  const [w, h, top] = [84, 120, 20];
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Heading level={2}>최근 7일에 새로 받은 글</Heading>
        <svg viewBox={`0 0 ${w * 7} ${h + top + 28}`} role="img" aria-label={bars.map(b => `${dayText(b.day)} ${b.n ?? '기록 없음'}`).join(', ')} style={{ width: '100%', maxWidth: 640 }}>
          <line x1={0} x2={w * 7} y1={h + top} y2={h + top} stroke="var(--color-border-emphasized)" />
          {bars.map((b, i) => {
            const bh = b.n === null ? 0 : Math.max(b.n ? 4 : 0, (b.n / max) * h);
            const x = i * w + 24;
            return (
              <g key={b.day}>
                <title>{`${dayText(b.day)}: ${b.n === null ? '기록 없음' : `${b.n}개`}`}</title>
                <rect x={i * w} y={0} width={w} height={h + top} fill="transparent" />
                {bh > 0 && <path d={`M${x} ${h + top}v${-(bh - 4)}q0 -4 4 -4h28q4 0 4 4v${bh - 4}z`} fill="var(--color-accent)" />}
                <text x={x + 18} y={h + top - bh - 6} textAnchor="middle" fontSize={13} fill="var(--color-text-secondary)">{b.n ?? '없음'}</text>
                <text x={x + 18} y={h + top + 20} textAnchor="middle" fontSize={13} fill="var(--color-text-secondary)">{`${Number(b.day.slice(5, 7))}/${Number(b.day.slice(8))}`}</text>
              </g>
            );
          })}
        </svg>
      </VStack>
    </Card>
  );
}

export function Overview(p: PageProps) {
  return (
    <Page {...p} title="개요" note={p.data?.health.lastDaily ? `마지막 매일 작업 ${when(p.data.health.lastDaily.endedAt)}에 끝남` : '아직 매일 작업이 돌지 않았어요'}>
      {d => (
        <>
          <div style={grid}>
            <Stat label="새 글" value={num(d.today.fetched)} />
            <Stat label="공지" value={num(d.today.opportunity)} />
            <Stat label="공지 아님" value={num(d.today.not)} />
            <Stat label="확인 필요" value={num(d.today.review)} />
            <Stat label="판정 실패" value={num(d.today.failed)} />
            <Stat label="남은 확인할 것" value={num(d.today.reviewOpen)} />
            <Stat label="운영자 수정 비율" value={percent(d.editRate.num, d.editRate.den)} note={`최근 30일에 확인한 ${d.editRate.den}개 가운데 ${d.editRate.num}개`} />
          </div>
          <div style={{ ...grid, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Stat label="GPU 평균" value={d.load.gpuAvg === null ? '없음' : `${d.load.gpuAvg.toFixed(1)}%`} note="한도 80%" />
            <Stat label="최고 온도" value={d.load.tempMax === null ? '없음' : `${d.load.tempMax.toFixed(1)}°C`} note="한도 80°C" />
            <Card padding={4}>
              <VStack gap={2}>
                <Text type="supporting" color="secondary">서버 상태</Text>
                <HStack gap={2} vAlign="center"><Badge variant={p.error ? 'error' : 'success'} label={p.error ? '서버나 DB에 닿지 못함' : 'DB 닿음'} /></HStack>
                <HStack gap={2} vAlign="center" wrap="wrap"><Badge variant={d.health.model.ok ? 'success' : 'error'} label={d.health.model.ok ? '모델 서버 닿음' : '모델 서버 닿지 못함'} /><Text type="supporting" color="secondary">{d.health.model.names.join(', ')}</Text></HStack>
                {d.health.lastDaily && <HStack gap={2}><Badge variant={d.health.lastDaily.failed.length ? 'warning' : 'success'} label={d.health.lastDaily.failed.length ? `실패한 단계 ${d.health.lastDaily.failed.map(stepName).join(', ')}` : '매일 작업 성공'} /></HStack>}
              </VStack>
            </Card>
          </div>
          <Week data={d} />
          <Again data={d} reload={p.reload} />
        </>
      )}
    </Page>
  );
}

export function StepBadge({ step }: { step: Step | undefined }) {
  if (!step) return <Text type="supporting" color="secondary">없음</Text>;
  const [variant, label] = step.skipped ? ['neutral', '건너뜀'] as const : step.ok ? ['success', '성공'] as const : ['error', '실패'] as const;
  return <VStack gap={0.5} hAlign="start"><Badge variant={variant} label={label} />{!step.skipped && <Text type="supporting" color="secondary">{took(step.seconds)}</Text>}{step.error && <Text type="supporting" color="secondary">{step.error}</Text>}</VStack>;
}

export function Collect(p: PageProps) {
  return (
    <Page {...p} title="수집과 판정" note="최근 14일의 매일 작업. 하루에 여럿 돌았으면 모두 보여요">
      {d => {
        // DB의 jsonb는 칸 차례를 지키지 않아 도는 차례로 다시 놓는다
        const steps = Object.keys(STEP).filter(k => d.days.some(x => x.steps[k]));
        return (
          <>
            <Table<Monitor['days'][number] & Record<string, unknown>> data={d.days as never} idKey="startedAt" density="compact" verticalAlign="top"
              columns={[
                { key: 'startedAt', header: '시작', renderCell: r => <Text hasTabularNumbers>{when(r.startedAt)}</Text> },
                { key: 'seconds', header: '걸린 시간', renderCell: r => took(r.seconds) },
                { key: 'fetched', header: '새 글', renderCell: r => num(r.steps.classifier?.fetched as number) },
                { key: 'load', header: '부하', renderCell: r => (r.load.gpuAvg === null ? '없음' : `${r.load.gpuAvg.toFixed(0)}%, ${r.load.tempMax?.toFixed(0) ?? '?'}°C`) },
                ...steps.map(k => ({ key: k, header: stepName(k), renderCell: (r: Monitor['days'][number]) => <StepBadge step={r.steps[k]} /> }))
              ]} />
            <Again data={d} reload={p.reload} />
          </>
        );
      }}
    </Page>
  );
}
