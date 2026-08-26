import { describe, expect, test } from 'bun:test';
import {
  DESCENDANT_SCAN_COALESCE_MS,
  coalesceScanDeadline,
  planNavigation,
  planTabUpdate,
} from '@/utils/navigation';

describe('same-document navigation planning', () => {
  for (const kind of ['history-state-updated', 'reference-fragment-updated'] as const) {
    test(`${kind} invalidates and immediately re-scans the top document`, () => {
      expect(planNavigation(kind, 0)).toEqual({
        invalidate: true,
        showPending: true,
        cancelScheduledScan: false,
        scanDelayMs: 0,
      });
    });
  }

  test('a URL-only tabs update also re-scans, independent of event order', () => {
    expect(planTabUpdate(undefined, true)).toEqual({
      invalidate: true,
      showPending: true,
      cancelScheduledScan: false,
      scanDelayMs: 0,
    });
  });
});

describe('descendant frame navigation planning', () => {
  for (const kind of ['committed', 'completed'] as const) {
    test(`${kind} removes stale frame state and schedules a coalesced scan`, () => {
      expect(planNavigation(kind, 12)).toEqual({
        invalidate: true,
        showPending: true,
        cancelScheduledScan: false,
        scanDelayMs: DESCENDANT_SCAN_COALESCE_MS,
      });
    });
  }

  test('a top-level commit cancels a scan for the document being replaced', () => {
    expect(planNavigation('committed', 0)).toEqual({
      invalidate: true,
      showPending: true,
      cancelScheduledScan: true,
      scanDelayMs: null,
    });
  });
});

describe('per-tab scan coalescing', () => {
  test('many iframe events keep the first bounded deadline', () => {
    const first = coalesceScanDeadline(undefined, 1_000, DESCENDANT_SCAN_COALESCE_MS);
    const second = coalesceScanDeadline(first.dueAt, 1_010, DESCENDANT_SCAN_COALESCE_MS);
    const third = coalesceScanDeadline(second.dueAt, 1_030, DESCENDANT_SCAN_COALESCE_MS);

    expect(first).toEqual({ dueAt: 1_075, replaceTimer: true });
    expect(second).toEqual({ dueAt: 1_075, replaceTimer: false });
    expect(third).toEqual({ dueAt: 1_075, replaceTimer: false });
  });

  test('an urgent same-document scan pulls an iframe deadline forward', () => {
    expect(coalesceScanDeadline(1_075, 1_020, 0)).toEqual({
      dueAt: 1_020,
      replaceTimer: true,
    });
  });

  test('an expired deadline creates a new timer', () => {
    expect(coalesceScanDeadline(1_000, 1_001, DESCENDANT_SCAN_COALESCE_MS)).toEqual({
      dueAt: 1_076,
      replaceTimer: true,
    });
  });
});
