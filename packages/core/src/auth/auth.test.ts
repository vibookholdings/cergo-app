import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listMemberships, resolveHotelAccess } from "../access";
import { addMemberFixture, createHotelFixture, createTestDeps, createUserFixture, resetDatabase } from "../testing";
import { decryptSecret } from "../crypto";
import {
  acceptInvite,
  confirmTotpSetup,
  inviteMember,
  loginWithMagicLink,
  loginWithPassword,
  requestMagicLink,
  startTotpSetup,
  verifySecondFactor,
} from "./service";
import { ensureStaffUser } from "./bootstrap";
import { validateSession } from "./sessions";
import { totpAt } from "./totp";
import { eq, users } from "@cergo/db";

const deps = createTestDeps();
afterAll(() => deps.close());
const meta = { ip: "127.0.0.1", userAgent: "vitest" };
const tokenFrom = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

describe("ingreso y sesiones", () => {
  beforeEach(() => resetDatabase(deps.db));

  it("entra con contraseña y rechaza la incorrecta sin revelar si el mail existe", async () => {
    await createUserFixture(deps.db, { email: "dueno@hotel.test", password: "clave-super-segura" });
    await expect(loginWithPassword(deps, "dueno@hotel.test", "otra-clave-cualquiera", meta)).rejects.toThrow("Mail o contraseña incorrectos");
    await expect(loginWithPassword(deps, "nadie@hotel.test", "otra-clave-cualquiera", meta)).rejects.toThrow("Mail o contraseña incorrectos");
    const res = await loginWithPassword(deps, "  DUENO@hotel.test ", "clave-super-segura", meta);
    expect(res.mfaRequired).toBe(false);
    const session = await validateSession(deps.db, res.token);
    expect(session?.user.email).toBe("dueno@hotel.test");
    expect(await validateSession(deps.db, "token-inventado")).toBeNull();
  });

  it("alta del primer usuario del equipo: crea una vez, no pisa la clave ni toca cuentas ajenas", async () => {
    const first = await ensureStaffUser(deps.db, { email: " Equipo@Hotel.test ", password: "clave-inicial-larga" });
    expect(first.status).toBe("created");
    await expect(loginWithPassword(deps, "equipo@hotel.test", "clave-inicial-larga", meta)).resolves.toMatchObject({ mfaRequired: false });

    const again = await ensureStaffUser(deps.db, { email: "equipo@hotel.test", password: "otra-clave-distinta" });
    expect(again).toEqual({ status: "exists", userId: first.userId });
    await expect(loginWithPassword(deps, "equipo@hotel.test", "otra-clave-distinta", meta)).rejects.toThrow("Mail o contraseña incorrectos");

    const owner = await createUserFixture(deps.db, { email: "dueno@hotel.test", password: "clave-super-segura" });
    await expect(ensureStaffUser(deps.db, { email: "dueno@hotel.test", password: "clave-inicial-larga" })).resolves.toEqual({
      status: "exists_not_staff",
      userId: owner.id,
    });
    const [row] = await deps.db.select({ isStaff: users.isStaff }).from(users).where(eq(users.id, owner.id));
    expect(row?.isStaff).toBe(false);

    await expect(ensureStaffUser(deps.db, { email: "corta@hotel.test", password: "corta" })).rejects.toThrow("al menos 12");
  });

  it("el enlace mágico sirve una sola vez", async () => {
    await createUserFixture(deps.db, { email: "recepcion@hotel.test" });
    await requestMagicLink(deps, "recepcion@hotel.test");
    await requestMagicLink(deps, "no-existe@hotel.test");
    expect(deps.mailer.sent).toHaveLength(1);
    const token = tokenFrom(deps.mailer.sent[0]!.text);
    const res = await loginWithMagicLink(deps, token, meta);
    expect(res.token).toBeTruthy();
    await expect(loginWithMagicLink(deps, token, meta)).rejects.toThrow(/venció o ya se usó/);
  });

  it("la verificación en dos pasos se exige al entrar y acepta códigos de respaldo una vez", async () => {
    const user = await createUserFixture(deps.db, { email: "staff@cergo.test", password: "clave-super-segura", isStaff: true });
    const first = await loginWithPassword(deps, user.email, "clave-super-segura", meta);
    const s1 = (await validateSession(deps.db, first.token))!;
    const { secret } = await startTotpSetup(deps, s1);
    await expect(confirmTotpSetup(deps, s1, "000000")).rejects.toThrow(/no es correcto/);
    const { backupCodes } = await confirmTotpSetup(deps, s1, totpAt(secret, Date.now()));
    expect(backupCodes).toHaveLength(8);
    const [stored] = await deps.db.select().from(users).where(eq(users.id, user.id));
    expect(stored?.totpSecret).not.toContain(secret);
    expect(decryptSecret(stored!.totpSecret!, deps.config.authSecret)).toBe(secret);

    const second = await loginWithPassword(deps, user.email, "clave-super-segura", meta);
    expect(second.mfaRequired).toBe(true);
    const s2 = (await validateSession(deps.db, second.token))!;
    expect(s2.mfaVerified).toBe(false);
    await verifySecondFactor(deps, s2, backupCodes[0]!);
    expect((await validateSession(deps.db, second.token))?.mfaVerified).toBe(true);

    const third = await loginWithPassword(deps, user.email, "clave-super-segura", meta);
    const s3 = (await validateSession(deps.db, third.token))!;
    await expect(verifySecondFactor(deps, s3, backupCodes[0]!)).rejects.toThrow(/no es correcto/);
    await verifySecondFactor(deps, s3, totpAt(secret, Date.now()));
  });

  it("invitación: crea la cuenta, da acceso al hotel y no se puede reusar", async () => {
    const fx = await createHotelFixture(deps, { name: "Hotel Invitaciones" });
    const owner = await createUserFixture(deps.db, { email: "owner@hotel.test", password: "clave-super-segura" });
    await addMemberFixture(deps.db, owner.id, fx.hotelId, "owner");
    const { inviteUrl } = await inviteMember(deps, {
      hotelId: fx.hotelId,
      email: "Nueva@Hotel.test",
      role: "reception",
      invitedBy: { id: owner.id, name: "Dueña" },
    });
    expect(deps.mailer.sent.at(-1)?.to).toEqual(["nueva@hotel.test"]);
    const token = new URL(inviteUrl).searchParams.get("token")!;
    await expect(acceptInvite(deps, { token, name: "Nueva" }, meta)).rejects.toThrow(/contraseña/);
    const res = await acceptInvite(deps, { token, name: "Nueva", password: "clave-super-segura" }, meta);
    expect(res.hotelId).toBe(fx.hotelId);
    await expect(acceptInvite(deps, { token, name: "Nueva", password: "clave-super-segura" }, meta)).rejects.toThrow(/venció/);
    const session = (await validateSession(deps.db, res.token))!;
    const access = await resolveHotelAccess(deps.db, session.user, fx.hotelId);
    expect(access.role).toBe("reception");
    expect(access.permissions).not.toContain("agent:publish");
    expect(access.permissions).toContain("handoffs:manage");
    expect((await listMemberships(deps.db, session.userId)).map((m) => m.role)).toEqual(["reception"]);
    await expect(
      inviteMember(deps, { hotelId: fx.hotelId, email: "nueva@hotel.test", role: "sales", invitedBy: { id: owner.id, name: "" } }),
    ).rejects.toThrow(/ya tiene acceso/);
  });

  it("un usuario sin membresía no entra a otro hotel (404), el staff entra como 'ver como'", async () => {
    const a = await createHotelFixture(deps, { name: "Hotel A" });
    const b = await createHotelFixture(deps, { name: "Hotel B" });
    const ana = await createUserFixture(deps.db, { email: "ana@a.test" });
    await addMemberFixture(deps.db, ana.id, a.hotelId, "owner");
    const anaUser = { id: ana.id, email: ana.email, name: ana.name, isStaff: false, totpEnabled: false };
    await expect(resolveHotelAccess(deps.db, anaUser, b.hotelId)).rejects.toThrow(/no encontrado/);
    await expect(resolveHotelAccess(deps.db, anaUser, "no-es-un-uuid")).rejects.toThrow(/no encontrado/);
    const staff = { id: a.staffId, email: "s@cergo.test", name: "S", isStaff: true, totpEnabled: true };
    const access = await resolveHotelAccess(deps.db, staff, b.hotelId);
    expect(access.viaStaff).toBe(true);
  });
});
