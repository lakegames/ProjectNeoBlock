import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { ensureSeedConfigs, updateDraft } from 'lib/config-service';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = { docId?: string; draftData?: unknown };

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id ?? null;

  const body = (await req.json().catch(() => null)) as Body | null;
  const docId = body?.docId?.trim() ?? '';
  if (!docId) return NextResponse.json({ error: 'INVALID_DOC_ID' }, { status: 400 });

  const nowMs = Date.now();
  const result = await updateAppData((data) => {
    ensureSeedConfigs(data, nowMs);
    const doc = data.configDocs[docId];
    if (doc?.kind === 'template') {
      if (!uid) return { ok: false as const, error: 'UNAUTHORIZED' as const };
      if (typeof doc.ownerId === 'undefined') doc.ownerId = uid;
      if (doc.ownerId !== uid) return { ok: false as const, error: 'FORBIDDEN' as const };
    }
    return updateDraft(data, { docId, nowMs, draftData: body?.draftData });
  });

  if (!result.ok) {
    const status = result.error === 'DOC_NOT_FOUND' ? 404 : result.error === 'UNAUTHORIZED' ? 401 : result.error === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
