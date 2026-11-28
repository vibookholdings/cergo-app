import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de punta a punta del panel. Corren contra el stack levantado (web + API + Postgres con
 * los datos de demo): en CI lo arma el workflow; en local, `pnpm dev` y `pnpm --filter @cergo/api seed:dev`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "off",
    screenshot: "only-on-failure",
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    // Entra una vez por rol y guarda la sesión: el login tiene límite de intentos por mail.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "escritorio",
      dependencies: ["setup"],
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "telefono", dependencies: ["setup"], testMatch: /mobile\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
});
