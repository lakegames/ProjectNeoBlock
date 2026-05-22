import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type TokenWithUid = {
  uid?: string;
  accessToken?: string;
};

const adminOrg = process.env.NEOBLOCK_ADMIN_GITHUB_ORG || 'lakegames';

async function githubGet(accessToken: string, url: string) {
  const r = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `token ${accessToken}`,
      'user-agent': 'neoblock-admin-debug',
    },
    cache: 'no-store',
  });
  const body = (await r.json().catch(() => null)) as unknown;
  return {
    ok: r.ok,
    status: r.status,
    oauthScopes: r.headers.get('x-oauth-scopes'),
    acceptedOAuthScopes: r.headers.get('x-accepted-oauth-scopes'),
    body,
  };
}

export async function GET(req: Request) {
  const t = (await getToken({
    req: req as unknown as Parameters<typeof getToken>[0]['req'],
    ...(process.env.NEXTAUTH_SECRET ? { secret: process.env.NEXTAUTH_SECRET } : {}),
  })) as (Record<string, unknown> & TokenWithUid) | null;

  const uid = t?.uid;
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const accessToken = t?.accessToken;
  if (!accessToken) return NextResponse.json({ uid, error: 'NO_GITHUB_ACCESS_TOKEN' }, { status: 200 });

  const me = await githubGet(accessToken, 'https://api.github.com/user');
  const membership = await githubGet(accessToken, `https://api.github.com/user/memberships/orgs/${encodeURIComponent(adminOrg)}`);

  const meBody = me.body as { login?: unknown; id?: unknown } | null;

  return NextResponse.json({
    uid,
    github: {
      login: typeof meBody?.login === 'string' ? meBody.login : null,
      id: typeof meBody?.id === 'number' ? meBody.id : null,
    },
    tokenScopes: me.oauthScopes,
    adminOrg,
    orgMembership: {
      ok: membership.ok,
      status: membership.status,
      oauthScopes: membership.oauthScopes,
      acceptedOAuthScopes: membership.acceptedOAuthScopes,
      body: membership.body,
    },
  });
}

