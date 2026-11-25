// 동의(FR-009): 서버 문구를 그대로 보인다. 그사이 판이 바뀌면 새 문구를 다시 받는다
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { api, ApiError, messageOf } from '../api.ts';
import { useLoad } from '../lib/load.ts';
import { Failed, Loading } from '../parts/States.tsx';
import { Step } from '../parts/Step.tsx';

/** 문구의 줄. '- '로 시작하는 줄은 목록으로 보인다(Markdown 컴포넌트는 앱 덩어리를 크게 늘려 쓰지 않는다) */
function blocks(text: string) {
  const out: (string | string[])[] = [];
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const last = out.at(-1);
    if (!line.startsWith('- ')) out.push(line);
    else if (Array.isArray(last)) last.push(line.slice(2));
    else out.push([line.slice(2)]);
  }
  return out.map((b, i) => (Array.isArray(b)
    ? <VStack key={i} as="ul" gap={2} style={{ margin: 0, paddingInlineStart: 'var(--spacing-5)', listStyle: 'disc' }}>{b.map(l => <li key={l}><Text>{l}</Text></li>)}</VStack>
    : <Text key={i} as="p">{b}</Text>));
}

export function Consent({ onDone }: { onDone: () => Promise<void> }) {
  const { data, error, reload } = useLoad(() => api<{ version: string; text: string }>('GET', '/api/consent'), []);
  const toast = useToast();
  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <Loading />;
  const agree = async () => {
    try {
      await api('POST', '/api/consent', { version: data.version });
      await onDone();
    } catch (e) {
      const changed = e instanceof ApiError && e.code === 'invalid';
      toast({ body: changed ? '문구가 바뀌었어요. 다시 읽어 주세요' : messageOf(e), type: 'error' });
      if (changed) reload();
    }
  };
  const logout = async () => {
    try {
      await api('POST', '/api/logout');
      await onDone();
    } catch (e) {
      toast({ body: messageOf(e), type: 'error' });
    }
  };
  return (
    <Step title="시작하기 전에 확인해 주세요"
      action={<HStack gap={2} width="100%" wrap="wrap"><Button label="동의하고 시작하기" variant="primary" size="lg" clickAction={agree} style={{ flex: '1 1 auto' }} /><Button label="로그아웃" variant="ghost" size="lg" clickAction={logout} /></HStack>}>
      <VStack gap={3} data-server-text>{blocks(data.text)}</VStack>
    </Step>
  );
}
