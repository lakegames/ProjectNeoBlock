import { NextResponse } from 'next/server';

import { ensureSeedConfigs } from 'lib/config-service';
import { readAppData, updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  let docId = url.searchParams.get('docId')?.trim() ?? '';
  for (let i = 0; i < 2; i += 1) {
    if (!docId.includes('%')) break;
    try {
      const d = decodeURIComponent(docId);
      if (d === docId) break;
      docId = d;
    } catch {
      break;
    }
  }
  if (!docId) return NextResponse.json({ error: 'INVALID_DOC_ID' }, { status: 400 });

  const data = await readAppData();
  const full = data.configDocs['builtin:board-full'];
  if (!Object.keys(data.configDocs).length || !full || !full.publishedVersionId) {
    await updateAppData((d) => {
      ensureSeedConfigs(d, Date.now());
    });
  }

  const data2 = await readAppData();
  const doc = data2.configDocs[docId];
  if (!doc) return NextResponse.json({ error: 'DOC_NOT_FOUND' }, { status: 404 });

  const draft = doc.versions[doc.draftVersionId] ?? null;
  const published = doc.publishedVersionId ? (doc.versions[doc.publishedVersionId] ?? null) : null;

  const versions = doc.versionIds
    .map((id) => doc.versions[id])
    .filter(Boolean)
    .map((v) => ({
      versionId: v!.versionId,
      status: v!.status,
      createdAtMs: v!.createdAtMs,
      updatedAtMs: v!.updatedAtMs,
      baseVersionId: v!.baseVersionId ?? null,
      note: v!.note ?? null,
    }));

  return NextResponse.json({
    doc: {
      docId: doc.docId,
      kind: doc.kind,
      name: doc.name,
      createdAtMs: doc.createdAtMs,
      updatedAtMs: doc.updatedAtMs,
      publishedVersionId: doc.publishedVersionId,
      draftVersionId: doc.draftVersionId,
      versions,
    },
    draft: draft ? { versionId: draft.versionId, data: draft.data, updatedAtMs: draft.updatedAtMs } : null,
    published: published ? { versionId: published.versionId, data: published.data, updatedAtMs: published.updatedAtMs } : null,
  });
}
