import crypto from 'node:crypto';

import {
  createDoc,
  defaultBoardConfig,
  defaultCardsConfig,
  defaultRulesConfig,
  fullBoardConfig,
  validateBoardConfig,
  validateCardsConfig,
  validateRulesConfig,
  validateTemplateConfig,
  type BoardConfigTemplate,
  type CardsConfig,
  type ConfigDoc,
  type ConfigKind,
  type ConfigIssue,
  type ConfigVersion,
  type RulesConfig,
  type TemplateConfig,
  type TemplateVisibility,
} from './config';
import type { AppData } from './store';

export type UpdateDraftResult = { ok: true; doc: ConfigDoc } | { ok: false; error: 'DOC_NOT_FOUND' } | { ok: false; error: 'VALIDATION_FAILED'; issues: ConfigIssue[] };
export type PublishResult =
  | { ok: true; doc: ConfigDoc; publishedVersionId: string }
  | { ok: false; error: 'DOC_NOT_FOUND' }
  | { ok: false; error: 'NO_DRAFT' }
  | { ok: false; error: 'VALIDATION_FAILED'; issues: ConfigIssue[] };
export type RollbackResult =
  | { ok: true; doc: ConfigDoc; publishedVersionId: string }
  | { ok: false; error: 'DOC_NOT_FOUND' }
  | { ok: false; error: 'VERSION_NOT_FOUND' }
  | { ok: false; error: 'VALIDATION_FAILED'; issues: ConfigIssue[] };

export function validateConfigByKind(kind: ConfigKind, data: unknown) {
  if (kind === 'rules') return validateRulesConfig(data);
  if (kind === 'board') return validateBoardConfig(data);
  if (kind === 'template') return validateTemplateConfig(data);
  return validateCardsConfig(data);
}

export function getDraftData<T = unknown>(doc: ConfigDoc): T | null {
  const v = doc.versions[doc.draftVersionId];
  return v ? (v.data as T) : null;
}

export function getPublishedData<T = unknown>(doc: ConfigDoc): T | null {
  if (!doc.publishedVersionId) return null;
  const v = doc.versions[doc.publishedVersionId];
  return v ? (v.data as T) : null;
}

function isPublishedVersionId(data: AppData, kind: Exclude<ConfigKind, 'template'>, versionId: string) {
  return Object.values(data.configDocs).some((d) => d.kind === kind && d.publishedVersionId === versionId);
}

export function resolveTemplateByPublishedVersionId(data: AppData, versionId: string): TemplateConfig | null {
  const doc = Object.values(data.configDocs).find((d) => d.kind === 'template' && d.publishedVersionId === versionId) ?? null;
  if (!doc?.publishedVersionId) return null;
  const payload = doc.versions[doc.publishedVersionId]?.data ?? null;
  const vr = validateTemplateConfig(payload);
  if (!vr.ok) return null;
  if (!isPublishedVersionId(data, 'rules', vr.value.rulesVersionId)) return null;
  if (!isPublishedVersionId(data, 'board', vr.value.boardVersionId)) return null;
  if (!isPublishedVersionId(data, 'cards', vr.value.cardsVersionId)) return null;
  return vr.value;
}

export function resolveTemplateDocByPublishedVersionId(data: AppData, versionId: string): ConfigDoc | null {
  return Object.values(data.configDocs).find((d) => d.kind === 'template' && d.publishedVersionId === versionId) ?? null;
}

export function effectiveTemplateVisibility(doc: ConfigDoc): TemplateVisibility {
  return doc.visibility === 'private' || doc.visibility === 'public' ? doc.visibility : 'public';
}

export function canViewTemplate(doc: ConfigDoc, uid?: string | null) {
  if (doc.kind !== 'template') return true;
  if (effectiveTemplateVisibility(doc) === 'public') return true;
  if (!uid) return false;
  return doc.ownerId === uid;
}

export function canEditTemplate(doc: ConfigDoc, uid?: string | null) {
  if (doc.kind !== 'template') return true;
  if (!uid) return false;
  return doc.ownerId === uid;
}

function validateTemplateRefs(data: AppData, input: TemplateConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (!isPublishedVersionId(data, 'rules', input.rulesVersionId)) issues.push({ path: 'rulesVersionId', message: 'rulesVersionId 必须为已发布版本' });
  if (!isPublishedVersionId(data, 'board', input.boardVersionId)) issues.push({ path: 'boardVersionId', message: 'boardVersionId 必须为已发布版本' });
  if (!isPublishedVersionId(data, 'cards', input.cardsVersionId)) issues.push({ path: 'cardsVersionId', message: 'cardsVersionId 必须为已发布版本' });
  return issues;
}

const systemDefaultTemplateDocId = 'system:template-standard';
const legacyDefaultTemplateDocId = 'builtin:template-standard';

export function ensureSeedConfigs(data: AppData, nowMs: number) {
  const hasPublished = (kind: ConfigKind) =>
    Object.values(data.configDocs).some((d) => d.kind === kind && d.publishedVersionId);

  const ensureOne = (kind: ConfigKind, name: string, draftData: unknown) => {
    if (hasPublished(kind)) return;
    const docId = `builtin:${kind}`;
    if (!data.configDocs[docId]) data.configDocs[docId] = createDoc({ docId, kind, name, nowMs, draftData });
    publishDoc(data, data.configDocs[docId]!, nowMs, 'seed');
  };

  ensureOne('rules', '默认规则', defaultRulesConfig());
  ensureOne('board', '默认棋盘', defaultBoardConfig());
  ensureOne('cards', '默认卡牌', defaultCardsConfig());

  {
    const docId = 'builtin:board-full';
    const existing = data.configDocs[docId];
    if (!existing) data.configDocs[docId] = createDoc({ docId, kind: 'board', name: '标准 40 格（测试）', nowMs, draftData: fullBoardConfig() });
    if (!data.configDocs[docId]!.publishedVersionId) publishDoc(data, data.configDocs[docId]!, nowMs, 'seed');
  }

  {
    const legacy = data.configDocs[legacyDefaultTemplateDocId];
    if (legacy?.publishedVersionId) return;

    const docId = systemDefaultTemplateDocId;
    const existing = data.configDocs[docId];
    if (!existing) {
      const rulesVersionId = resolvePublishedVersionId(data, 'rules') ?? '';
      const boardVersionId =
        Object.values(data.configDocs).find((d) => d.kind === 'board' && d.docId === 'builtin:board-full')?.publishedVersionId ??
        resolvePublishedVersionId(data, 'board') ??
        '';
      const cardsVersionId = resolvePublishedVersionId(data, 'cards') ?? '';
      data.configDocs[docId] = createDoc({
        docId,
        kind: 'template',
        name: '标准玩法（系统）',
        nowMs,
        draftData: { rulesVersionId, boardVersionId, cardsVersionId },
      });
    }
    if (!data.configDocs[docId]!.publishedVersionId) publishDoc(data, data.configDocs[docId]!, nowMs, 'seed');
  }
}

export function listDocs(data: AppData, kind?: ConfigKind) {
  return Object.values(data.configDocs)
    .filter((d) => (kind ? d.kind === kind : true))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

function defaultTemplateDraftData(data: AppData) {
  const rulesVersionId = resolvePublishedVersionId(data, 'rules') ?? '';
  const boardVersionId =
    Object.values(data.configDocs).find((d) => d.kind === 'board' && d.docId === 'builtin:board-full')?.publishedVersionId ??
    resolvePublishedVersionId(data, 'board') ??
    '';
  const cardsVersionId = resolvePublishedVersionId(data, 'cards') ?? '';
  return { rulesVersionId, boardVersionId, cardsVersionId };
}

export function createNewDoc(data: AppData, input: { kind: ConfigKind; name: string; nowMs: number; ownerId?: string | null }): ConfigDoc {
  const docId = crypto.randomUUID();
  const draftData =
    input.kind === 'rules'
      ? defaultRulesConfig()
      : input.kind === 'board'
        ? defaultBoardConfig()
        : input.kind === 'cards'
          ? defaultCardsConfig()
          : defaultTemplateDraftData(data);
  const doc = createDoc({
    docId,
    kind: input.kind,
    name: input.name,
    ...(input.kind === 'template' ? { ownerId: input.ownerId ?? null, visibility: 'private' as const } : {}),
    nowMs: input.nowMs,
    draftData,
  });
  data.configDocs[docId] = doc;
  return doc;
}

export function updateDraft(data: AppData, input: { docId: string; nowMs: number; draftData: unknown }): UpdateDraftResult {
  const doc = data.configDocs[input.docId];
  if (!doc) return { ok: false, error: 'DOC_NOT_FOUND' };
  const draft = doc.versions[doc.draftVersionId];
  if (!draft) return { ok: false, error: 'DOC_NOT_FOUND' };

  const vr = validateConfigByKind(doc.kind, input.draftData);
  if (!vr.ok) return { ok: false, error: 'VALIDATION_FAILED', issues: vr.issues };

  if (doc.kind === 'template') {
    const refIssues = validateTemplateRefs(data, vr.value as TemplateConfig);
    if (refIssues.length) return { ok: false, error: 'VALIDATION_FAILED', issues: refIssues };
  }

  draft.data = vr.value;
  draft.updatedAtMs = input.nowMs;
  doc.updatedAtMs = input.nowMs;
  return { ok: true, doc };
}

function allocVersionId(nowMs: number) {
  return `v${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
}

export function publishDoc(data: AppData, doc: ConfigDoc, nowMs: number, note?: string): PublishResult {
  const draft = doc.versions[doc.draftVersionId];
  if (!draft) return { ok: false, error: 'NO_DRAFT' };

  const vr = validateConfigByKind(doc.kind, draft.data);
  if (!vr.ok) return { ok: false, error: 'VALIDATION_FAILED', issues: vr.issues };

  if (doc.kind === 'template') {
    const refIssues = validateTemplateRefs(data, vr.value as TemplateConfig);
    if (refIssues.length) return { ok: false, error: 'VALIDATION_FAILED', issues: refIssues };
  }

  if (doc.publishedVersionId && doc.versions[doc.publishedVersionId]) {
    doc.versions[doc.publishedVersionId]!.status = 'archived';
    doc.versions[doc.publishedVersionId]!.updatedAtMs = nowMs;
  }

  const versionId = allocVersionId(nowMs);
  const v: ConfigVersion = {
    versionId,
    status: 'published',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    data: vr.value,
    ...(draft.versionId ? { baseVersionId: draft.versionId } : {}),
    ...(note ? { note } : {}),
  };
  doc.versions[versionId] = v;
  doc.versionIds.push(versionId);
  doc.publishedVersionId = versionId;
  doc.updatedAtMs = nowMs;
  return { ok: true, doc, publishedVersionId: versionId };
}

export function publishByDocId(data: AppData, input: { docId: string; nowMs: number; note?: string }): PublishResult {
  const doc = data.configDocs[input.docId];
  if (!doc) return { ok: false, error: 'DOC_NOT_FOUND' };
  return publishDoc(data, doc, input.nowMs, input.note);
}

export function rollbackByDocId(data: AppData, input: { docId: string; targetVersionId: string; nowMs: number; note?: string }): RollbackResult {
  const doc = data.configDocs[input.docId];
  if (!doc) return { ok: false, error: 'DOC_NOT_FOUND' };
  const target = doc.versions[input.targetVersionId];
  if (!target) return { ok: false, error: 'VERSION_NOT_FOUND' };

  if (doc.kind === 'template') {
    const vr = validateTemplateConfig(target.data);
    if (!vr.ok) return { ok: false, error: 'VALIDATION_FAILED', issues: vr.issues };
    const refIssues = validateTemplateRefs(data, vr.value);
    if (refIssues.length) return { ok: false, error: 'VALIDATION_FAILED', issues: refIssues };
  }

  if (doc.publishedVersionId && doc.versions[doc.publishedVersionId]) {
    doc.versions[doc.publishedVersionId]!.status = 'archived';
    doc.versions[doc.publishedVersionId]!.updatedAtMs = input.nowMs;
  }

  const versionId = allocVersionId(input.nowMs);
  const v: ConfigVersion = {
    versionId,
    status: 'published',
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    data: target.data,
    baseVersionId: target.versionId,
    note: input.note ? `rollback:${input.note}` : `rollback:${target.versionId}`,
  };
  doc.versions[versionId] = v;
  doc.versionIds.push(versionId);
  doc.publishedVersionId = versionId;
  doc.updatedAtMs = input.nowMs;
  return { ok: true, doc, publishedVersionId: versionId };
}

export function resolvePublishedVersionId(data: AppData, kind: ConfigKind, preferred?: string | undefined): string | null {
  const candidates = listDocs(data, kind).filter((d) => d.publishedVersionId);
  if (preferred) {
    const hit = candidates.find((d) => d.publishedVersionId === preferred);
    if (hit?.publishedVersionId) return hit.publishedVersionId;
  }
  return candidates[0]?.publishedVersionId ?? null;
}

export function resolvePublishedPayload(data: AppData, kind: 'rules'): RulesConfig | null;
export function resolvePublishedPayload(data: AppData, kind: 'board'): BoardConfigTemplate | null;
export function resolvePublishedPayload(data: AppData, kind: 'cards'): CardsConfig | null;
export function resolvePublishedPayload(data: AppData, kind: ConfigKind) {
  const candidates = listDocs(data, kind).filter((d) => d.publishedVersionId);
  const doc = candidates[0] ?? null;
  if (!doc?.publishedVersionId) return null;
  return doc.versions[doc.publishedVersionId]?.data ?? null;
}
