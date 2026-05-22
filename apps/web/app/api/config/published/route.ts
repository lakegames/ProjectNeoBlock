import { NextResponse } from 'next/server';

import { ensureSeedConfigs, listDocs } from 'lib/config-service';
import { readAppData, updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function GET() {
  const data = await readAppData();
  const full = data.configDocs['builtin:board-full'];
  if (!Object.keys(data.configDocs).length || !full || !full.publishedVersionId) {
    await updateAppData((d) => {
      ensureSeedConfigs(d, Date.now());
    });
  }

  const data2 = await readAppData();
  const mapKind = (kind: 'rules' | 'board' | 'cards') =>
    listDocs(data2, kind)
      .filter((d) => d.publishedVersionId)
      .map((d) => ({
        docId: d.docId,
        name: d.name,
        versionId: d.publishedVersionId,
        updatedAtMs: d.updatedAtMs,
      }));

  return NextResponse.json({ rules: mapKind('rules'), boards: mapKind('board'), cards: mapKind('cards') });
}
