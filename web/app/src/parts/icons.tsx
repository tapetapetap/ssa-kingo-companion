// 메뉴 아이콘 넷(astryx 이름표에 없는 것만)
import type { ReactNode, SVGProps } from 'react';

const icon = (path: ReactNode) => (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...p}>{path}</svg>
);
export const HomeIcon = icon(<path d="M3 11.5 12 4l9 7.5M5.5 9.8V20h4.7v-5h3.6v5h4.7V9.8" />);
export const NoticeIcon = icon(<path d="M4 10v4h3l9 4.5v-13L7 10H4Zm3 4 1.4 5h2.4l-1-4M19 9.5a3.4 3.4 0 0 1 0 5" />);
export const ListIcon = icon(<path d="M6.5 4h11v16.5L12 16.6l-5.5 3.9V4Z" />);
export const MeIcon = icon(<path d="M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6" />);
