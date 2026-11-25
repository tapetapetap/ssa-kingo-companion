// 알림을 켜기 전에 알릴 것과 켜기 버튼(FR-036). '나 → 알림'과 '마감 전에 알려 드릴까요?'가 함께 쓴다
import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { messageOf } from '../api.ts';
import { turnOn } from '../lib/push.ts';

export function PushAsk({ onDone }: { onDone: (on: boolean) => Promise<void> | void }) {
  const [error, setError] = useState<string | null>(null);
  const on = async () => {
    setError(null);
    try {
      await onDone(await turnOn());
    } catch (e) {
      setError(messageOf(e));
    }
  };
  return (
    <VStack gap={3}>
      <VStack gap={1} as="ul" style={{ margin: 0, paddingInlineStart: 'var(--spacing-5)', listStyle: 'disc' }}>
        <li><Text>관심 있어요 공지의 마감 3일 전과 당일, 나중에 보기 공지의 다시 볼 날 오전 9시에 하루 한 통 보내요.</Text></li>
        <li><Text>공지 제목과 마감만 보내요.</Text></li>
        <li><Text>휴대폰 회사의 푸시 서버를 거쳐요. 내용은 암호화되고 언제 보냈는지는 그 회사가 알아요.</Text></li>
      </VStack>
      {error && <Text role="alert">{error}</Text>}
      <Button label="이 기기에서 알림 켜기" variant="primary" size="lg" width="100%" clickAction={on} />
    </VStack>
  );
}
