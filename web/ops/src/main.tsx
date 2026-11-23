// 운영자 화면 진입(ops-screen.md '상태별 화면'): 불러오는 중 → 로그인 칸 / 운영자 계정이 아니에요 / 오류 / 판정 검토
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { StrictMode, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { VStack } from '@astryxdesign/core/Layout';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js';
import { api, ApiError } from './api.ts';
import { Console } from './Console.tsx';

const page: CSSProperties = { minHeight: '100vh', backgroundColor: 'var(--color-background-body)' };
const box: CSSProperties = { width: '100%', maxWidth: 400 };

type State = 'loading' | 'login' | 'forbidden' | 'error' | 'ready';

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await api('POST', '/api/login', { method: 'dev', email, password });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '잠시 뒤에 다시 해 주세요');
    }
  };
  return (
    <Card padding={8} width="100%">
      <VStack gap={4} hAlign="stretch">
        <VStack gap={1} hAlign="center">
          <Heading level={2} accessibilityLevel={1}>판정 검토</Heading>
          <Text type="body" color="secondary" size="sm">운영자 계정으로 들어가요</Text>
        </VStack>
        <VStack gap={2}>
          <TextInput label="이메일" type="email" value={email} onChange={setEmail} size="lg" />
          <TextInput label="비밀번호" type="password" value={password} onChange={(v: string) => { setPassword(v); setError(null); }} size="lg" onEnter={() => { if (email && password) void submit(); }}
            status={error ? { type: 'error', message: error } : undefined} />
        </VStack>
        <Button label="들어가기" variant="primary" size="lg" width="100%" isDisabled={!email || !password} clickAction={submit} />
      </VStack>
    </Card>
  );
}

function App() {
  const [state, setState] = useState<State>('loading');
  const check = useCallback(async () => {
    setState('loading');
    try {
      await api('GET', '/api/ops/review?checked=false');
      setState('ready');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      setState(code === 'login_required' ? 'login' : code === 'forbidden' ? 'forbidden' : 'error');
    }
  }, []);
  useEffect(() => { void check(); }, [check]);
  const logout = async () => {
    await api('POST', '/api/logout').catch(() => {});
    setState('login');
  };

  if (state === 'ready') return <Console onLogout={() => void logout()} />;
  return (
    <Center role="main" axis="both" padding={6} style={page}>
      <VStack gap={4} hAlign="center" style={box}>
        {state === 'loading' && <Spinner size="lg" label="불러오는 중이에요" />}
        {state === 'login' && <Login onDone={() => void check()} />}
        {state === 'forbidden' && (
          <EmptyState title="운영자 계정이 아니에요" description="운영자 목록에 있는 계정으로 들어와 주세요."
            actions={<Button label="다른 계정으로 들어가기" onClick={() => void logout()} />} />
        )}
        {state === 'error' && (
          <EmptyState title="불러오지 못했어요" description="서버에 닿지 못했어요. 잠시 뒤에 다시 해 주세요."
            actions={<Button label="다시 불러오기" onClick={() => void check()} />} />
        )}
      </VStack>
    </Center>
  );
}

// 컴포넌트 안의 글(달력 열기, 찾기 등)과 때 표시를 한국어로
createRoot(document.getElementById('root')!).render(
  <StrictMode><InternationalizationProvider locale="ko-KR" messages={{ 'ko-KR': koKR }}><App /></InternationalizationProvider></StrictMode>
);
