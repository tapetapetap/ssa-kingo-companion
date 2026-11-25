// 둘째 덩어리(rest.ts)의 부품을 부르는 자리. 새 판이 올라가 옛 덩어리가 없거나 끊겼으면 새로 고침을 알린다
import { lazy } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Empty } from './States.tsx';

type Parts = typeof import('../rest.ts');
let parts: Promise<Parts> | null = null;
export const loadRest = () => (parts ??= import('../rest.ts').catch((e: unknown) => { parts = null; throw e; }));

const Old = () => <Empty title="새로 고쳐 주세요" description="연결이 끊겼거나 새 앱이 올라왔어요." action={<Button label="새로 고침" size="lg" onClick={() => location.reload()} />} />;
export const part = <K extends keyof Parts>(name: K) => lazy<Parts[K]>(() => loadRest().then(m => ({ default: m[name] }), () => ({ default: Old as unknown as Parts[K] })));
