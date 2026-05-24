import crypto from "node:crypto";

import type { AppData, AuditEntry } from "./store";

export function appendAudit(
  data: AppData,
  input: Omit<AuditEntry, "id" | "atMs"> & { id?: string; atMs?: number },
) {
  const entry: AuditEntry = {
    id: input.id ?? crypto.randomUUID(),
    atMs: input.atMs ?? Date.now(),
    actorUid: input.actorUid,
    action: input.action,
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(typeof input.detail === "undefined" ? {} : { detail: input.detail }),
  };

  data.audit.push(entry);
  if (data.audit.length > 5000)
    data.audit = data.audit.slice(data.audit.length - 5000);
  return entry;
}
