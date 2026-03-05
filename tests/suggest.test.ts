import { describe, it, expect } from 'vitest';
import { generateVariants } from '../src/suggest.js';

describe('generateVariants', () => {
  it('generates suffix variants', () => {
    const variants = generateVariants({ name: 'myapp' });
    expect(variants).toContain('myapp-cli');
    expect(variants).toContain('myapp-js');
    expect(variants).toContain('myapp-pkg');
    expect(variants).toContain('myappx');
  });

  it('generates prefix variants', () => {
    const variants = generateVariants({ name: 'myapp' });
    expect(variants).toContain('get-myapp');
    expect(variants).toContain('use-myapp');
  });

  it('includes scoped fallback', () => {
    const variants = generateVariants({ name: 'myapp' });
    expect(variants).toContain('@myapp/myapp');
  });

  it('generates unique variants', () => {
    const variants = generateVariants({ name: 'test' });
    const unique = new Set(variants);
    expect(unique.size).toBe(variants.length);
  });
});
