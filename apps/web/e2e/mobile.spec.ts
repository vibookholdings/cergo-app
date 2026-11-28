import { expect, test } from "@playwright/test";
import { authFile, openHotel } from "./helpers";

test.use({ storageState: authFile("owner") });

test("en el teléfono no hay scroll horizontal y el menú abre las secciones", async ({ page }) => {
  const base = await openHotel(page);
  await expect(page.getByText("Llamadas atendidas")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("link", { name: "Reservas" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/reservas$`));
  await expect(page.getByRole("heading", { name: "Reservas" })).toBeVisible();
});
