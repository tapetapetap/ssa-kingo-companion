// 화면마다 있는 상태: 불러오는 중, 실패(오프라인 포함), 빈 상태(FR-007)
import type { ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Spinner } from '@astryxdesign/core/Spinner';
import { ApiError, messageOf } from '../api.ts';

export const Loading = () => <Center minHeight="50vh"><Spinner size="lg" label="불러오는 중이에요" /></Center>;

export const Empty = ({ title, description, action }: { title: string; description?: string; action?: ReactNode }) => (
  <Center minHeight="50vh"><EmptyState headingLevel={2} title={title} description={description} actions={action} /></Center>
);

export const Failed = ({ error, retry }: { error: unknown; retry: () => void }) => (
  <Empty title={error instanceof ApiError && error.code === 'offline' ? '인터넷에 연결되지 않았어요' : '불러오지 못했어요'}
    description={error instanceof ApiError && error.code === 'offline' ? '연결되면 다시 불러와 주세요.' : messageOf(error)}
    action={<Button label="다시 불러오기" size="lg" onClick={retry} />} />
);
