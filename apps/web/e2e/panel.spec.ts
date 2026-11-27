import { expect, test } from "@playwright/test";
import { authFile, openHotel, OWNER } from "./helpers";

test.describe("sin sesión", () => {
  test("sin sesión manda a entrar", async ({ page }) => {
    await page.goto("/h/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/entrar\?next=/);
  });

  test("contraseña incorrecta muestra el error", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Mail").fill(OWNER);
    await page.getByLabel("Contraseña").fill("no-es-la-clave");
    await page.getByRole("button", { name: /Entrar/ }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });
});

test.describe("dueño del hotel", () => {
  test.use({ storageState: authFile("owner") });

  test("inicio con métricas, gráfico y tabla accesible", async ({ page }) => {
    await openHotel(page);
    await expect(page.getByText("Llamadas atendidas")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Llamadas por día" })).toBeVisible();
    await page.getByRole("tab", { name: "30 días" }).click();
    await page.getByText("Ver tabla").first().click();
    await expect(page.locator("table").first()).toBeVisible();
  });

  test("llamadas: lista, filtro y detalle con transcripción", async ({ page }) => {
    const base = await openHotel(page);
    await page.goto(`${base}/llamadas`);
    const rows = page.locator("main ul li a");
    await expect(rows.first()).toBeVisible();
    await page.getByLabel("Buscar").fill("mascotas");
    await expect(rows.first()).toContainText(/mascotas/i);
    await rows.first().click();
    await expect(page.getByRole("heading", { name: "Transcripción" })).toBeVisible();
    await expect(page.getByText("Huésped").first()).toBeVisible();
  });

  test("un hotel ajeno no se puede abrir", async ({ page }) => {
    await page.goto("/h/11111111-1111-4111-8111-111111111111");
    await expect(page.getByText("No pudimos abrir este hotel")).toBeVisible();
  });

  test("el dueño edita, guarda, publica y ve el cambio en el historial", async ({ page }) => {
    const base = await openHotel(page);
    await page.goto(`${base}/agente`);
    await page.getByRole("tab", { name: "Preguntas" }).click();
    await page.getByRole("button", { name: "Agregar pregunta" }).click();
    const question = `¿Tienen cargador para auto eléctrico? ${Date.now()}`;
    await page.getByLabel("Pregunta", { exact: true }).last().fill(question);
    await page.getByLabel("Respuesta", { exact: true }).last().fill("Sí, en el estacionamiento cubierto, sin cargo.");
    await expect(page.getByText("Tenés cambios sin guardar")).toBeVisible();
    await page.getByRole("tab", { name: "Vista previa" }).click();
    await expect(page.locator("pre")).toContainText(question);
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await page.getByLabel("¿Qué cambiaste?").fill("Pregunta sobre cargador eléctrico");
    await page.getByRole("button", { name: "Publicar ahora" }).click();
    await expect(page.getByText(/Listo: el agente ya atiende con la versión \d+/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Historial de versiones" }).click();
    await expect(page.getByText("Pregunta sobre cargador eléctrico").first()).toBeVisible();
    await expect(page.getByText(question).first()).toBeVisible();
  });

  test("validación: no deja guardar una habitación sin nombre", async ({ page }) => {
    const base = await openHotel(page);
    await page.goto(`${base}/agente`);
    await page.getByRole("tab", { name: "Habitaciones" }).click();
    await page.getByRole("button", { name: "Agregar habitación" }).click();
    await page.getByRole("button", { name: "Guardar borrador" }).first().click();
    await expect(page.getByText("Hay campos para completar antes de guardar.")).toBeVisible();
    await page.getByRole("button", { name: "Deshacer cambios sin guardar" }).click();
    await expect(page.getByText("Tenés cambios sin guardar")).toHaveCount(0);
  });
});

test.describe("recepción", () => {
  test.use({ storageState: authFile("reception") });

  test("recepción toma un pendiente y deja una nota", async ({ page }) => {
    const base = await openHotel(page);
    await page.goto(`${base}/pendientes`);
    await page.getByRole("tab", { name: "Nuevos" }).click();
    const first = page.locator("main ul li a").first();
    if (!(await first.isVisible().catch(() => false))) test.skip(true, "No quedan pendientes nuevos en los datos de demo");
    await first.click();
    await page.getByRole("button", { name: "Lo tomo yo" }).click();
    await expect(page.getByText("En curso").first()).toBeVisible();
    const note = `Llamé al huésped (${Date.now()})`;
    await page.getByLabel("Agregar una nota").fill(note);
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expect(page.getByText(note)).toBeVisible();
  });

  test("recepción no ve equipo ni ajustes y el agente es de solo lectura", async ({ page }) => {
    await openHotel(page);
    const nav = page.getByRole("navigation", { name: "Secciones del hotel" });
    await expect(nav.getByRole("link", { name: "Pendientes" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Equipo" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Ajustes" })).toHaveCount(0);
    await nav.getByRole("link", { name: "Agente" }).click();
    await expect(page.getByText("Para cambiarlo, pedíselo al dueño del hotel")).toBeVisible();
    await expect(page.getByRole("button", { name: "Publicar", exact: true })).toHaveCount(0);
  });
});

test.describe("panel interno", () => {
  test.use({ storageState: authFile("staff") });

  test("el equipo CERGO da de alta un hotel y ve su token una sola vez", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Hoteles" })).toBeVisible();
    await page.getByRole("link", { name: "Nuevo hotel" }).click();
    await page.getByLabel("Nombre").fill(`Hostería de prueba ${Date.now()}`);
    await page.getByRole("button", { name: "Crear hotel" }).click();
    const token = page.getByRole("textbox", { name: "Token de herramientas" });
    await expect(token).toHaveValue(/^cergo_tool_/);
    await page.getByRole("link", { name: "Ir a la ficha del hotel" }).click();
    await expect(page.getByRole("heading", { name: "Líneas telefónicas" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Token de herramientas" })).toHaveCount(0);
  });
});
