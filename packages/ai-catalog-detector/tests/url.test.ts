import { expect, test } from 'bun:test';
import type { ScanResult } from '../utils/types';
import { getScanTarget, isScanTarget } from '../utils/url';

test('discovers the AI Catalog on the current HTTPS origin', () => {
  const target = getScanTarget('https://example.com/docs/page?x=1');

  expect(isScanTarget(target)).toBe(true);
  if (!isScanTarget(target)) return;
  expect(target.endpoint).toBe('https://example.com/.well-known/ai-catalog.json');
});

test('upgrades non-local HTTP pages to HTTPS discovery', () => {
  const target = getScanTarget('http://example.com/path');

  expect(isScanTarget(target)).toBe(true);
  if (!isScanTarget(target)) return;
  expect(target.endpoint).toBe('https://example.com/.well-known/ai-catalog.json');
});

test('keeps HTTP for local development hosts', () => {
  const target = getScanTarget('http://localhost:5173/app');

  expect(isScanTarget(target)).toBe(true);
  if (!isScanTarget(target)) return;
  expect(target.endpoint).toBe('http://localhost:5173/.well-known/ai-catalog.json');
});

test('skips unsupported schemes', () => {
  const target = getScanTarget('chrome://extensions');

  expect(isScanTarget(target)).toBe(false);
  expect((target as ScanResult).status).toBe('unsupported');
});
