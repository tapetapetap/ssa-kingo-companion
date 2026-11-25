// 처음 질문(US1): 학년·학기와 진로 목표를 한 화면에서 받는다
import { useEffect, useState, type CSSProperties } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Heading, Text } from '@astryxdesign/core/Text';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { useToast } from '@astryxdesign/core/Toast';
import { api, ApiError, messageOf, type Answers as Saved } from '../api.ts';
import { GOALS, gradeText } from '../lib/notice.ts';
import { useLoad } from '../lib/load.ts';
import { Failed, Loading } from '../parts/States.tsx';
import { Step } from '../parts/Step.tsx';

// 글자를 키우면 줄을 바꾼다(SegmentedControl은 글자를 자른다)
const wrap: CSSProperties = { flexWrap: 'wrap', gap: 'var(--spacing-2)' };
const GRADES = [1, 2, 3, 4].map(gradeText);
const saved = () => api<Saved>('GET', '/api/me/answers').catch((e: unknown) => {
  if (e instanceof ApiError && e.code === 'not_found') return 'none' as const; // 아직 답하지 않음
  throw e;
});

/** parent가 있으면 '나'에서 고치기 */
export function Answers({ onDone, parent }: { onDone: () => Promise<void>; parent?: string }) {
  const { data, error, reload } = useLoad(saved, []);
  const [grade, setGrade] = useState('');
  const [term, setTerm] = useState('');
  const [goal, setGoal] = useState('');
  const toast = useToast();
  useEffect(() => {
    if (!data || data === 'none') return;
    setGrade(String(data.grade));
    setTerm(String(data.term));
    setGoal(data.goal);
  }, [data]);
  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return <Loading />;
  const left = [!grade && '학년', !term && '학기', !goal && '진로 목표'].filter(Boolean);
  const save = async () => {
    try {
      await api('PUT', '/api/me/answers', { grade: Number(grade), term: Number(term), goal });
      await onDone();
    } catch (e) {
      toast({ body: messageOf(e), type: 'error' });
    }
  };
  return (
    <Step n={parent ? undefined : 1} parent={parent} title={parent ? '처음 질문' : '두 가지만 알려 주세요'} intro="맞는 공지를 고르는 데만 써요. '나'에서 언제든 고칠 수 있어요."
      note={<Text size="sm" color="secondary">{left.length ? `남은 것: ${left.join(', ')}` : '모두 골랐어요'}</Text>}
      action={<Button label={parent ? '저장하기' : '다음'} variant="primary" size="lg" isDisabled={left.length > 0} clickAction={save} />}>
      <VStack gap={3}>
        <Heading level={2}>지금 몇 학년인가요?</Heading>
        <ToggleButtonGroup label="학년" size="lg" type="single" value={grade || null} onChange={v => { if (v) setGrade(v as string); }} style={wrap}>
          {GRADES.map((g, i) => <ToggleButton key={g} value={String(i + 1)} label={g}>{g}</ToggleButton>)}
        </ToggleButtonGroup>
        <ToggleButtonGroup label="학기" size="lg" type="single" value={term || null} onChange={v => { if (v) setTerm(v as string); }} style={wrap}>
          <ToggleButton value="1" label="1학기">1학기</ToggleButton>
          <ToggleButton value="2" label="2학기">2학기</ToggleButton>
        </ToggleButtonGroup>
      </VStack>
      <VStack gap={3}>
        <Heading level={2}>졸업 뒤에 무엇을 생각하고 있나요?</Heading>
        <RadioList label="진로 목표" isLabelHidden value={goal} onChange={setGoal}>
          {GOALS.map(([v, label]) => <RadioListItem key={v} value={v} label={label} />)}
        </RadioList>
      </VStack>
    </Step>
  );
}
