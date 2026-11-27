import type { HandoffDetail, HandoffListItem, HandoffStatus, HandoffUrgency, Paginated } from "@cergo/contracts";
import {
  and,
  desc,
  eq,
  handoffComments,
  handoffs,
  inArray,
  lt,
  or,
  sql,
  users,
  type DbOrTx,
  type Tx,
} from "@cergo/db";
import { alias } from "@cergo/db";
import { audit } from "../audit";
import { AppError } from "../errors";
import { enqueue } from "../queue/queue";
import { decodeCursor, encodeCursor } from "../pagination";

const assignee = alias(users, "assignee");
const resolver = alias(users, "resolver");

const listSelect = {
  id: handoffs.id,
  createdAt: handoffs.createdAt,
  guestName: handoffs.guestName,
  guestPhone: handoffs.guestPhone,
  reason: handoffs.reason,
  summary: handoffs.summary,
  urgency: handoffs.urgency,
  status: handoffs.status,
  callId: handoffs.callId,
  notifiedAt: handoffs.notifiedAt,
  assignedId: assignee.id,
  assignedName: assignee.name,
  assignedEmail: assignee.email,
};

type ListRow = {
  id: string;
  createdAt: Date;
  guestName: string | null;
  guestPhone: string | null;
  reason: string;
  summary: string | null;
  urgency: HandoffUrgency;
  status: HandoffStatus;
  callId: string | null;
  notifiedAt: Date | null;
  assignedId: string | null;
  assignedName: string | null;
  assignedEmail: string | null;
};

const toItem = (r: ListRow): HandoffListItem => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  guestName: r.guestName,
  guestPhone: r.guestPhone,
  reason: r.reason,
  summary: r.summary,
  urgency: r.urgency,
  status: r.status,
  callId: r.callId,
  notifiedAt: r.notifiedAt?.toISOString() ?? null,
  assignedTo: r.assignedId ? { id: r.assignedId, name: r.assignedName || r.assignedEmail || "" } : null,
});

export async function listHandoffs(
  tx: DbOrTx,
  hotelId: string,
  q: { status: HandoffStatus | "open" | "all"; limit: number; cursor?: string },
): Promise<Paginated<HandoffListItem>> {
  const conds = [eq(handoffs.hotelId, hotelId)];
  if (q.status === "open") conds.push(inArray(handoffs.status, ["new", "in_progress"]));
  else if (q.status !== "all") conds.push(eq(handoffs.status, q.status));
  const cur = decodeCursor(q.cursor);
  if (cur) {
    conds.push(or(lt(handoffs.createdAt, cur.at), and(eq(handoffs.createdAt, cur.at), lt(handoffs.id, cur.id)))!);
  }
  const rows = await tx
    .select(listSelect)
    .from(handoffs)
    .leftJoin(assignee, eq(assignee.id, handoffs.assignedTo))
    .where(and(...conds))
    // Emergencias y urgentes primero cuando se miran los abiertos.
    .orderBy(
      ...(q.status === "open" ? [sql`case ${handoffs.urgency} when 'emergency' then 0 when 'high' then 1 else 2 end`] : []),
      desc(handoffs.createdAt),
      desc(handoffs.id),
    )
    .limit(q.limit + 1);
  const items = rows.slice(0, q.limit).map(toItem);
  const last = rows.length > q.limit ? rows[q.limit - 1] : undefined;
  return { items, nextCursor: last && q.status !== "open" ? encodeCursor(last.createdAt, last.id) : null };
}

export async function getHandoff(tx: DbOrTx, hotelId: string, id: string): Promise<HandoffDetail> {
  const [row] = await tx
    .select({ ...listSelect, resolvedAt: handoffs.resolvedAt, resolverId: resolver.id, resolverName: resolver.name })
    .from(handoffs)
    .leftJoin(assignee, eq(assignee.id, handoffs.assignedTo))
    .leftJoin(resolver, eq(resolver.id, handoffs.resolvedBy))
    .where(and(eq(handoffs.id, id), eq(handoffs.hotelId, hotelId)))
    .limit(1);
  if (!row) throw new AppError("not_found", "Pendiente no encontrado");
  const comments = await tx
    .select({ id: handoffComments.id, body: handoffComments.body, createdAt: handoffComments.createdAt, userId: users.id, userName: users.name, userEmail: users.email })
    .from(handoffComments)
    .leftJoin(users, eq(users.id, handoffComments.userId))
    .where(eq(handoffComments.handoffId, id))
    .orderBy(handoffComments.createdAt);
  return {
    ...toItem(row),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolverId ? { id: row.resolverId, name: row.resolverName ?? "" } : null,
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      user: c.userId ? { id: c.userId, name: c.userName || c.userEmail || "" } : null,
    })),
  };
}

export async function updateHandoff(
  tx: Tx,
  hotelId: string,
  id: string,
  input: { status?: HandoffStatus; assignedTo?: string | null },
  actor: { userId: string; ip?: string | null; viaStaff?: boolean },
): Promise<HandoffDetail> {
  const [before] = await tx.select().from(handoffs).where(and(eq(handoffs.id, id), eq(handoffs.hotelId, hotelId))).limit(1);
  if (!before) throw new AppError("not_found", "Pendiente no encontrado");
  const patch: Partial<typeof handoffs.$inferInsert> = {};
  if (input.assignedTo !== undefined) patch.assignedTo = input.assignedTo;
  if (input.status) {
    patch.status = input.status;
    if (input.status === "resolved") {
      patch.resolvedAt = new Date();
      patch.resolvedBy = actor.userId;
    } else {
      patch.resolvedAt = null;
      patch.resolvedBy = null;
    }
    // Tomar un pendiente nuevo lo asigna a quien lo toma, si nadie lo tenía.
    if (input.status === "in_progress" && !before.assignedTo && input.assignedTo === undefined) patch.assignedTo = actor.userId;
  }
  if (Object.keys(patch).length) {
    await tx.update(handoffs).set(patch).where(eq(handoffs.id, id));
    await audit(tx, {
      organizationId: hotelId,
      actorUserId: actor.userId,
      action: "handoff.update",
      targetType: "handoff",
      targetId: id,
      before: { status: before.status, assignedTo: before.assignedTo },
      after: { status: patch.status ?? before.status, assignedTo: patch.assignedTo ?? before.assignedTo },
      ip: actor.ip,
      viaStaff: actor.viaStaff,
    });
  }
  return getHandoff(tx, hotelId, id);
}

export async function addHandoffComment(
  tx: Tx,
  hotelId: string,
  id: string,
  body: string,
  actor: { userId: string },
): Promise<HandoffDetail> {
  const [h] = await tx.select({ id: handoffs.id }).from(handoffs).where(and(eq(handoffs.id, id), eq(handoffs.hotelId, hotelId))).limit(1);
  if (!h) throw new AppError("not_found", "Pendiente no encontrado");
  await tx.insert(handoffComments).values({ handoffId: id, hotelId, userId: actor.userId, body });
  return getHandoff(tx, hotelId, id);
}

/** Lo crea el agente (server tool) durante la llamada. El aviso a recepción sale por la cola. */
export async function createHandoffFromAgent(
  tx: Tx,
  hotelId: string,
  input: {
    conversationId?: string;
    guestName?: string;
    guestPhone?: string;
    reason: string;
    summary?: string;
    urgency: HandoffUrgency;
  },
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(handoffs)
    .values({
      hotelId,
      conversationId: input.conversationId ?? null,
      guestName: input.guestName ?? null,
      guestPhone: input.guestPhone ?? null,
      reason: input.reason,
      summary: input.summary ?? null,
      urgency: input.urgency,
    })
    .returning({ id: handoffs.id });
  if (!row) throw new AppError("internal", "No se pudo crear el pendiente");
  await enqueue(tx, {
    queue: "notify.handoff",
    hotelId,
    payload: { handoffId: row.id },
    dedupeKey: `notify.handoff:${row.id}`,
  });
  return row;
}

export async function countOpenHandoffs(tx: DbOrTx, hotelId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(handoffs)
    .where(and(eq(handoffs.hotelId, hotelId), inArray(handoffs.status, ["new", "in_progress"])));
  return row?.n ?? 0;
}

export async function listHandoffsForCall(tx: DbOrTx, hotelId: string, callId: string): Promise<HandoffListItem[]> {
  const rows = await tx
    .select(listSelect)
    .from(handoffs)
    .leftJoin(assignee, eq(assignee.id, handoffs.assignedTo))
    .where(and(eq(handoffs.hotelId, hotelId), eq(handoffs.callId, callId)))
    .orderBy(desc(handoffs.createdAt));
  return rows.map(toItem);
}
