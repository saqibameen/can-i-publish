import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

type NameStatus = 'available' | 'taken' | 'squatted' | 'blocked' | 'invalid';

const ORG_NAME_RE = /^@[a-z\d][\w-.]+\/?$/i;

interface CheckResult {
  name: string;
  status: NameStatus;
  isOrganization?: boolean;
  reason?: string;
  similarTo?: string[];
}

interface CheckOptions {
  name: string;
}

interface RegistryMeta {
  name: string;
  'dist-tags'?: Record<string, string>;
  time?: Record<string, string>;
  readme?: string;
  versions?: Record<string, Record<string, unknown>>;
}

const NPM_REGISTRY = 'https://registry.npmjs.org';

const VALID_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function validateName({ name }: CheckOptions): string | null {
  if (!name || name.length === 0) return 'Package name cannot be empty';
  if (name.length > 214) return 'Package name cannot be longer than 214 characters';
  if (name.startsWith('.') || name.startsWith('_')) return 'Package name cannot start with . or _';
  if (!VALID_NAME_RE.test(name)) return 'Package name contains invalid characters (must be lowercase, alphanumeric, or - . _ ~)';
  return null;
}

async function fetchRegistryMeta({ name }: CheckOptions): Promise<RegistryMeta | null> {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) return null;
  return res.json() as Promise<RegistryMeta>;
}

async function checkRegistry({ name }: CheckOptions): Promise<'exists' | 'free'> {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (res.ok) return 'exists';
  if (res.status === 404) return 'free';

  return 'exists';
}

async function isSquatted({ name }: CheckOptions): Promise<boolean> {
  try {
    const [meta, downloadsRes] = await Promise.all([
      fetchRegistryMeta({ name }),
      fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`),
    ]);

    if (!meta) return false;

    // Exempt: significant downloads
    if (downloadsRes.ok) {
      const dlData = await downloadsRes.json() as { downloads: number };
      if (dlData.downloads > 500) return false;
    }

    // Exempt: recently published (within 30 days)
    if (meta.time?.modified) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (new Date(meta.time.modified) >= thirtyDaysAgo) return false;
    }

    // Check quality signals
    const hasReadme = typeof meta.readme === 'string' && meta.readme.trim().length >= 100;
    const latestVersion = meta['dist-tags']?.latest ?? '0.0.0';
    const major = parseInt(latestVersion.split('.')[0], 10);
    const hasProdVersion = major >= 1;

    // If it has a real readme AND a prod version, it's probably legit
    if (hasReadme && hasProdVersion) return false;

    return true;
  } catch {
    return false;
  }
}

function extractSimilarNames({ reason }: { reason: string }): string[] {
  const match = reason.match(/too similar to existing package[s]?\s+(.+?)(?:;|$)/i);
  if (!match) return [];
  return match[1].split(',').map((s) => s.trim()).filter(Boolean);
}

async function getNpmToken(): Promise<string | null> {
  const envToken = process.env.NPM_TOKEN;
  if (envToken) return envToken;

  try {
    const npmrcPath = join(homedir(), '.npmrc');
    const content = await readFile(npmrcPath, 'utf-8');
    const match = content.match(/\/\/registry\.npmjs\.org\/:_authToken=(.+)/);
    if (match) return match[1].trim();
  } catch {
    // No .npmrc or can't read it
  }

  return null;
}

async function checkSimilarity({ name }: CheckOptions): Promise<{
  blocked: boolean;
  checked: boolean;
  reason?: string;
  similarTo?: string[];
}> {
  const token = await getNpmToken();
  if (!token) {
    return { blocked: false, checked: false };
  }

  try {
    const res = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        _id: name,
        name,
        'dist-tags': { latest: '0.0.0-canipublish-check' },
        versions: {
          '0.0.0-canipublish-check': {
            name,
            version: '0.0.0-canipublish-check',
            dist: {
              tarball: 'https://invalid.test/fake.tgz',
              shasum: '0000000000000000000000000000000000000000',
            },
          },
        },
        _attachments: {},
      }),
    });

    const body = await res.text();

    if (res.status === 403 && body.toLowerCase().includes('similar')) {
      const similarTo = extractSimilarNames({ reason: body });
      return { blocked: true, checked: true, reason: body, similarTo };
    }

    return { blocked: false, checked: true };
  } catch {
    return { blocked: false, checked: false };
  }
}

async function checkOrg({ name }: CheckOptions): Promise<'exists' | 'free'> {
  const orgName = name.replace(/^@/, '').replace(/\/$/, '');
  const res = await fetch(`${NPM_REGISTRY}/-/org/${orgName}/package`, {
    headers: { Accept: 'application/json' },
  });

  if (res.ok) {
    const body = await res.text();
    return body.length > 2 ? 'exists' : 'free';
  }

  return res.status === 404 ? 'free' : 'exists';
}

async function checkName({ name }: CheckOptions): Promise<CheckResult> {
  if (ORG_NAME_RE.test(name)) {
    const orgStatus = await checkOrg({ name });
    return {
      name,
      status: orgStatus === 'exists' ? 'taken' : 'available',
      isOrganization: true,
    };
  }

  const validationError = validateName({ name });
  if (validationError) {
    return { name, status: 'invalid', reason: validationError };
  }

  const registryStatus = await checkRegistry({ name });
  if (registryStatus === 'exists') {
    const squatted = await isSquatted({ name });
    return {
      name,
      status: squatted ? 'squatted' : 'taken',
    };
  }

  const similarity = await checkSimilarity({ name });
  if (similarity.blocked) {
    return {
      name,
      status: 'blocked',
      reason: 'Blocked by npm similarity filter',
      similarTo: similarity.similarTo,
    };
  }

  if (!similarity.checked) {
    return { name, status: 'available', reason: 'Run `npm login` to also test the similarity filter.' };
  }

  return { name, status: 'available' };
}

export { checkName, checkOrg, checkRegistry, checkSimilarity, isSquatted, validateName, extractSimilarNames, getNpmToken };
export type { CheckResult, CheckOptions, NameStatus };
