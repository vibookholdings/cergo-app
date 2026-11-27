import { auditLog, type DbOrTx } from "@cergo/db";

export type AuditEntry = {
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  viaStaff?: boolean;
};

/** Registro de auditoría: quién hizo qué, con el antes y el después. */
export async function audit(tx: DbOrTx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    organizationId: entry.organizationId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
    viaStaff: entry.viaStaff ?? false,
  });
}
