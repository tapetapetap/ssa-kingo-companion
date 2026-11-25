// 나에 대한 프롬프트(US4-2): 1,000자
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { useToast } from '@astryxdesign/core/Toast';
import { api, messageOf } from '../api.ts';
import { take, writingNow } from '../lib/draft.ts';
import { useLoad } from '../lib/load.ts';
import { PROMPT_CHARS } from '../lib/values.ts';
import { LeaveGuard } from '../parts/LeaveGuard.tsx';
import { Page } from '../parts/Page.tsx';
import { Failed, Loading } from '../parts/States.tsx';

const PATH = '/me/prompt';

export function Prompt() {
  const { data, error, reload, set } = useLoad(() => api<{ body: string }>('GET', '/api/me/prompt'), []);
  const [body, setBody] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => { if (data) setBody(b => b ?? take<string>(PATH) ?? data.body); }, [data]);
  const dirty = !!data && body !== null && body !== data.body;
  useEffect(() => {
    writingNow(dirty ? PATH : null, body);
    return () => writingNow(null);
  }, [dirty, body]);
  if (error) return <Page parent="/me"><Failed error={error} retry={reload} /></Page>;
  if (!data || body === null) return <Page parent="/me"><Loading /></Page>;
  const over = body.length > PROMPT_CHARS;
  const save = async () => {
    try {
      if (body.trim()) await api('PUT', '/api/me/prompt', { body });
      else await api('DELETE', '/api/me/prompt');
      set({ body: body.trim() ? body : '' });
      if (!body.trim()) setBody('');
      toast({ body: '저장했어요', uniqueID: 'note' });
    } catch (e) {
      toast({ body: messageOf(e), type: 'error', isAutoHide: true });
    }
  };
  return (
    <Page parent="/me">
      <VStack gap={2}>
        <Heading level={1}>나에 대한 프롬프트</Heading>
        <Text color="secondary">컴패니언이 공지를 고를 때 읽어요. 바라는 점이나 하고 싶은 일을 자유롭게 적어 주세요.</Text>
      </VStack>
      <TextArea label="나에 대한 프롬프트" isLabelHidden rows={10} width="100%" value={body} onChange={setBody} placeholder="예: 백엔드 인턴을 찾고 있어요. 서류 면제가 있으면 좋아요."
        status={over ? { type: 'error', message: `${PROMPT_CHARS.toLocaleString()}자까지 쓸 수 있어요` } : undefined} />
      <HStack gap={3} justify="between" vAlign="center">
        <Text color="secondary" hasTabularNumbers>{`${body.length.toLocaleString()}/${PROMPT_CHARS.toLocaleString()}`}</Text>
        <Button label="저장하기" variant="primary" size="lg" isDisabled={!dirty || over} clickAction={save} />
      </HStack>
      <LeaveGuard when={dirty} />
    </Page>
  );
}
