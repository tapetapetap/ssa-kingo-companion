// 테마 kingo(contracts/design.md): 디자인 후보 추천안의 값. 여기 없는 것은 astryx 기본이다
import { defineTheme } from '@astryxdesign/core/theme';

export const COLORS = {
  '--color-accent': ['#4e741b', '#98b779'],
  '--color-accent-muted': ['#c5dfae', '#34510e'],
  '--color-on-accent': ['#ffffff', '#000000'],
  '--color-text-accent': ['#42670b', '#b7d0a0'],
  '--color-icon-accent': ['#42670b', '#b7d0a0'],
  '--color-background-body': ['#f1f1f1', '#1b1b1b'],
  '--color-background-surface': ['#ffffff', '#262626'],
  '--color-background-card': ['#ffffff', '#1b1b1b'],
  '--color-background-popover': ['#ffffff', '#1b1b1b'],
  '--color-background-muted': ['#f1f1f1', '#1b1b1b'],
  '--color-text-primary': ['#000000', '#ffffff'],
  '--color-text-secondary': ['#474747', '#9e9e9e'],
  '--color-text-disabled': ['#919191', '#525252'],
  '--color-border': ['#00000014', '#ffffff1a'],
  '--color-border-emphasized': ['#d4d4d4', '#525252'],
  '--color-success': ['#198100', '#64af4c'],
  '--color-text-success': ['#2f7d33', '#90ca90'],
  '--color-warning': ['#ffce2f', '#ffce2f'],
  '--color-text-warning': ['#836700', '#eec448'],
  '--color-error': ['#c9303a', '#ff705d'],
  '--color-text-error': ['#c0262c', '#ffaea7'],
  '--color-neutral': ['#0000000f', '#ffffff1a'],
  '--color-overlay-hover': ['#0000000d', '#ffffff0d'],
  '--color-overlay-pressed': ['#0000001a', '#ffffff1a'],
  '--color-skeleton': ['#f1f1f1', '#525252'],
  '--color-icon-primary': ['#000000', '#ffffff'],
  '--color-icon-secondary': ['#6a6a6a', '#9e9e9e'],
  '--color-on-success': ['#ffffff', '#111111'],
  '--color-on-error': ['#ffffff', '#111111'],
  '--color-on-warning': ['#111111', '#111111'],
  '--color-success-muted': ['#bce0bb', '#90ca903d'],
  '--color-warning-muted': ['#fae19e', '#e2b6233d'],
  '--color-error-muted': ['#ffc4be', '#ff98903d']
} satisfies Record<string, [string, string]>;

export const kingo = defineTheme({
  name: 'kingo',
  typography: { scale: { base: 14, ratio: 1.3 } },
  motion: { fast: 125, medium: 300, ratio: 0.75 },
  tokens: {
    ...(COLORS as Record<keyof typeof COLORS, [string, string]>),
    '--radius-inner': '0.375rem', '--radius-element': '0.625rem', '--radius-container': '0.75rem', '--radius-page': '1.75rem',
    '--size-element-lg': '2.75rem' // 누르는 자리 44px(FR-006)
  },
  components: {
    heading: { base: { letterSpacing: '-0.02em' } },
    'radio-list-item': { base: { minHeight: '2.75rem' } },
    'collapsible-trigger': { base: { minHeight: '2.75rem' } }
  }
});
