// 로그인(FR-010): 서버가 알려 준 방식만 보인다. SSO는 방식 하나를 더하면 붙는다
import { useRef, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { api, ApiError, messageOf } from '../api.ts';
import { useLoad } from '../lib/load.ts';
import { Empty, Failed, Loading } from '../parts/States.tsx';

const clock = (iso: string) => new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(iso));

function DevLogin({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false); // Enter를 누르고 있어도 한 번만 보낸다(잇달아 틀리면 계정이 잠긴다)
  const submit = async () => {
    if (busy.current || !email || !password) return;
    busy.current = true;
    setError(null);
    try {
      await api('POST', '/api/login', { method: 'dev', email, password });
      await onDone();
    } catch (e) {
      const until = e instanceof ApiError && e.code === 'locked' && typeof e.extra.until === 'string' ? e.extra.until : null;
      setError(until ? `여러 번 틀려 잠시 잠겼어요. ${clock(until)}부터 다시 할 수 있어요` : messageOf(e));
    } finally {
      busy.current = false;
    }
  };
  return (
    <Card padding={5} width="100%">
      <VStack gap={4}>
        <VStack gap={1} hAlign="start">
          <Badge label="개발용 로그인" />
          <Text size="sm" color="secondary">학교 통합 로그인을 잇기 전에만 써요.</Text>
        </VStack>
        <VStack gap={3}>
          <TextInput label="이메일" type="email" size="lg" autoComplete="username" value={email} onChange={v => { setEmail(v); setError(null); }} />
          <TextInput label="비밀번호" type="password" size="lg" autoComplete="current-password" value={password} onChange={v => { setPassword(v); setError(null); }}
            onEnter={() => void submit()} status={error ? { type: 'error', message: error } : undefined} />
        </VStack>
        <Button label="들어가기" variant="primary" size="lg" width="100%" isDisabled={!email || !password} clickAction={submit} />
      </VStack>
    </Card>
  );
}

export function Login({ onDone }: { onDone: () => Promise<void> }) {
  const { data, error, reload } = useLoad(() => api<{ methods: string[] }>('GET', '/api/login/methods'), []);
  return (
    <VStack gap={6} paddingBlock={10} vAlign="center" style={{ minHeight: '100dvh' }}>
      <VStack gap={2}>
        <Heading level={1}>킹고 컴패니언</Heading>
        <Text color="secondary">나에게 맞는 공지를 하나 먼저 골라 드려요.</Text>
      </VStack>
      {error ? <Failed error={error} retry={reload} /> : !data ? <Loading /> : data.methods.includes('dev') ? <DevLogin onDone={onDone} />
        : <Empty title="지금은 로그인할 수 없어요" description="새로 고쳐도 그대로면 잠시 뒤에 다시 와 주세요." />}
    </VStack>
  );
}
