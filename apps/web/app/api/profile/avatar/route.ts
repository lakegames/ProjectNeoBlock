import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { readAppData, updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type SessionLike = { user?: { id?: string; name?: string | null; email?: string | null } } | null;

function getUid(session: SessionLike) {
  return session?.user?.id;
}

function avatarDirPath() {
  return path.join(process.cwd(), '.data', 'avatars');
}

function avatarFileName(userId: string) {
  return userId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function avatarFilePath(userId: string, ext: string) {
  return path.join(avatarDirPath(), `${avatarFileName(userId)}.${ext}`);
}

async function ensureAvatarDir() {
  await mkdir(avatarDirPath(), { recursive: true });
}

function avatarInfoFor(profile: {
  id: string;
  githubAvatarUrl?: string | null;
  customAvatarMime?: string | null;
  avatarUpdatedAt?: string | null;
}) {
  if (profile.customAvatarMime) {
    const t = profile.avatarUpdatedAt || '';
    return {
      avatarKind: 'custom' as const,
      avatarUrl: `/api/profile/avatar?userId=${encodeURIComponent(profile.id)}&t=${encodeURIComponent(t)}`,
    };
  }
  if (profile.githubAvatarUrl) {
    return { avatarKind: 'github' as const, avatarUrl: profile.githubAvatarUrl };
  }
  return { avatarKind: 'none' as const, avatarUrl: null };
}

function validateUserId(input: string) {
  const userId = input.trim();
  if (!userId || userId.length > 200) return null;
  return userId;
}

function normalizeMime(input: string) {
  const v = input.trim().toLowerCase();
  if (v === 'image/png') return 'image/png' as const;
  if (v === 'image/webp') return 'image/webp' as const;
  if (v === 'image/jpeg' || v === 'image/jpg') return 'image/jpeg' as const;
  return null;
}

function extForMime(mime: 'image/png' | 'image/jpeg' | 'image/webp') {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function decodeImageDataUrl(dataUrl: string) {
  const m = /^data:([^;,]+);base64,(.*)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mimeRaw = m[1] ?? '';
  const base64 = (m[2] ?? '').trim();
  if (!base64) return null;
  if (mimeRaw.toLowerCase().includes('svg')) return null;
  const mime = normalizeMime(mimeRaw);
  if (!mime) return null;
  const buf = Buffer.from(base64, 'base64');
  if (!buf.length) return null;
  if (buf.length > 150 * 1024) return null;
  return { mime, buf, ext: extForMime(mime) };
}

async function removeAllAvatarFiles(userId: string) {
  const base = avatarFileName(userId);
  await Promise.allSettled([
    unlink(path.join(avatarDirPath(), `${base}.png`)),
    unlink(path.join(avatarDirPath(), `${base}.jpg`)),
    unlink(path.join(avatarDirPath(), `${base}.webp`)),
  ]);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userIdQuery = url.searchParams.get('userId');

  let userId = userIdQuery ? validateUserId(userIdQuery) : null;
  if (!userId) {
    const session = await getServerSession(authOptions);
    const uid = getUid(session);
    userId = uid ? validateUserId(uid) : null;
  }
  if (!userId) return NextResponse.json({ error: 'INVALID_USER_ID' }, { status: 400 });

  const data = await readAppData();
  const profile = data.profiles[userId];
  const legacyKey = (profile as unknown as { avatarKey?: unknown } | undefined)?.avatarKey;
  const customMime =
    (profile?.customAvatarMime as 'image/png' | 'image/jpeg' | 'image/webp' | null | undefined) ??
    (typeof legacyKey === 'string' && legacyKey ? 'image/png' : null);
  if (!customMime) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const ext = extForMime(customMime);

  try {
    const raw = await readFile(avatarFilePath(userId, ext));
    const t = url.searchParams.get('t');
    const avatarUpdatedAt = (profile as { avatarUpdatedAt?: string | null } | undefined)?.avatarUpdatedAt ?? null;
    const cacheControl =
      typeof t === 'string' && t && t === avatarUpdatedAt
        ? 'public, max-age=31536000, immutable'
        : 'no-store';
    return new NextResponse(raw, {
      status: 200,
      headers: {
        'content-type': customMime,
        'cache-control': cacheControl,
      },
    });
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = getUid(session);
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { dataUrl?: string } | null;
  const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl.trim() : '';
  const decoded = decodeImageDataUrl(dataUrl);
  if (!decoded) return NextResponse.json({ error: 'INVALID_AVATAR' }, { status: 400 });

  await ensureAvatarDir();
  await removeAllAvatarFiles(uid);
  await writeFile(avatarFilePath(uid, decoded.ext), decoded.buf);

  const result = await updateAppData((data) => {
    const now = new Date().toISOString();
    const existing = data.profiles[uid];
    if (!existing) {
      const fallback =
        session?.user?.name?.trim() || session?.user?.email?.trim() || uid.split(':').at(-1) || '玩家';
      data.profiles[uid] = {
        id: uid,
        displayName: fallback,
        githubAvatarUrl: null,
        customAvatarDataUrl: null,
        customAvatarMime: null,
        avatarUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      if (typeof existing.githubAvatarUrl === 'undefined') existing.githubAvatarUrl = null;
      if (typeof (existing as { customAvatarDataUrl?: unknown }).customAvatarDataUrl === 'undefined') {
        (existing as { customAvatarDataUrl?: string | null }).customAvatarDataUrl = null;
      }
      if (typeof existing.customAvatarMime === 'undefined') existing.customAvatarMime = null;
      if (typeof existing.avatarUpdatedAt === 'undefined') existing.avatarUpdatedAt = null;
    }

    const profile = data.profiles[uid]!;
    profile.customAvatarDataUrl = dataUrl;
    profile.customAvatarMime = decoded.mime;
    profile.avatarUpdatedAt = now;
    profile.updatedAt = now;

    const avatar = avatarInfoFor(profile);
    return {
      profile: {
        ...profile,
        ...avatar,
      },
    };
  });

  return NextResponse.json(result);
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const uid = getUid(session);
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  await ensureAvatarDir();
  await removeAllAvatarFiles(uid);

  const result = await updateAppData((data) => {
    const now = new Date().toISOString();
    const existing = data.profiles[uid];
    if (!existing) return { error: 'PROFILE_NOT_FOUND' as const };

    if (typeof existing.githubAvatarUrl === 'undefined') existing.githubAvatarUrl = null;
    if (typeof (existing as { customAvatarDataUrl?: unknown }).customAvatarDataUrl === 'undefined') {
      (existing as { customAvatarDataUrl?: string | null }).customAvatarDataUrl = null;
    }
    if (typeof existing.customAvatarMime === 'undefined') existing.customAvatarMime = null;
    if (typeof existing.avatarUpdatedAt === 'undefined') existing.avatarUpdatedAt = null;

    existing.customAvatarDataUrl = null;
    existing.customAvatarMime = null;
    existing.avatarUpdatedAt = null;
    existing.updatedAt = now;

    const avatar = avatarInfoFor(existing);
    return {
      profile: {
        ...existing,
        ...avatar,
      },
    };
  });

  if ('error' in result) return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result);
}
