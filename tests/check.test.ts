import { describe, it, expect } from 'vitest';
import { checkName, checkOrg, checkRegistry, checkSimilarity, isSquatted, extractSimilarNames } from '../src/check.js';

describe('checkRegistry', { timeout: 10000 }, () => {
  it('returns "exists" for a known package', async () => {
    const result = await checkRegistry({ name: 'chalk' });
    expect(result).toBe('exists');
  });

  it('returns "free" for a nonsense name', async () => {
    const result = await checkRegistry({ name: 'zzzz-nonexistent-pkg-12345678' });
    expect(result).toBe('free');
  });
});

describe('checkOrg', { timeout: 10000 }, () => {
  it('returns "exists" for a known org', async () => {
    const result = await checkOrg({ name: '@ava' });
    expect(result).toBe('exists');
  });

  it('returns "free" for a nonexistent org', async () => {
    const result = await checkOrg({ name: '@zzzzznonexistent99999' });
    expect(result).toBe('free');
  });
});

describe('checkName', { timeout: 15000 }, () => {
  it('returns taken for existing packages', async () => {
    const result = await checkName({ name: 'chalk' });
    expect(result.status).toBe('taken');
  });

  it('returns taken for existing orgs', async () => {
    const result = await checkName({ name: '@ava' });
    expect(result.status).toBe('taken');
    expect(result.isOrganization).toBe(true);
  });

  it('returns available for nonexistent orgs', async () => {
    const result = await checkName({ name: '@zzzzznonexistent99999' });
    expect(result.status).toBe('available');
    expect(result.isOrganization).toBe(true);
  });

  it('returns invalid for bad names', async () => {
    const result = await checkName({ name: 'UPPERCASE' });
    expect(result.status).toBe('invalid');
  });

  it('returns available for a clearly unique name', async () => {
    const result = await checkName({ name: 'zzzz-canipublish-test-98765' });
    expect(result.status).toBe('available');
  });

  it('detects squatted packages', async () => {
    const result = await checkName({ name: 'abc123' });
    expect(result.status).toBe('squatted');
  });
});

describe('isSquatted', { timeout: 10000 }, () => {
  it('returns true for a known squatted package', async () => {
    const result = await isSquatted({ name: 'abc123' });
    expect(result).toBe(true);
  });

  it('returns false for a popular package', async () => {
    const result = await isSquatted({ name: 'chalk' });
    expect(result).toBe(false);
  });
});

describe('checkSimilarity', { timeout: 10000 }, () => {
  it('returns checked: false when no token is available', async () => {
    const originalToken = process.env.NPM_TOKEN;
    const originalHome = process.env.HOME;
    process.env.NPM_TOKEN = '';
    process.env.HOME = '/tmp/nonexistent-home';
    try {
      const result = await checkSimilarity({ name: 'zzzz-test-no-token' });
      expect(result.checked).toBe(false);
      expect(result.blocked).toBe(false);
    } finally {
      process.env.NPM_TOKEN = originalToken ?? '';
      process.env.HOME = originalHome ?? '';
    }
  });

  it('includes login hint when similarity is not checked', async () => {
    const originalToken = process.env.NPM_TOKEN;
    const originalHome = process.env.HOME;
    process.env.NPM_TOKEN = '';
    process.env.HOME = '/tmp/nonexistent-home';
    try {
      const result = await checkName({ name: 'zzzz-test-no-token-hint' });
      expect(result.status).toBe('available');
      expect(result.reason).toMatch(/npm login/);
    } finally {
      process.env.NPM_TOKEN = originalToken ?? '';
      process.env.HOME = originalHome ?? '';
    }
  });
});

describe('extractSimilarNames', () => {
  it('extracts names from npm error message', () => {
    const reason = 'Package name too similar to existing packages degit,pdfkit,exit; try renaming';
    expect(extractSimilarNames({ reason })).toEqual(['degit', 'pdfkit', 'exit']);
  });

  it('extracts single name', () => {
    const reason = 'Package name too similar to existing package dx-tools; try renaming';
    expect(extractSimilarNames({ reason })).toEqual(['dx-tools']);
  });

  it('returns empty for unrelated message', () => {
    expect(extractSimilarNames({ reason: 'some other error' })).toEqual([]);
  });
});
