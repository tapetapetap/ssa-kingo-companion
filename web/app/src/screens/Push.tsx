// 알림(US5, FR-036): 이 기기의 상태에 맞게 보인다
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { messageOf, type Me } from '../api.ts';
import { useLoad } from '../lib/load.ts';
import { readState, turnOff, type PushState } from '../lib/push.ts';
import { Page } from '../parts/Page.tsx';
import { PushAsk } from '../parts/PushAsk.tsx';
import { Loading } from '../parts/States.tsx';

const SAID: Record<PushState, [string, string]> = {
  on: ['이 기기에서 켜져 있어요', '오전 9시에 하루 한 통으로 묶어 보내요.'],
  off: ['이 기기에서 꺼져 있어요', '기기마다 따로 켜요.'],
  soon: ['알림은 아직 준비 중이에요', '지금은 내 목록에서 마감까지 남은 날을 확인해 주세요.'],
  denied: ['브라우저가 알림을 막고 있어요', '브라우저나 휴대폰 설정에서 이 사이트의 알림을 허용한 뒤 다시 와 주세요.'],
  install: ['홈 화면에 추가하면 알림을 받아요', 'Safari의 공유 버튼을 누르고 홈 화면에 추가를 고른 뒤, 추가된 앱에서 켜 주세요. 아이폰은 iOS 16.4부터 돼요.'],
  unsupported: ['이 브라우저는 알림을 지원하지 않아요', '내 목록에서 마감까지 남은 날을 확인해 주세요.']
};

export function Push({ me, onChanged }: { me: Me; onChanged: () => Promise<void> }) {
  const { data } = useLoad(() => readState(me.push), [me.push.ready, me.push.on]);
  const toast = useToast();
  const off = async () => {
    try {
      await turnOff();
      await onChanged();
    } catch (e) {
      toast({ body: messageOf(e), type: 'error', isAutoHide: true });
    }
  };
  return (
    <Page parent="/me">
      <Heading level={1}>알림</Heading>
      {!data ? <Loading /> : (
        <>
          <VStack gap={1}><Text weight="semibold">{SAID[data][0]}</Text><Text color="secondary">{SAID[data][1]}</Text></VStack>
          {data === 'off' && <PushAsk onDone={onChanged} />}
          {data === 'on' && <Button label="이 기기에서 알림 끄기" size="lg" width="100%" clickAction={off} />}
          {(data === 'soon' || data === 'unsupported') && <Button label="내 목록 보기" size="lg" width="100%" href="/list" />}
        </>
      )}
    </Page>
  );
}
