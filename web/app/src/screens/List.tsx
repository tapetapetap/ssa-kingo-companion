// 내 목록(US3, FR-017): 두 탭과 개수. 닫히거나 내려간 공지는 맨 아래 흐리게 남는다
import { Button } from '@astryxdesign/core/Button';
import { List } from '@astryxdesign/core/List';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Heading, Text } from '@astryxdesign/core/Text';
import type { ListItem } from '../api.ts';
import { kstToday } from '../lib/date.ts';
import { ordered } from '../lib/list.ts';
import { useLoad } from '../lib/load.ts';
import { dayText } from '../lib/notice.ts';
import { actions, useActions, withCards } from '../lib/store.ts';
import { NoticeRow } from '../parts/NoticeCard.tsx';
import { Page } from '../parts/Page.tsx';
import { Empty, Failed, Loading } from '../parts/States.tsx';
import { go } from '../route.ts';

const TABS = { like: '관심 있어요', later: '나중에 보기' };
const NONE = { like: '관심 있어요를 누른 공지가 없어요', later: '나중에 볼 공지가 없어요' };

export function MyList({ tab }: { tab: 'like' | 'later' }) {
  useActions();
  const { data, error, reload } = useLoad(() => withCards<{ items: ListItem[] }>('GET', '/api/me/list', d => d.items.map(i => i.notice)), [], 'list');
  if (error) return <Page><Heading level={1}>내 목록</Heading><Failed error={error} retry={reload} /></Page>;
  if (!data) return <Page><Heading level={1}>내 목록</Heading><Loading /></Page>;
  const inTab = (t: 'like' | 'later') => data.items.filter(i => actions.of(i.notice)?.kind === t);
  const due = ({ notice }: ListItem) => { const a = actions.of(notice); return a?.kind === 'later' && !!a.revisitOn && a.revisitOn <= kstToday(); };
  const note = ({ notice, flags }: ListItem) => (tab === 'like' ? '' : flags.includes('revisit_due') && !flags.includes('closed') && !flags.includes('down') ? '다시 볼 날이에요'
    : notice.open && actions.of(notice)?.revisitOn ? `${dayText(actions.of(notice)!.revisitOn!)}에 다시 보여 드려요` : '');
  // 불러온 뒤 이 앱에서 바꾼 행동을 따른다
  const items = ordered(inTab(tab).map(i => ({ ...i, flags: i.flags.filter(f => f !== 'revisit_due' || due(i)) })));
  return (
    <Page>
      <Heading level={1}>내 목록</Heading>
      <TabList value={tab} onChange={v => go(v === 'later' ? '/list?tab=later' : '/list', 'replace')} size="lg" layout="fill" hasDivider role="tablist">
        {(['like', 'later'] as const).map(t => <Tab key={t} value={t} label={`${TABS[t]} ${inTab(t).length}`} />)}
      </TabList>
      {items.length ? (
        <>
          <List hasDividers density="spacious" edge="flush">
            {items.map(i => <NoticeRow key={i.notice.id} notice={i.notice} note={note(i)} dim={!i.notice.open} />)}
          </List>
          <Text size="sm" color="secondary">마감이 지나도 목록에 남아요.</Text>
        </>
      ) : <Empty title={NONE[tab]} description="공지에서 표시하면 여기에 모여요." action={<Button label="공지 보러 가기" size="lg" href="/notices" />} />}
    </Page>
  );
}
