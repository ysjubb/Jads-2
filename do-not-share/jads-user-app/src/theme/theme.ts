/**
 * HUD Theme — shared across all JADS portals and apps.
 * Dark aerospace theme with green primary accent.
 */

export const T = {
  bg:         '#050A08',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#00FF88',
  amber:      '#FFB800',
  red:        '#FF3B3B',
  muted:      '#4A7A5A',
  text:       '#b0c8b8',
  textBright: '#d0e8d8',
} as const

export type ThemeColors = typeof T
