import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "demo-cergo-2026";
export const OWNER = process.env.SEED_OWNER_EMAIL ?? "duena@casadellago.example";
export const RECEPTION = process.env.SEED_RECEPTION_EMAIL ?? "recepcion@casadellago.example";
export const STAFF = process.env.SEED_STAFF_EMAIL ?? "equipo@cergo.example";

export type Who = "owner" | "reception" | "staff";
export const authFile = (who: Who) => path.resolve("e2e/.auth", `${who}.json`);

export async function login(page: Page, email: string, landing: RegExp = /\/h\//) {
  await page.goto("/entrar");
  await page.getByLabel("Mail").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: /Entrar/ }).click();
  await expect(page).toHaveURL(landing, { timeout: 15_000 });
}

/** Abre el panel del hotel de la sesión guardada y devuelve su URL base (/h/<id>). */
export async function openHotel(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/h\/[0-9a-f-]{36}/, { timeout: 15_000 });
  return hotelBase(page);
}

export function hotelBase(page: Page): string {
  const m = new URL(page.url()).pathname.match(/^\/h\/[0-9a-f-]{36}/);
  if (!m) throw new Error(`No estoy en un hotel: ${page.url()}`);
  return m[0];
}
