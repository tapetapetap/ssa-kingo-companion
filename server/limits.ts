// 첫 숫자 값(spec '사용자 확인 필요' 19번, research R21). 써 보고 고칠 값이라 한 곳에 모은다. 바꾸면 시험도 함께 바뀐다
export const LIMITS = {
  promptChars: 1000, activityNameChars: 100, activityCount: 100, proofUrlChars: 500,
  likedDays: 30, likedMin: 2, dislikedMin: 2, flowLines: [2, 4] as const, flowChars: 80,
  citedMax: 3, reasonChars: 60, queryChars: 50, candidates: 10,
  soonDays: 7, newDays: 14, shelfSize: 10, pageSize: 20,
  sessionDays: 30, loginFailMax: 5, lockMinutes: 15, noDeadlineOpenDays: 30,
  bodyBytes: 64 * 1024, backupDays: 7, dailyHour: 3, dailyStopHour: 7, minFields: 3,
  pushDevices: 10, pushKeepDays: 30, pushTitleChars: 40, pushFrom: 9, pushUntil: 21, pushRetryMinutes: 10, endpointChars: 1000, pushTimeoutMs: 10_000
} as const;
