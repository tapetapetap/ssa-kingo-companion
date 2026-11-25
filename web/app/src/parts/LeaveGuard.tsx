// 저장하지 않고 나가려 하면 한 번 묻는다(US4-2)
import { useEffect, useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { setGuard } from '../route.ts';

export function LeaveGuard({ when }: { when: boolean }) {
  const [leave, setLeave] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!when) return;
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    setGuard(l => setLeave(() => l));
    window.addEventListener('beforeunload', unload);
    return () => {
      setGuard(null);
      window.removeEventListener('beforeunload', unload);
    };
  }, [when]);
  return <AlertDialog isOpen={!!leave} onOpenChange={o => { if (!o) setLeave(null); }} title="저장하지 않고 나갈까요?" description="고친 글이 사라져요." actionLabel="나가기" cancelLabel="이어서 쓰기"
    onAction={() => { setLeave(null); leave?.(); }} />;
}
