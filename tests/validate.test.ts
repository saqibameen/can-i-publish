import { describe, it, expect } from 'vitest';
import { validateName } from '../src/check.js';

describe('validateName', () => {
  it('accepts valid lowercase names', () => {
    expect(validateName({ name: 'my-package' })).toBeNull();
    expect(validateName({ name: 'my.package' })).toBeNull();
    expect(validateName({ name: 'my_package' })).toBeNull();
    expect(validateName({ name: 'mypackage123' })).toBeNull();
  });

  it('accepts scoped names', () => {
    expect(validateName({ name: '@scope/package' })).toBeNull();
    expect(validateName({ name: '@my-org/my-pkg' })).toBeNull();
  });

  it('rejects empty names', () => {
    expect(validateName({ name: '' })).toBe('Package name cannot be empty');
  });

  it('rejects names starting with . or _', () => {
    expect(validateName({ name: '.hidden' })).toBe('Package name cannot start with . or _');
    expect(validateName({ name: '_private' })).toBe('Package name cannot start with . or _');
  });

  it('rejects names with uppercase', () => {
    expect(validateName({ name: 'MyPackage' })).toMatch(/invalid characters/);
  });

  it('rejects names with spaces', () => {
    expect(validateName({ name: 'my package' })).toMatch(/invalid characters/);
  });

  it('rejects names longer than 214 chars', () => {
    expect(validateName({ name: 'a'.repeat(215) })).toMatch(/longer than 214/);
  });
});
