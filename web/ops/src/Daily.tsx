// 매일 작업(US6-4): 가장 추천과 흐름의 숫자. 학생 이름·글·공지별 선택은 없다
import { Table } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import type { Monitor } from './api.ts';
import { num, when } from './format.ts';
import { StepBadge } from './Monitor.tsx';
import { Page, type PageProps } from './Page.tsx';

type Run = Monitor['days'][number];
const n = (r: Run, step: string, key: string) => num(r.steps[step]?.[key] as number | null);

export function Daily(p: PageProps) {
  return (
    <Page {...p} title="매일 작업" note="07:00이 지나 시작한 작업은 낮 실행이라 누가 골랐는지 세지 않아요">
      {d => (
        <Table<Run & Record<string, unknown>> data={d.days as never} idKey="startedAt" density="compact" verticalAlign="top"
          columns={[
            { key: 'startedAt', header: '시작', renderCell: r => <Text hasTabularNumbers>{when(r.startedAt)}</Text> },
            { key: 'llm', header: 'LLM이 고름', renderCell: r => (r.steps.repick?.daytime ? '낮 실행' : n(r, 'repick', 'llm')) },
            { key: 'rule', header: '규칙으로 고름', renderCell: r => (r.steps.repick?.daytime ? '낮 실행' : n(r, 'repick', 'rule')) },
            { key: 'left', header: '줄에 남음', renderCell: r => n(r, 'repick', 'left') },
            { key: 'written', header: '흐름을 씀', renderCell: r => n(r, 'flow', 'written') },
            { key: 'failed', header: '흐름 실패', renderCell: r => n(r, 'flow', 'failed') },
            { key: 'requests', header: '모델 요청', renderCell: r => num(r.load.requests) },
            { key: 'repick', header: '다시 고르기', renderCell: r => <StepBadge step={r.steps.repick} /> }
          ]} />
      )}
    </Page>
  );
}
