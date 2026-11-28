import { defineConfig } from "tsup";

/**
 * Empaqueta la API con los paquetes internos (@cergo/*) adentro; las dependencias de npm quedan
 * afuera y se instalan en la imagen. Las migraciones SQL se copian al lado del bundle.
 */
export default defineConfig({
  entry: ["src/index.ts", "src/migrate.ts", "src/seed.ts", "src/bootstrap-staff.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/^@cergo\//],
});
