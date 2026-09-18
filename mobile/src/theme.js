// Design tokens matching the Attendly Web App
export const palette = {
  ink:        '#1f2523',
  inkMuted:   '#5a6460',
  inkFaint:   '#8a9490',
  paper:      '#f7f7f2',
  surface:    '#ffffff',
  surfaceHover: '#f0f0ea',
  border:     '#e4e4dc',
  borderDark: '#d2d2c6',
  
  coral:      '#eb5e55',
  coralLight: 'rgba(235, 94, 85, 0.12)',
  coralDark:  '#c8443b',
  
  mint:       '#45a579',
  mintLight:  'rgba(69, 165, 121, 0.14)',
  mintDark:   '#2f7c59',

  yellow:     '#eab308',
  yellowLight:'rgba(234, 179, 8, 0.14)',

  blue:       '#3b82f6',
  blueLight:  'rgba(59, 130, 246, 0.12)',
  
  navy:       '#181e29',
  white:      '#ffffff',
};

export const AVATAR_COLORS = [
  { bg: 'rgba(235, 94, 85, 0.14)',  fg: '#c8443b' },
  { bg: 'rgba(69, 165, 121, 0.16)', fg: '#2f7c59' },
  { bg: 'rgba(59, 130, 246, 0.14)', fg: '#2563eb' },
  { bg: 'rgba(234, 179, 8, 0.16)',  fg: '#a16207' },
];

export function getAvatarColor(name = '') {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

export function fmt12(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
