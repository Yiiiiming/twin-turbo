import { COLOR_THEMES } from './color-themes.js';

// The active circuit owns presentation. Browsing leaderboard filters or opening
// settings must not create a second, competing theme preference.
export function applyColorTheme(document, value) {
  const theme = Object.hasOwn(COLOR_THEMES, value) ? value : 'purple';
  document.documentElement.dataset.colorTheme = theme;
  return theme;
}
