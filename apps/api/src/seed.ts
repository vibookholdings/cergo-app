/**
 * Datos de demostración: Hotel Casa del Lago (ficticio) con 30 días de llamadas, pendientes y
 * reservas, más tres usuarios (dueña, recepción y equipo CERGO). Es idempotente: si el hotel ya
 * existe no hace nada, salvo con SEED_RESET=true.
 *
 * Variables: DATABASE_URL, SEED_PASSWORD (contraseña de los tres usuarios; sin ella entran por
 * enlace mágico), SEED_OWNER_EMAIL, SEED_RECEPTION_EMAIL, SEED_STAFF_EMAIL, SEED_ELEVENLABS_AGENT_ID.
 */
import {
  addDays,
  casaDelLagoConfig,
  compileAgent,
  createLogger,
  hashPassword,
  localDay,
  newToolToken,
  recomputeDailyStats,
  sha256,
} from "@cergo/core";
import type { CallOutcome, CallReason } from "@cergo/contracts";
import {
  agentConfigVersions,
  agents,
  bookings,
  callMessages,
  calls,
  createDb,
  eq,
  handoffs,
  memberships,
  organizations,
  phoneLines,
  users,
  type Db,
} from "@cergo/db";

const log = createLogger("seed");
const TZ = "America/Argentina/Buenos_Aires";
const SLUG = "hotel-casa-del-lago";

/** Generador pseudoaleatorio con semilla: los datos de demo salen siempre iguales. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, weighted: [T, number][]): T {
  const total = weighted.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  for (const [v, w] of weighted) {
    x -= w;
    if (x <= 0) return v;
  }
  return weighted[weighted.length - 1]![0];
}

const names = ["Laura Pérez", "Martín Gómez", "Sofía Díaz", "Juan Ibarra", "Carla Méndez", "Diego Romero", "Paula Sosa", "Nicolás Funes", "Ana Torres", "Bruno Paz", "Emily Carter", "João Silva"];
const rooms = ["Doble Estándar", "Doble Superior", "Triple Superior", "Suite Lago", "Cabaña Familiar"];
const rates: Record<string, number> = { "Doble Estándar": 110, "Doble Superior": 140, "Triple Superior": 170, "Suite Lago": 220, "Cabaña Familiar": 260 };

/** Diálogos de demo: alternan huésped y agente, empezando por el huésped (el saludo va antes). */
type Script = { dialog: string[]; summary: string; room?: string };
const scripts: Record<CallReason, Script[]> = {
  reservation: [
    {
      room: "Doble Estándar",
      summary: "Consultó tarifa de habitación doble para fin de semana largo.",
      dialog: [
        "Hola, quería saber cuánto sale una doble para el fin de semana largo.",
        "¡Hola! Con gusto. ¿Para cuántas personas y qué noches serían?",
        "Somos dos adultos, del viernes al lunes.",
        "Tengo la Doble Estándar con vista al jardín. Te paso el total de referencia en dólares, con desayuno incluido. ¿Querés que te la deje registrada?",
        "Dale, ¿me la podés dejar reservada?",
        "Listo, quedó registrada. Recepción te la confirma por WhatsApp en el día. ¡Gracias por llamar!",
      ],
    },
    {
      room: "Cabaña Familiar",
      summary: "Pidió cotización para familia de cuatro en enero; se ofreció la Cabaña Familiar.",
      dialog: [
        "Buenas, ¿tienen lugar para cuatro personas en enero?",
        "¡Hola! Sí, para cuatro la mejor opción es la Cabaña Familiar. ¿Son todos adultos o hay chicos?",
        "Dos adultos y dos chicos, una semana.",
        "Perfecto. Te paso el total de referencia por las noches que me dijiste; incluye desayuno y estacionamiento.",
        "Perfecto, después lo confirmo.",
        "Dale, te dejo la cotización registrada. Cuando quieras confirmar, nos llamás. ¡Gracias!",
      ],
    },
  ],
  inquiry: [
    {
      summary: "Preguntó horario de check-in y guarda de equipaje.",
      dialog: [
        "Hola, ¿a qué hora es el check-in?",
        "El check-in es desde las 15 y el check-out hasta las 11.",
        "¿Y puedo dejar las valijas antes?",
        "Sí, claro, te las guardamos en recepción sin costo.",
        "Genial, gracias.",
        "¡De nada! Te esperamos.",
      ],
    },
    {
      summary: "Consultó por mascotas; se aceptan en Cabañas Familiares.",
      dialog: [
        "¿Aceptan mascotas?",
        "Sí, aceptamos mascotas chicas en las Cabañas Familiares, con aviso previo.",
        "Es un perro chico.",
        "Perfecto, entonces no hay problema. Avisanos cuando reserves.",
        "Buenísimo.",
        "¡Gracias por llamar!",
      ],
    },
    {
      summary: "Consultó estacionamiento y carga de auto eléctrico.",
      dialog: [
        "¿Tienen estacionamiento?",
        "Sí, tenemos estacionamiento cubierto sin cargo para huéspedes.",
        "¿Y cargador para auto eléctrico?",
        "Sí, hay un cargador en el estacionamiento. Conviene avisar en el check-in.",
        "Gracias.",
        "¡A vos!",
      ],
    },
  ],
  change: [
    {
      summary: "Quiere cambiar fechas de una reserva existente; se derivó a recepción.",
      dialog: [
        "Hola, tengo una reserva y necesito cambiar las fechas.",
        "Claro. ¿A nombre de quién está la reserva?",
        "Está a nombre de Gómez.",
        "Gracias. Los cambios de fecha los confirma recepción: les paso el pedido y te llaman hoy.",
        "Ok, espero el llamado.",
        "Listo, quedó registrado. ¡Gracias!",
      ],
    },
  ],
  complaint: [
    {
      summary: "Reclamo por doble cobro de seña; derivado con urgencia.",
      dialog: [
        "Quería hacer un reclamo por un cobro en la tarjeta.",
        "Lamento el inconveniente. Contame qué pasó así lo paso a recepción.",
        "Me cobraron dos veces la seña.",
        "Entiendo. Lo marco como urgente para que administración lo revise hoy mismo.",
        "Por favor que me llamen hoy.",
        "Sí, te llaman hoy. Disculpá la molestia.",
      ],
    },
  ],
  other: [
    {
      summary: "Llamado comercial para gerencia.",
      dialog: [
        "Hola, ¿con quién hablo?",
        "Te habla el asistente de recepción del Hotel Casa del Lago. ¿En qué te puedo ayudar?",
        "Quería hablar con el gerente por un tema comercial.",
        "Te tomo los datos y le paso el mensaje a gerencia para que te contacte.",
        "Bueno, gracias.",
        "¡Gracias a vos!",
      ],
    },
  ],
};

async function ensureUser(db: Db, email: string, name: string, password: string | undefined, isStaff = false) {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing.id;
  const [u] = await db
    .insert(users)
    .values({ email, name, isStaff, passwordHash: password ? await hashPassword(password) : null })
    .returning({ id: users.id });
  return u!.id;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const { db, close } = createDb(url, { max: 2, applicationName: "cergo-seed" });
  try {
    const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, SLUG)).limit(1);
    if (existing && process.env.SEED_RESET !== "true") {
      log.info({ hotelId: existing.id }, "La demo ya existe; no hago nada (SEED_RESET=true para recrearla)");
      return;
    }
    if (existing) await db.delete(organizations).where(eq(organizations.id, existing.id));

    const password = process.env.SEED_PASSWORD || undefined;
    if (password && password.length < 10) throw new Error("SEED_PASSWORD tiene que tener al menos 10 caracteres");
    const ownerId = await ensureUser(db, (process.env.SEED_OWNER_EMAIL ?? "duena@casadellago.example").toLowerCase(), "Dueña de Casa del Lago", password);
    const receptionId = await ensureUser(db, (process.env.SEED_RECEPTION_EMAIL ?? "recepcion@casadellago.example").toLowerCase(), "Recepción", password);
    const staffId = await ensureUser(db, (process.env.SEED_STAFF_EMAIL ?? "equipo@cergo.example").toLowerCase(), "Equipo CERGO", password, true);

    const config = casaDelLagoConfig();
    const compiled = compileAgent(config);
    const hotelId = await db.transaction(async (tx) => {
      const [hotel] = await tx
        .insert(organizations)
        .values({
          name: config.hotel.name,
          slug: SLUG,
          city: "Bariloche",
          timezone: TZ,
          status: "trial",
          plan: "profesional",
          monthlyMinutes: 1200,
          settings: { notifyEmails: [], retentionMonths: 12, allowNonOwnersToDraft: false, receptionHours: config.receptionHours },
        })
        .returning({ id: organizations.id });
      const hotelId = hotel!.id;
      const token = newToolToken();
      const [agent] = await tx
        .insert(agents)
        .values({
          hotelId,
          elevenlabsAgentId: process.env.SEED_ELEVENLABS_AGENT_ID || null,
          toolTokenHash: sha256(token),
          toolTokenHint: token.slice(-4),
        })
        .returning({ id: agents.id });
      const [version] = await tx
        .insert(agentConfigVersions)
        .values({
          agentId: agent!.id,
          hotelId,
          version: 1,
          status: "published",
          config: config as unknown as Record<string, unknown>,
          compiledPrompt: compiled.prompt,
          firstMessage: compiled.firstMessage,
          baseLayerVersion: compiled.baseLayerVersion,
          notes: "Configuración inicial de la demo",
          createdBy: staffId,
          publishedBy: staffId,
          publishedAt: new Date(),
        })
        .returning({ id: agentConfigVersions.id });
      await tx.update(agents).set({ publishedVersionId: version!.id }).where(eq(agents.id, agent!.id));
      await tx.insert(phoneLines).values({ hotelId, number: "+54 294 400-0000", provider: "twilio", forwarding: "no_answer" });
      await tx.insert(memberships).values([
        { userId: ownerId, organizationId: hotelId, role: "owner" },
        { userId: receptionId, organizationId: hotelId, role: "reception" },
      ]);

      // 30 días de actividad
      const r = rng(20261127);
      const today = localDay(new Date(), TZ);
      for (let d = 29; d >= 0; d--) {
        const day = addDays(today, -d);
        const count = 4 + Math.floor(r() * 10);
        for (let i = 0; i < count; i++) {
          const hour = 8 + Math.floor(r() * 15);
          const minute = Math.floor(r() * 60);
          const startedAt = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
          if (startedAt > new Date()) continue;
          const reason = pick<CallReason>(r, [["reservation", 45], ["inquiry", 35], ["change", 8], ["complaint", 5], ["other", 7]]);
          const outcome = pick<CallOutcome>(
            r,
            reason === "reservation"
              ? [["quote", 40], ["booking", 20], ["resolved", 25], ["handed_off", 15]]
              : reason === "inquiry"
                ? [["resolved", 85], ["handed_off", 15]]
                : reason === "change"
                  ? [["handed_off", 70], ["resolved", 30]]
                  : reason === "complaint"
                    ? [["handed_off", 1]]
                    : [["resolved", 60], ["unresolved", 20], ["handed_off", 20]],
          );
          const language = pick(r, [["es", 85], ["en", 10], ["pt", 5]]);
          const script = scripts[reason][Math.floor(r() * scripts[reason].length)]!;
          const guestName = names[Math.floor(r() * names.length)]!;
          const phone = `+54 9 11 ${String(1000 + Math.floor(r() * 8999))}-${String(1000 + Math.floor(r() * 8999))}`;
          const durationSecs = 40 + Math.floor(r() * 300);
          const conversationId = `demo_${day.replaceAll("-", "")}_${i}`;
          const [call] = await tx
            .insert(calls)
            .values({
              hotelId,
              agentId: agent!.id,
              conversationId,
              callerNumber: phone,
              startedAt,
              durationSecs,
              language,
              reason,
              outcome,
              summary: script.summary,
              handedOff: outcome === "handed_off",
              afterHours: false,
              costUsd: ((durationSecs / 60) * 0.12).toFixed(4),
            })
            .returning({ id: calls.id });
          const turns = [{ role: "agent", text: compiled.firstMessage }, ...script.dialog.map((text, n) => ({ role: n % 2 === 0 ? "user" : "agent", text }))];
          let at = 0;
          await tx.insert(callMessages).values(
            turns.map((t, seq) => {
              const timeSecs = at;
              at += 4 + Math.round(t.text.length / 14);
              return { callId: call!.id, hotelId, seq, role: t.role, text: t.text, timeSecs };
            }),
          );

          if (outcome === "handed_off") {
            const recent = d <= 1;
            await tx.insert(handoffs).values({
              hotelId,
              callId: call!.id,
              conversationId,
              guestName,
              guestPhone: phone,
              reason: script.summary.split(";")[0]!,
              summary: script.summary,
              urgency: reason === "complaint" ? "high" : "normal",
              status: recent ? (r() < 0.5 ? "new" : "in_progress") : "resolved",
              assignedTo: recent ? null : receptionId,
              resolvedBy: recent ? null : receptionId,
              resolvedAt: recent ? null : new Date(startedAt.getTime() + 3600_000),
              notifiedAt: startedAt,
              createdAt: startedAt,
            });
          }
          if (outcome === "quote" || outcome === "booking") {
            const room = script.room ?? rooms[Math.floor(r() * rooms.length)]!;
            const checkIn = addDays(day, 7 + Math.floor(r() * 60));
            const nights = 2 + Math.floor(r() * 5);
            const total = rates[room]! * nights;
            await tx.insert(bookings).values({
              hotelId,
              callId: call!.id,
              conversationId,
              kind: outcome === "booking" ? "booking" : "quote",
              status: outcome === "booking" ? (d <= 2 ? "pending" : pick(r, [["confirmed", 50], ["paid", 40], ["lost", 10]])) : "quoted",
              guestName: outcome === "booking" ? guestName : null,
              guestPhone: outcome === "booking" ? phone : null,
              checkIn,
              checkOut: addDays(checkIn, nights),
              nights,
              adults: 2,
              children: room === "Cabaña Familiar" ? 2 : 0,
              roomType: room,
              totalUsd: total.toFixed(2),
              notifiedAt: startedAt,
              createdAt: startedAt,
            });
          }
        }
        await recomputeDailyStats(tx, hotelId, day, TZ);
      }
      return hotelId;
    });
    log.info({ hotelId, conPassword: Boolean(password) }, "Demo de Casa del Lago creada");
  } finally {
    await close();
  }
}

main().catch((err) => {
  log.error({ err }, "Falló el seed");
  process.exit(1);
});
