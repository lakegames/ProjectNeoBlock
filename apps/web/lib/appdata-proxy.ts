import { getServerSession } from 'next-auth/next';

import { authOptions } from 'lib/auth';
import { getGuestIdentity } from 'lib/identity';

type ProxyResult = {
  status: number;
  body: unknown;
};

function readEnv(name: string) {
  return process.env[name] ?? null;
}

function shouldHaveBody(method: string) {
  return method !== 'GET' && method !== 'HEAD';
}

async function readBody(req: Request) {
  const method = req.method.toUpperCase();
  if (!shouldHaveBody(method)) return undefined;
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return undefined;
  return Buffer.from(buf);
}

function pickHeader(src: Headers, key: string) {
  const v = src.get(key);
  return v ? v : null;
}

export async function proxyAppDataApi(req: Request, apiPathname: string): Promise<ProxyResult> {
  const baseUrl = readEnv('NEOBLOCK_SERVER_HTTP_URL');
  if (!baseUrl) return { status: 500, body: { error: 'NEOBLOCK_SERVER_HTTP_URL_NOT_CONFIGURED' } };

  const proxyKey = readEnv('NEOBLOCK_PROXY_KEY');
  if (!proxyKey) return { status: 500, body: { error: 'NEOBLOCK_PROXY_KEY_NOT_CONFIGURED' } };

  const incomingUrl = new URL(req.url);
  const upstreamUrl = new URL(apiPathname, baseUrl);
  upstreamUrl.search = incomingUrl.search;

  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id ?? null;
  const guest = uid ? null : getGuestIdentity();

  const headers = new Headers();
  const contentType = pickHeader(req.headers, 'content-type');
  if (contentType) headers.set('content-type', contentType);
  const accept = pickHeader(req.headers, 'accept');
  if (accept) headers.set('accept', accept);
  const origin = pickHeader(req.headers, 'origin');
  if (origin) headers.set('origin', origin);

  headers.set('x-neoblock-proxy-key', proxyKey);

  if (uid) {
    headers.set('x-neoblock-actor-uid', uid);
    const displayName = (session?.user?.name ?? uid).toString();
    headers.set('x-neoblock-actor-display-name', displayName);
    const githubAvatarUrl = session?.user?.image?.toString() ?? '';
    if (githubAvatarUrl) headers.set('x-neoblock-actor-github-avatar-url', githubAvatarUrl);
    headers.set('x-neoblock-actor-player-id', `user:${uid}`);
  } else if (guest) {
    headers.set('x-neoblock-guest-id', guest.id);
    headers.set('x-neoblock-guest-nickname', guest.nickname);
    headers.set('x-neoblock-actor-player-id', `guest:${guest.id}`);
  }

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    method: req.method,
    headers,
    body: (await readBody(req)) ?? null,
  });

  const status = upstreamRes.status;
  const body = (await upstreamRes.json().catch(() => null)) as unknown;
  return { status, body };
}
