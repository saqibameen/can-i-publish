import { checkName } from './check.js';
import type { CheckResult } from './check.js';

interface SuggestOptions {
  name: string;
  limit?: number;
}

function generateVariants({ name }: { name: string }): string[] {
  const variants: string[] = [];
  const suffixes = ['-cli', '-js', '-pkg', '-lib', '-tool', '-app', 'x', '-dev'];
  const prefixes = ['get-', 'use-', 'my-', 'the-'];

  for (const suffix of suffixes) {
    variants.push(`${name}${suffix}`);
  }

  for (const prefix of prefixes) {
    variants.push(`${prefix}${name}`);
  }

  // Scoped fallback
  variants.push(`@${name}/${name}`);

  return variants;
}

async function suggestNames({ name, limit = 5 }: SuggestOptions): Promise<CheckResult[]> {
  const variants = generateVariants({ name });
  const available: CheckResult[] = [];

  for (const variant of variants) {
    if (available.length >= limit) break;
    const result = await checkName({ name: variant });
    if (result.status === 'available') {
      available.push(result);
    }
  }

  return available;
}

export { suggestNames, generateVariants };
export type { SuggestOptions };
