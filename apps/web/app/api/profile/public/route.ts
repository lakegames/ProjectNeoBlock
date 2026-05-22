import { NextResponse } from 'next/server';

import { readAppData } from 'lib/store';

export const runtime = 'nodejs';

type PublicProfile = {
  id: string;
  displayName: string;
  avatarKind: 'custom' | 'github' | 'none';
  avatarUrl: string | null;
};

function avatarInfoFor(profile: {
  id: string;
  githubAvatarUrl?: string | null;
  customAvatarMime?: string | null;
  avatarUpdatedAt?: string | null;
  avatarKey?: string | null;
}) {
  const legacyKey = profile.avatarKey;
  if (profile.customAvatarMime || (typeof legacyKey === 'string' && legacyKey)) {
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

function normalizeId(input: string) {
  const id = input.trim();
  if (!id || id.length > 200) return null;
  return id;
}

function fallbackDisplayName(id: string) {
  return id.split(':').at(-1) || id;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const idsParam = url.searchParams.get('ids');
  const idsRaw = idsParam ? idsParam.split(',') : url.searchParams.getAll('userId');
  const ids: string[] = [];
  for (const raw of idsRaw) {
    const id = normalizeId(raw);
    if (!id) return NextResponse.json({ error: 'INVALID_USER_ID' }, { status: 400 });
    if (!ids.includes(id)) ids.push(id);
  }

  if (!ids.length) return NextResponse.json({ error: 'INVALID_USER_ID' }, { status: 400 });
  if (ids.length > 50) return NextResponse.json({ error: 'TOO_MANY_IDS' }, { status: 400 });

  const data = await readAppData();
  const profiles: PublicProfile[] = ids.map((id) => {
    const p = data.profiles[id];
    const avatar = p ? avatarInfoFor(p as typeof p & { avatarKey?: string | null }) : { avatarKind: 'none' as const, avatarUrl: null };
    return {
      id,
      displayName: p?.displayName ?? fallbackDisplayName(id),
      ...avatar,
    };
  });

  return NextResponse.json({ profiles });
}
