/**
 * Pre-deploy de producción: crea el primer usuario del equipo CERGO si BOOTSTRAP_STAFF_EMAIL está
 * definido. Es idempotente: si el mail ya existe no toca nada. Ese usuario entra con
 * BOOTSTRAP_STAFF_PASSWORD (mínimo 12 caracteres) y en el primer ingreso el panel le pide activar la
 * verificación en dos pasos.
 *
 * Variables: DATABASE_URL, BOOTSTRAP_STAFF_EMAIL, BOOTSTRAP_STAFF_PASSWORD, BOOTSTRAP_STAFF_NAME (opcional).
 */
import { createLogger, ensureStaffUser } from "@cergo/core";
import { createDb } from "@cergo/db";

const log = createLogger("bootstrap-staff");
const url = process.env.DATABASE_URL;
const email = process.env.BOOTSTRAP_STAFF_EMAIL?.trim();
if (!url) throw new Error("Falta DATABASE_URL");

if (!email) {
  log.info("Sin BOOTSTRAP_STAFF_EMAIL: no hay usuario del equipo para crear");
} else {
  const { db, close } = createDb(url, { max: 1, applicationName: "cergo-bootstrap-staff" });
  try {
    const result = await ensureStaffUser(db, {
      email,
      password: process.env.BOOTSTRAP_STAFF_PASSWORD ?? "",
      name: process.env.BOOTSTRAP_STAFF_NAME,
    });
    if (result.status === "created") log.info({ email }, "Usuario del equipo CERGO creado");
    else if (result.status === "exists") log.info({ email }, "El usuario del equipo CERGO ya existe; no cambio nada");
    else log.warn({ email }, "Ese mail ya es de una cuenta que no es del equipo CERGO; no la cambio");
  } finally {
    await close();
  }
}
