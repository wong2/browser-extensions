export function formatBadgeCount(count: number): string {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return safeCount > 999 ? '999+' : String(safeCount);
}
