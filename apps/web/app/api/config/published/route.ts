import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { effectiveTemplateVisibility, ensureSeedConfigs, listDocs } from 'lib/config-service';
import { readAppData, updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id ?? null;

  const data = await readAppData();
  const full = data.configDocs['builtin:board-full'];
  const sysTpl = data.configDocs['system:template-standard'];
  const legacyTpl = data.configDocs['builtin:template-standard'];
  const hasDefaultTpl = !!(sysTpl?.publishedVersionId || legacyTpl?.publishedVersionId);
  if (!Object.keys(data.configDocs).length || !full || !full.publishedVersionId || !hasDefaultTpl) {
    await updateAppData((d) => {
      ensureSeedConfigs(d, Date.now());
    });
  }

  const data2 = await readAppData();
  const mapKind = (kind: 'rules' | 'board' | 'cards' | 'template') =>
    listDocs(data2, kind)
      .filter((d) => d.publishedVersionId)
      .map((d) => ({
        docId: d.docId,
        name: d.name,
        versionId: d.publishedVersionId,
        updatedAtMs: d.updatedAtMs,
      }));

  const sysTpl2 = data2.configDocs['system:template-standard'];
  const legacyTpl2 = data2.configDocs['builtin:template-standard'];
  const defaultTemplateVersionId = sysTpl2?.publishedVersionId || legacyTpl2?.publishedVersionId || null;

  const hiddenTemplateDocIds = new Set(['system:template-standard', 'builtin:template-standard']);
  const templates = listDocs(data2, 'template')
    .filter((d) => d.publishedVersionId)
    .filter((d) => !hiddenTemplateDocIds.has(d.docId))
    .filter((d) => {
      const visibility = effectiveTemplateVisibility(d);
      if (visibility === 'public') return true;
      if (!uid) return false;
      return d.ownerId === uid;
    })
    .map((d) => ({
      docId: d.docId,
      name: d.name,
      versionId: d.publishedVersionId as string,
      updatedAtMs: d.updatedAtMs,
    }));

  return NextResponse.json({
    rules: mapKind('rules'),
    boards: mapKind('board'),
    cards: mapKind('cards'),
    templates,
    defaultTemplateVersionId,
  });
}
