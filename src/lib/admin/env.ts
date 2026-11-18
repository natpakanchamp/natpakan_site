import type { AccessConfig } from './auth';

export class AdminConfigError extends Error {}

export interface GithubConfig {
  token: string;
  repo: string;
  branch: string;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

export interface AdminEnv {
  access: AccessConfig;
  github: GithubConfig;
  r2: R2Config;
}

const REQUIRED = [
  'CF_ACCESS_TEAM_DOMAIN',
  'CF_ACCESS_AUD',
  'ADMIN_EMAILS',
  'GITHUB_TOKEN',
  'GITHUB_REPO',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'MEDIA_PUBLIC_BASE_URL',
] as const;

type RawEnv = Partial<Record<string, unknown>>;

/** Validate the admin secrets from the Cloudflare runtime env. Throws AdminConfigError naming what is wrong. */
export function readAdminEnv(raw: RawEnv): AdminEnv {
  const get = (key: string): string => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '');

  const missing = REQUIRED.filter((key) => !get(key));
  if (missing.length) throw new AdminConfigError(`Missing admin env: ${missing.join(', ')}`);

  const repo = get('GITHUB_REPO');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new AdminConfigError('GITHUB_REPO must look like owner/name');

  const publicBaseUrl = get('MEDIA_PUBLIC_BASE_URL').replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+/.test(publicBaseUrl)) throw new AdminConfigError('MEDIA_PUBLIC_BASE_URL must be an https URL');

  const teamDomain = get('CF_ACCESS_TEAM_DOMAIN').replace(/^https?:\/\//, '').replace(/\/+$/, '');

  return {
    access: {
      teamDomain: `https://${teamDomain}`,
      audience: get('CF_ACCESS_AUD'),
      adminEmails: get('ADMIN_EMAILS').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    },
    github: { token: get('GITHUB_TOKEN'), repo, branch: get('GITHUB_BRANCH') || 'main' },
    r2: {
      accountId: get('R2_ACCOUNT_ID'),
      accessKeyId: get('R2_ACCESS_KEY_ID'),
      secretAccessKey: get('R2_SECRET_ACCESS_KEY'),
      bucket: get('R2_BUCKET'),
      publicBaseUrl,
    },
  };
}
