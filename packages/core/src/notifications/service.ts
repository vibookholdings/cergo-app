import { and, bookings, eq, handoffs, memberships, organizations, users, type Db } from "@cergo/db";
import type { Deps } from "../deps";
import { handoffWhatsappText, templates } from "./templates";

/** Destinatarios de los avisos de un hotel: los mails de ajustes más los miembros que los piden. */
export async function notificationRecipients(db: Db, hotelId: string, roles: string[]): Promise<string[]> {
  const [hotel] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, hotelId)).limit(1);
  const members = await db
    .select({ email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, hotelId), eq(memberships.notifyByEmail, true)));
  const list = [
    ...(hotel?.settings?.notifyEmails ?? []),
    ...members.filter((m) => roles.includes(m.role)).map((m) => m.email),
  ];
  return [...new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** Trabajo `notify.handoff`: mail (y WhatsApp si está configurado) a recepción. Idempotente. */
export async function notifyHandoff(deps: Deps, handoffId: string): Promise<void> {
  const [row] = await deps.db
    .select({ handoff: handoffs, hotelName: organizations.name, settings: organizations.settings })
    .from(handoffs)
    .innerJoin(organizations, eq(organizations.id, handoffs.hotelId))
    .where(eq(handoffs.id, handoffId))
    .limit(1);
  if (!row || row.handoff.notifiedAt) return;
  const h = row.handoff;
  const url = `${deps.config.appUrl}/h/${h.hotelId}/pendientes/${h.id}`;
  const to = await notificationRecipients(deps.db, h.hotelId, ["owner", "reception"]);
  if (to.length) {
    await deps.mailer.send(
      templates.handoff(to, {
        hotelName: row.hotelName,
        guestName: h.guestName,
        guestPhone: h.guestPhone,
        reason: h.reason,
        summary: h.summary,
        urgency: h.urgency,
        url,
      }),
    );
  }
  const whatsapp = row.settings?.notifyWhatsapp;
  if (whatsapp) {
    try {
      await deps.whatsapp.send(
        whatsapp,
        handoffWhatsappText({ hotelName: row.hotelName, guestName: h.guestName, guestPhone: h.guestPhone, reason: h.reason, urgency: h.urgency, url }),
      );
    } catch (err) {
      // El mail ya salió: un WhatsApp caído no debe reenviar el mail en cada reintento.
      deps.log.warn({ err, handoffId }, "No se pudo enviar el WhatsApp del pendiente");
    }
  }
  await deps.db.update(handoffs).set({ notifiedAt: new Date() }).where(eq(handoffs.id, h.id));
}

/** Trabajo `notify.booking`: aviso de reserva nueva a dueños, recepción y ventas. */
export async function notifyBooking(deps: Deps, bookingId: string): Promise<void> {
  const [row] = await deps.db
    .select({ booking: bookings, hotelName: organizations.name })
    .from(bookings)
    .innerJoin(organizations, eq(organizations.id, bookings.hotelId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row || row.booking.notifiedAt) return;
  const b = row.booking;
  const to = await notificationRecipients(deps.db, b.hotelId, ["owner", "reception", "sales"]);
  if (to.length) {
    await deps.mailer.send(
      templates.booking(to, {
        hotelName: row.hotelName,
        guestName: b.guestName,
        guestPhone: b.guestPhone,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        roomType: b.roomType,
        totalUsd: b.totalUsd === null ? null : Number(b.totalUsd),
        url: `${deps.config.appUrl}/h/${b.hotelId}/reservas/${b.id}`,
      }),
    );
  }
  await deps.db.update(bookings).set({ notifiedAt: new Date() }).where(eq(bookings.id, b.id));
}
