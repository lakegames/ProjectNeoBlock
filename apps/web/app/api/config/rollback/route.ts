import { NextResponse } from 'next/server';

import { ensureSeedConfigs, rollbackByDocId } from 'lib/config-service';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = { docId?: string; targetVersionId?: string; note?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const docId = body?.docId?.trim() ?? '';
  const targetVersionId = body?.targetVersionId?.trim() ?? '';
  if (!docId) return NextResponse.json({ error: 'INVALID_DOC_ID' }, { status: 400 });
  if (!targetVersionId) return NextResponse.json({ error: 'INVALID_TARGET_VERSION' }, { status: 400 });
  const note = typeof body?.note === 'string' ? body.note.trim() : undefined;

  const nowMs = Date.now();
  const result = await updateAppData((data) => {
    ensureSeedConfigs(data, nowMs);
    return rollbackByDocId(data, { docId, targetVersionId, nowMs, ...(note ? { note } : {}) });
  });

  if (!result.ok) {
    const status = result.error === 'DOC_NOT_FOUND' ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
