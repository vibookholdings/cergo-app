import { eq, users, type Db } from "@cergo/db";
import { hashPassword } from "./password";

export type BootstrapStaffInput = { email: string; password: string; name?: string };
export type BootstrapStaffResult = {
  /** created: se creó ahora · exists: ya existía y es del equipo · exists_not_staff: el mail es de otra cuenta. */
  status: "created" | "exists" | "exists_not_staff";
  userId: string;
};

const MIN_PASSWORD = 12;

/**
 * Alta del primer usuario del equipo CERGO en un entorno sin datos de demo (producción), para poder
 * entrar al panel interno y dar de alta hoteles. Es idempotente: si el mail ya existe no cambia nada,
 * ni siquiera la clave (que el usuario pudo haber cambiado después de entrar).
 */
export async function ensureStaffUser(db: Db, input: BootstrapStaffInput): Promise<BootstrapStaffResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Mail inválido para el equipo CERGO: ${email}`);
  if (input.password.length < MIN_PASSWORD) {
    throw new Error(`La clave inicial del equipo CERGO tiene que tener al menos ${MIN_PASSWORD} caracteres`);
  }

  const [inserted] = await db
    .insert(users)
    .values({
      email,
      name: input.name?.trim() || "Equipo CERGO",
      isStaff: true,
      passwordHash: await hashPassword(input.password),
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (inserted) return { status: "created", userId: inserted.id };

  const [existing] = await db
    .select({ id: users.id, isStaff: users.isStaff })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!existing) throw new Error("No se pudo crear ni encontrar el usuario del equipo CERGO");
  return { status: existing.isStaff ? "exists" : "exists_not_staff", userId: existing.id };
}
