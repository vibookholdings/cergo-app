// Copia los estáticos al build standalone para poder correrlo fuera de Docker (CI, local).
import { cpSync, existsSync } from "node:fs";

const target = ".next/standalone/apps/web";
if (!existsSync(target)) throw new Error("Primero corré `next build`");
cpSync(".next/static", `${target}/.next/static`, { recursive: true });
cpSync("public", `${target}/public`, { recursive: true });
console.warn("Estáticos copiados a", target);
