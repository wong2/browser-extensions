import { expect, test } from 'bun:test';
import { getBadgeState } from '../utils/badge';
import type { ScanResult, ServerCard } from '../utils/types';

const card: ServerCard = {
  name: 'example-org/minimal',
  version: '1.0.0',
  description: 'Smallest valid Server Card.',
};

function result(status: ScanResult['status'], count = 0, warnings = 0): ScanResult {
  return {
    status,
    fetchedAt: 1000,
    entries: Array.from({ length: count }, () => ({
      type: 'application/mcp-server-card+json',
      inline: false,
      serverCard: card,
      warnings: Array.from({ length: warnings }, () => ({ code: 'schema' as const, message: 'warn' })),
    })),
    warnings: [],
  };
}

test('shows the number of catalog entries', () => {
  expect(getBadgeState(result('found', 2)).text).toBe('2');
  expect(getBadgeState(result('found', 2)).color).toBe('#167c4a');
});

test('uses a warning color when a card has compliance issues', () => {
  expect(getBadgeState(result('found-with-warnings', 1, 1)).color).toBe('#b26b00');
});

test('clears the badge when nothing was detected', () => {
  expect(getBadgeState(result('not-found')).text).toBe('');
  expect(getBadgeState(result('unsupported')).text).toBe('');
});
