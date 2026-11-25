// 홈(US2, FR-012): 가장 추천 하나와 선반 셋. 다시 고르는 중이면 5초 뒤 한 번 다시 부른다
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Carousel } from '@astryxdesign/core/Carousel';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { api, messageOf, type Answers, type Home as Data, type Shelf } from '../api.ts';
import { kstToday, termOf, termSuggestion } from '../lib/date.ts';
import { homeEmpty } from '../lib/empty.ts';
import { flag, setFlag } from '../lib/flags.ts';
import { useLoad } from '../lib/load.ts';
import { gradeText, kindName } from '../lib/notice.ts';
import { isIos, isStandalone } from '../lib/push.ts';
import { hidden, useActions, withCards } from '../lib/store.ts';
import { HOME_REFRESH_MS, UNDO_MS } from '../lib/values.ts';
import { ActionBar } from '../parts/ActionBar.tsx';
import type { Opts } from '../parts/ActionHost.tsx';
import { Due, hrefOf, ShelfCard } from '../parts/NoticeCard.tsx';
import { Page } from '../parts/Page.tsx';
import { Empty, Failed, Loading } from '../parts/States.tsx';

const SHELVES = [['soon', '마감 임박', '/notices?sort=due'], ['field', '관심 분야 새 공지', null], ['similar', '비슷한 공지', null]] as const;
const today = () => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' }).format(new Date());

const cards = (d: Data) => [...(d.pick ? [d.pick.notice] : []), ...Object.values(d.shelves).flatMap(s => s.items)];

function Pick({ pick, opts }: { pick: NonNullable<Data['pick']>; opts: Opts }) {
  const n = pick.notice;
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text color="accent" weight="semibold">컴패니언</Text>
          <Text size="sm" color="secondary">{pick.method.startsWith('LLM') ? 'AI가 골랐어요' : '규칙으로 골랐어요'}</Text>
          {pick.repicking && <Text size="sm" color="secondary" role="status">다시 고르는 중이에요</Text>}
        </HStack>
        <Text as="p" data-server-text>{pick.reason}</Text>
      </VStack>
      <Card padding={4}>
        <VStack gap={3}>
          <HStack gap={2} vAlign="center">{kindName(n.kind) && <Badge variant="teal" label={kindName(n.kind)} />}<Due notice={n} /></HStack>
          <VStack gap={1} data-server-text>
            <Heading level={1} textWrap="balance" maxLines={4} hasTruncateTooltip={false}>{n.title}</Heading>
            {n.host && <Text size="sm" color="secondary">{n.host}</Text>}
            {n.fields && n.fields.core.length > 0 && <Text size="sm" color="secondary">{n.fields.core.map(f => f.name).join(', ')}</Text>}
          </VStack>
          {pick.cited.length > 0 && (
            <Collapsible defaultIsOpen={false} trigger={<Text>이걸 보고 골랐어요</Text>}>
              <VStack as="ul" gap={1} style={{ margin: 0, paddingInlineStart: 'var(--spacing-5)', listStyle: 'disc' }} data-server-text>
                {pick.cited.map(c => <li key={c.key}><Text size="sm" color="secondary">{c.key === 'prompt' ? '나에 대한 프롬프트' : c.text}</Text></li>)}
              </VStack>
            </Collapsible>
          )}
          <Button label="자세히 보기" variant="primary" size="lg" width="100%" href={hrefOf(n)} />
          <ActionBar notice={n} opts={opts} />
        </VStack>
      </Card>
    </VStack>
  );
}

function ShelfRow({ name, more, shelf }: { name: string; more: string | null; shelf: Shelf }) {
  const mouse = useMediaQuery('(pointer: fine)'); // 손가락은 밀어서 넘긴다
  return (
    <VStack gap={3} as="section" aria-label={name}>
      <HStack justify="between" vAlign="center"><Heading level={2}>{name}</Heading>{more && <Button label="더 보기" variant="ghost" size="lg" href={more} />}</HStack>
      {/* 좌우 여백까지 써서 넘길 것이 더 있음을 보인다 */}
      <Carousel aria-label={name} gap={3} hasEdgeFade={false} hasButtons={mouse} padding={5} style={{ marginInline: 'calc(-1 * var(--spacing-5))', width: 'calc(100% + 2 * var(--spacing-5))', maxWidth: 'none' }}>
        {shelf.items.map(n => <ShelfCard key={n.id} notice={n} />)}
      </Carousel>
    </VStack>
  );
}

/** 새 학기에 학년·학기를 한 번 물어본다(FR-019). 닫으면 그 학기에는 다시 나오지 않는다 */
function NewTerm() {
  const term = termOf(kstToday());
  const [closed, setClosed] = useState(() => flag('term') === term);
  const { data } = useLoad(() => api<Answers>('GET', '/api/me/answers'), [], 'answers');
  const toast = useToast();
  const next = data && termSuggestion(data, kstToday());
  if (closed || !data || !next) return null;
  const close = () => { setFlag('term', term); setClosed(true); };
  const change = async () => {
    try {
      await api('PUT', '/api/me/answers', { ...next, goal: data.goal });
      close();
    } catch (e) {
      toast({ body: messageOf(e), type: 'error', isAutoHide: true });
    }
  };
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack justify="between" vAlign="start" gap={2}>
          <VStack gap={1}><Text weight="semibold">새 학기예요</Text><Text color="secondary">{`처음 질문 답을 ${gradeText(next.grade)} ${next.term}학기로 바꿀까요?`}</Text></VStack>
          <IconButton label="닫기" variant="ghost" size="lg" icon={<Icon icon="close" />} onClick={close} />
        </HStack>
        <HStack gap={2} wrap="wrap"><Button label={`${gradeText(next.grade)} ${next.term}학기로 바꾸기`} size="lg" clickAction={change} /><Button label="직접 고칠게요" variant="ghost" size="lg" href="/me/answers" /></HStack>
      </VStack>
    </Card>
  );
}

/** 아이폰에서 설치하지 않았으면 한 번 안내한다(FR-039) */
function Install() {
  const [closed, setClosed] = useState(() => !isIos() || isStandalone() || !!flag('install'));
  if (closed) return null;
  return (
    <Card padding={4}>
      <HStack justify="between" vAlign="start" gap={2}>
        <VStack gap={1}><Text weight="semibold">홈 화면에 추가하면 마감 알림을 받아요</Text><Text color="secondary">Safari의 공유 버튼을 누르고 홈 화면에 추가를 골라 주세요.</Text></VStack>
        <IconButton label="닫기" variant="ghost" size="lg" icon={<Icon icon="close" />} onClick={() => { setFlag('install'); setClosed(true); }} />
      </HStack>
    </Card>
  );
}

export function Home() {
  const { data, error, reload, refresh, cancel } = useLoad(() => withCards<Data>('GET', '/api/home', cards), [], 'home');
  useActions();
  // 가장 추천에 행동하면 그 자리에 되돌리기를 5초 보인 뒤 홈을 다시 부른다(FR-012)
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const opts = useMemo<Opts>(() => ({ onActed: u => { cancel(); setUndo(() => u); }, onFailed: () => setUndo(null), onUndone: () => { cancel(); setUndo(null); } }), [cancel]);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => void refresh().then(() => setUndo(u => (u === undo ? null : u))), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo, refresh]);
  const asked = useRef(false);
  const repicking = data?.pick?.repicking ?? false;
  useEffect(() => {
    if (!repicking || asked.current || undo) return;
    const t = setTimeout(() => { asked.current = true; void refresh(); }, HOME_REFRESH_MS);
    return () => clearTimeout(t);
  }, [repicking, refresh, undo]);
  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <Loading />;
  const none = homeEmpty(data.pickEmpty);
  const shelves = SHELVES.map(([id, name, more]) => ({ id, name, more, shelf: { ...data.shelves[id], items: data.shelves[id].items.filter(n => !hidden(n)) } })).filter(s => s.shelf.items.length > 0);
  return (
    <Page>
      <Text size="sm" color="secondary">{today()}</Text>
      <NewTerm />
      <Install />
      {undo ? (
        <Card padding={4}>
          <HStack gap={2} justify="between" vAlign="center" wrap="wrap">
            <Text role="status">다른 추천을 고르는 중이에요</Text>
            <Button label="되돌리기" size="lg" onClick={() => { undo(); opts.onUndone?.(); }} />
          </HStack>
        </Card>
      ) : data.pick ? <Pick pick={data.pick} opts={opts} /> : <Empty title={none.title} description={none.description} action={none.link && <Button label={none.link.label} size="lg" href={none.link.href} />} />}
      {shelves.length ? shelves.map(s => <ShelfRow key={s.id} name={s.name} more={s.more} shelf={s.shelf} />)
        : <Text color="secondary">지금 보여 줄 선반이 없어요</Text>}
    </Page>
  );
}
