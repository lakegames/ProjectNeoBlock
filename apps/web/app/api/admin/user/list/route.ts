import { NextResponse } from 'next/server';

import { requireAdmin } from 'lib/admin-auth';
import { readAppData } from 'lib/store';

export const runtime = 'nodejs';

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

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const data = await readAppData();

  const impliedUserIds = new Set<string>();
  for (const room of Object.values(data.rooms)) {
    for (const m of room.members) {
      if (m.userId) impliedUserIds.add(m.userId);
    }
  }

  const ids = [...new Set([...Object.keys(data.profiles), ...impliedUserIds])];
  const users = ids
    .map((id) => {
      const p = data.profiles[id];
      const friends = data.friends[id] ?? [];
      const roomCount = Object.values(data.rooms).filter((r) => r.members.some((m) => m.userId === id)).length;
      return {
        id,
        displayName: p?.displayName ?? id,
        ...(p ? avatarInfoFor(p as typeof p & { avatarKey?: string | null }) : { avatarKind: 'none' as const, avatarUrl: null }),
        createdAt: p?.createdAt ?? null,
        updatedAt: p?.updatedAt ?? null,
        friendCount: friends.length,
        roomCount,
      };
    })
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .slice(0, 500);

  return NextResponse.json({ users });
}
