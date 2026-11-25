// 서비스 지표(US6-5): 날마다의 숫자. 매일 작업이 돌지 않은 날은 값이 없다
import { Table } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import type { Monitor } from './api.ts';
import { dayText, num } from './format.ts';
import { Page, type PageProps } from './Page.tsx';

type Row = Monitor['counts'][number];
const COLUMNS: [keyof Row & string, string][] = [['consented', '동의한 학생'], ['consented_new', '새 학생'], ['active7', '7일 안에 쓴 학생'], ['like', '관심 있어요'], ['later', '나중에 보기'], ['dislike', '관심 없음'],
  ['push_sent', '알림 보냄'], ['push_failed', '알림 실패'], ['push_devices', '알림 켠 기기'], ['server_error', '서버 오류']];

export function Service(p: PageProps) {
  return (
    <Page {...p} title="서비스 지표" note="최근 14일. 알림은 기기 하나에 하루 한 통으로 세요">
      {d => (
        <Table<Row & Record<string, unknown>> data={d.counts as never} idKey="day" density="compact"
          columns={[
            { key: 'day', header: '날짜', renderCell: r => <Text hasTabularNumbers>{dayText(r.day)}</Text> },
            ...COLUMNS.map(([key, header]) => ({ key, header, align: 'end' as const, renderCell: (r: Row) => <Text hasTabularNumbers color={r[key] === null ? 'secondary' : 'primary'}>{num(r[key] as number | null)}</Text> }))
          ]} />
      )}
    </Page>
  );
}
