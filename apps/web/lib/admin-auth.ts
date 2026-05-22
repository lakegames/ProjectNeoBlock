import crypto from 'node:crypto';

import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

type TokenWithUid = {
  uid?: string;
  accessToken?: string;
};

const adminOrg = process.env.NEOBLOCK_ADMIN_GITHUB_ORG || 'lakegames';
const cacheTtlMs = 5 * 60 * 1000;
const membershipCache = new Map<string, { ok: boolean; checkedAtMs: number }>();

type OrgCheckResult =
  | { ok: true; state: string; oauthScopes: string | null }
  | { ok: false; reason: 'NOT_ORG_MEMBER'; status: 404; oauthScopes: string | null }
  | { ok: false; reason: 'MEMBERSHIP_NOT_ACTIVE'; status: 200; state: string; oauthScopes: string | null }
  | { ok: false; reason: 'GITHUB_UNAUTHORIZED' | 'GITHUB_FORBIDDEN' | 'GITHUB_ERROR'; status: number; message: string; oauthScopes: string | null };

async function checkOrgMembership(accessToken: string, org: string): Promise<OrgCheckResult> {
  const r = await fetch(`https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `token ${accessToken}`,
      'user-agent': 'neoblock-admin',
    },
    cache: 'no-store',
  });

  const oauthScopes = r.headers.get('x-oauth-scopes');
  const json = (await r.json().catch(() => null)) as { state?: unknown; message?: unknown } | null;

  if (r.status === 404) return { ok: false, reason: 'NOT_ORG_MEMBER', status: 404, oauthScopes };
  if (r.status === 401) {
    return {
      ok: false,
      reason: 'GITHUB_UNAUTHORIZED',
      status: 401,
      message: String(json?.message || 'Unauthorized'),
      oauthScopes,
    };
  }
  if (r.status === 403) {
    return {
      ok: false,
      reason: 'GITHUB_FORBIDDEN',
      status: 403,
      message: String(json?.message || 'Forbidden'),
      oauthScopes,
    };
  }
  if (!r.ok) {
    return {
      ok: false,
      reason: 'GITHUB_ERROR',
      status: r.status,
      message: String(json?.message || `GitHub ${r.status}`),
      oauthScopes,
    };
  }

  const state = String(json?.state || '');
  if (state === 'active') return { ok: true, state, oauthScopes };
  return { ok: false, reason: 'MEMBERSHIP_NOT_ACTIVE', status: 200, state: state || 'unknown', oauthScopes };
}

export type AdminAuthOk = { ok: true; uid: string; org: string };
export type AdminAuthFail = { ok: false; res: NextResponse };
export type AdminAuthResult = AdminAuthOk | AdminAuthFail;

export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const t = (await getToken({
    req: req as unknown as Parameters<typeof getToken>[0]['req'],
    ...(process.env.NEXTAUTH_SECRET ? { secret: process.env.NEXTAUTH_SECRET } : {}),
  })) as (Record<string, unknown> & TokenWithUid) | null;

  const uid = t?.uid;
  if (!uid) return { ok: false, res: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };

  const accessToken = t?.accessToken;
  if (!accessToken) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'FORBIDDEN', reason: 'NO_GITHUB_ACCESS_TOKEN', org: adminOrg }, { status: 403 }),
    };
  }

  const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex').slice(0, 16);
  const cacheKey = `${uid}:${tokenHash}`;

  const now = Date.now();
  const cached = membershipCache.get(cacheKey);
  if (cached && now - cached.checkedAtMs < cacheTtlMs) {
    if (!cached.ok) {
      return { ok: false, res: NextResponse.json({ error: 'FORBIDDEN', reason: 'NOT_ORG_MEMBER', org: adminOrg }, { status: 403 }) };
    }
    return { ok: true, uid, org: adminOrg };
  }

  const checked = await checkOrgMembership(accessToken, adminOrg);

  if (!checked.ok) {
    if (checked.reason === 'NOT_ORG_MEMBER') {
      membershipCache.set(cacheKey, { ok: false, checkedAtMs: now });
      return { ok: false, res: NextResponse.json({ error: 'FORBIDDEN', reason: 'NOT_ORG_MEMBER', org: adminOrg }, { status: 403 }) };
    }
    if (checked.reason === 'MEMBERSHIP_NOT_ACTIVE') {
      membershipCache.set(cacheKey, { ok: false, checkedAtMs: now });
      return {
        ok: false,
        res: NextResponse.json(
          { error: 'FORBIDDEN', reason: 'MEMBERSHIP_NOT_ACTIVE', org: adminOrg, state: checked.state, oauthScopes: checked.oauthScopes },
          { status: 403 },
        ),
      };
    }
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'FORBIDDEN', reason: checked.reason, org: adminOrg, message: checked.message, oauthScopes: checked.oauthScopes },
        { status: 403 },
      ),
    };
  }

  membershipCache.set(cacheKey, { ok: true, checkedAtMs: now });
  return { ok: true, uid, org: adminOrg };
}
