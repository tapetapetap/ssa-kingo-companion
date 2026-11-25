// 서버 기록(research R18): JSON 한 줄씩 표준 출력에. 요청 기록은 정해진 칸만 남겨 본문·쿠키·글이 새지 않게 한다(FR-047)
export type Write = (line: string) => void;
const stdout: Write = line => { process.stdout.write(`${line}\n`); };

export type RequestLog = { method: string; route: string; status: number; ms: number; student?: number };

/** 칸을 골라 담으므로 다른 칸을 넘겨도 기록되지 않는다 */
export function logRequest(r: RequestLog, write: Write = stdout) {
  const o: Record<string, unknown> = { at: new Date().toISOString(), kind: 'request', method: r.method, route: r.route, status: r.status, ms: Math.round(r.ms) };
  if (r.student !== undefined) o.student = r.student;
  write(JSON.stringify(o));
}

/** 서버 안 오류. 까닭(오류 이름과 첫 줄)만 남기고 요청 본문은 받지 않는다 */
export function logError(route: string, e: unknown, write: Write = stdout) {
  const message = e instanceof Error ? `${e.name}: ${e.message.split('\n')[0]}` : 'unknown';
  write(JSON.stringify({ at: new Date().toISOString(), kind: 'error', route, message }));
}

/** 오류 글에서 비밀이 든 주소(postgres://사용자:비밀번호@…)를 가린다. 자식 프로세스의 오류는 명령 인자를 그대로 싣는다 */
export const hideSecrets = (text: string) => text.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@\S*/gi, '(주소 가림)');
