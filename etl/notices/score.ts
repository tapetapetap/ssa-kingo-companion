// 분야 판정 지표: 비율 꼴과 표시, 실행 기록 고르기, 안 하나의 지표 계산(research R10·R16, data-model 6)

/** 비율은 반올림하지 않고 분자·분모로 둔다 */
export type Ratio = { num: number; den: number };
export const ratio = (num: number, den: number): Ratio => ({ num, den });

/** 기준 비교는 정수로 한다(eval.ts와 같은 이유: 17/20이 85%를 넘는다). 분모가 0이면 통과가 아니다 */
export const passes = (r: Ratio, pctMin = 85) => r.den > 0 && r.num * 100 >= pctMin * r.den;

/** 내림이라 미달인 값이 85.0%로 보이지 않는다 */
export const pct = (r: Ratio) => (r.den === 0 ? '해당 없음' : `${(Math.floor((r.num * 1000) / r.den) / 10).toFixed(1)}% (${r.num}/${r.den})`);
