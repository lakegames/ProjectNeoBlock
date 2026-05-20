import { NextResponse } from 'next/server';

import { listDocs, ensureSeedConfigs } from 'lib/config-service';
import { readAppData, updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kindParam = url.searchParams.get('kind');
  const kind = kindParam === 'rules' || kindParam === 'board' || kindParam === 'cards' ? kindParam : null;
  if (kindParam && !kind) return NextResponse.json({ error: 'INVALID_KIND' }, { status: 400 });

  const data = await readAppData();
  if (!Object.keys(data.configDocs).length) {
    await updateAppData((d) => {
      ensureSeedConfigs(d, Date.now());
    });
  }

  const data2 = await readAppData();
  const docs = listDocs(data2, kind ?? undefined).map((d) => ({
    docId: d.docId,
    kind: d.kind,
    name: d.name,
    createdAtMs: d.createdAtMs,
    updatedAtMs: d.updatedAtMs,
    publishedVersionId: d.publishedVersionId,
    draftVersionId: d.draftVersionId,
  }));

  return NextResponse.json({ docs });
}
