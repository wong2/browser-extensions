import type { ScanResult } from './types';

export interface BadgeState {
  text: string;
  color?: string;
  title: string;
}

export function getBadgeState(result: ScanResult): BadgeState {
  const count = result.entries.length;
  if (count === 0) {
    return {
      text: '',
      title: 'No AI Catalog entries',
    };
  }

  const hasWarnings =
    result.warnings.length > 0 || result.entries.some((entry) => entry.warnings.length > 0 || entry.errorMessage);
  const noun = count === 1 ? 'AI Catalog entry' : 'AI Catalog entries';

  return {
    text: count > 99 ? '99+' : String(count),
    color: hasWarnings ? '#b26b00' : '#167c4a',
    title: hasWarnings ? `${count} ${noun} with warnings` : `${count} ${noun}`,
  };
}
