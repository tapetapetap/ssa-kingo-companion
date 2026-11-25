// web-push 4에는 타입이 없어 쓰는 것만 적는다(3단계 research R4)
declare module 'web-push' {
  export function sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string,
    options: { vapidDetails: { subject: string; publicKey: string; privateKey: string }; TTL: number; urgency: 'normal'; timeout: number }
  ): Promise<unknown>;
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
}
