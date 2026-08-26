export const DESCENDANT_SCAN_COALESCE_MS = 75;

export type NavigationEventKind =
  | 'committed'
  | 'completed'
  | 'history-state-updated'
  | 'reference-fragment-updated';

export interface NavigationPlan {
  invalidate: boolean;
  showPending: boolean;
  cancelScheduledScan: boolean;
  scanDelayMs: number | null;
}

export interface CoalescedScanDeadline {
  dueAt: number;
  replaceTimer: boolean;
}

/**
 * Collapse browser navigation details into the few actions the background
 * worker needs. Top-level commits wait for the new content script, while
 * same-document and descendant changes always arrange a fresh live scan.
 */
export function planNavigation(
  kind: NavigationEventKind,
  frameId: number,
): NavigationPlan {
  const isTopFrame = frameId === 0;

  if (kind === 'committed' && isTopFrame) {
    return {
      invalidate: true,
      showPending: true,
      cancelScheduledScan: true,
      scanDelayMs: null,
    };
  }

  const isSameDocument = kind === 'history-state-updated'
    || kind === 'reference-fragment-updated';
  const scanDelayMs = isTopFrame && (isSameDocument || kind === 'completed')
    ? 0
    : DESCENDANT_SCAN_COALESCE_MS;

  return {
    invalidate: true,
    showPending: true,
    cancelScheduledScan: false,
    scanDelayMs,
  };
}

/**
 * `tabs.onUpdated` may report a same-document URL before or after the matching
 * webNavigation event. A URL-only update therefore schedules its own scan so
 * either event order converges instead of leaving the badge pending forever.
 */
export function planTabUpdate(
  status: 'loading' | 'complete' | 'unloaded' | undefined,
  urlChanged: boolean,
): NavigationPlan {
  if (status === 'loading' || status === 'unloaded') {
    return {
      invalidate: true,
      showPending: true,
      cancelScheduledScan: true,
      scanDelayMs: null,
    };
  }

  if (urlChanged) {
    return {
      invalidate: true,
      showPending: true,
      cancelScheduledScan: false,
      scanDelayMs: 0,
    };
  }

  return {
    invalidate: false,
    showPending: false,
    cancelScheduledScan: false,
    scanDelayMs: status === 'complete' ? 0 : null,
  };
}

/**
 * Keep the earliest pending deadline. Repeated iframe events share one timer,
 * but a more urgent request (for example a top-level history update) can pull
 * an existing scan forward.
 */
export function coalesceScanDeadline(
  existingDueAt: number | undefined,
  now: number,
  delayMs: number,
): CoalescedScanDeadline {
  const safeDelay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
  const requestedDueAt = now + safeDelay;

  if (existingDueAt !== undefined && existingDueAt >= now) {
    if (existingDueAt <= requestedDueAt) {
      return { dueAt: existingDueAt, replaceTimer: false };
    }
  }

  return { dueAt: requestedDueAt, replaceTimer: true };
}
