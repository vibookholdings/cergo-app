import type { MailMessage } from "@cergo/integrations";

/** Plantillas de mail. Texto plano siempre (llega mejor) y un HTML sobrio con los colores de la marca. */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#234638;color:#F7F5EF;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F7F5EF;font-family:Manrope,Segoe UI,Roboto,Arial,sans-serif;color:#202720">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-family:Georgia,serif;font-size:26px;color:#234638;margin-bottom:20px">CERGO</div>
<div style="background:#FFFFFF;border:1px solid #E2DED2;border-radius:20px;padding:28px">
<h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;margin:0 0 16px">${esc(title)}</h1>
${body}${button}
</div>
<p style="color:#7A8179;font-size:12px;margin-top:18px">Recibiste este mail porque tenés acceso al panel de CERGO.</p>
</div></body></html>`;
}

function mail(to: string[], subject: string, title: string, lines: string[], cta?: { label: string; url: string }): MailMessage {
  const text = [...lines, ...(cta ? ["", `${cta.label}: ${cta.url}`] : [])].join("\n");
  return { to, subject, text, html: layout(title, lines, cta) };
}

export const templates = {
  magicLink(to: string, url: string) {
    return mail([to], "Tu enlace para entrar a CERGO", "Entrá al panel", [
      "Tocá el botón para entrar. El enlace vence en 15 minutos y sirve una sola vez.",
      "Si no lo pediste, ignorá este mail.",
    ], { label: "Entrar a CERGO", url });
  },

  passwordReset(to: string, url: string) {
    return mail([to], "Cambiá tu contraseña de CERGO", "Cambiar contraseña", [
      "Pediste cambiar tu contraseña. El enlace vence en 1 hora.",
      "Si no fuiste vos, ignorá este mail: tu contraseña sigue igual.",
    ], { label: "Elegir contraseña nueva", url });
  },

  invitation(to: string, hotelName: string, roleLabel: string, inviterName: string | null, url: string) {
    return mail([to], `Te invitaron al panel de ${hotelName}`, `Sumate al panel de ${hotelName}`, [
      `${inviterName ?? "El equipo del hotel"} te invitó a usar el panel de CERGO de ${hotelName} como ${roleLabel}.`,
      "Desde ahí vas a ver las llamadas que atiende el agente, los pendientes para recepción y las reservas.",
      "La invitación vence en 7 días.",
    ], { label: "Aceptar invitación", url });
  },

  handoff(
    to: string[],
    data: { hotelName: string; guestName: string | null; guestPhone: string | null; reason: string; summary: string | null; urgency: string; url: string },
  ) {
    const urgent = data.urgency !== "normal";
    const who = data.guestName ?? "Un huésped";
    return mail(
      to,
      `${urgent ? "[URGENTE] " : ""}Pendiente para recepción: ${data.reason}`,
      urgent ? "Pendiente urgente para recepción" : "Nuevo pendiente para recepción",
      [
        `${who} necesita que lo contacte recepción de ${data.hotelName}.`,
        `Motivo: ${data.reason}`,
        ...(data.summary ? [`Resumen: ${data.summary}`] : []),
        `Teléfono: ${data.guestPhone ?? "no lo dejó"}`,
      ],
      { label: "Ver el pendiente", url: data.url },
    );
  },

  booking(
    to: string[],
    data: { hotelName: string; guestName: string | null; guestPhone: string | null; checkIn: string; checkOut: string; roomType: string | null; totalUsd: number | null; url: string },
  ) {
    return mail(to, `Nueva reserva para confirmar: ${data.guestName ?? "huésped"}`, "Reserva cargada por el agente", [
      `El agente dejó cargada una reserva en ${data.hotelName} y espera la confirmación y el link de pago.`,
      `Huésped: ${data.guestName ?? "-"} · ${data.guestPhone ?? "sin teléfono"}`,
      `Fechas: ${data.checkIn} al ${data.checkOut}`,
      `Habitación: ${data.roomType ?? "-"}${data.totalUsd !== null ? ` · USD ${data.totalUsd.toFixed(2)}` : ""}`,
    ], { label: "Ver la reserva", url: data.url });
  },
};

export function handoffWhatsappText(data: {
  hotelName: string;
  guestName: string | null;
  guestPhone: string | null;
  reason: string;
  urgency: string;
  url: string;
}): string {
  const head = data.urgency === "emergency" ? "EMERGENCIA" : data.urgency === "high" ? "URGENTE" : "Pendiente";
  return `${head} · ${data.hotelName}\n${data.guestName ?? "Huésped"} (${data.guestPhone ?? "sin teléfono"})\nMotivo: ${data.reason}\n${data.url}`;
}
