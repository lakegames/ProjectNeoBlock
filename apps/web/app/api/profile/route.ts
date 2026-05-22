import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type SessionLike = { user?: { id?: string; name?: string | null; email?: string | null; image?: string | null } } | null;

function getUid(session: SessionLike) {
  return session?.user?.id;
}

function validateGithubAvatarUrl(input: unknown) {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (!v || v.length > 500) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
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

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = getUid(session);
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

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
      const legacyKey = (existing as unknown as { avatarKey?: unknown }).avatarKey;
      if (
        typeof legacyKey === 'string' &&
        legacyKey &&
        !existing.customAvatarMime &&
        !(existing as unknown as { customAvatarDataUrl?: unknown }).customAvatarDataUrl
      ) {
        existing.customAvatarMime = 'image/png';
        existing.avatarUpdatedAt = now;
      }
    }
    const githubUrl = validateGithubAvatarUrl(session?.user?.image);
    if (githubUrl && githubUrl !== data.profiles[uid]!.githubAvatarUrl) {
      data.profiles[uid]!.githubAvatarUrl = githubUrl;
      data.profiles[uid]!.updatedAt = now;
    }
    const profile = data.profiles[uid]!;
    const avatar = avatarInfoFor(profile);
    return {
      profile: {
        ...profile,
        ...avatar,
      },
      friends: data.friends[uid] ?? [],
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = getUid(session);
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { displayName?: string } | null;
  const displayName = body?.displayName?.trim();
  if (!displayName || displayName.length > 40) {
    return NextResponse.json({ error: 'INVALID_DISPLAY_NAME' }, { status: 400 });
  }

  const result = await updateAppData((data) => {
    const now = new Date().toISOString();
    const existing = data.profiles[uid];
    if (!existing) {
      data.profiles[uid] = {
        id: uid,
        displayName,
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
      existing.displayName = displayName;
      existing.updatedAt = now;
    }
    const profile = data.profiles[uid]!;
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
