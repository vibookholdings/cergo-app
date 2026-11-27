# CERGO · panel del hotel

Panel de CERGO, el agente de voz con IA que atiende el teléfono de recepción de hoteles. Cada hotel ve sus llamadas, lo que quedó para el equipo, las reservas que entraron por teléfono, y configura por su cuenta todo lo que dice y sabe su agente.

## Qué incluye
- **Inicio:** llamadas, resolución del agente, reservas, horas de recepción liberadas, llamadas por día y por hora, motivos, idiomas y uso del plan.
- **Llamadas:** lista con búsqueda y filtros; detalle con resumen, grabación y transcripción.
- **Pendientes:** lo que el agente derivó a recepción, con aviso por mail y WhatsApp, responsable y notas.
- **Reservas:** reservas y cotizaciones en USD, seguimiento, número del PMS y exportación CSV.
- **Agente:** editor completo (datos, saludo y estilo, habitaciones y tarifas, temporada alta, políticas, preguntas frecuentes, horarios, derivaciones), vista previa del prompt real, revisión automática, prueba por voz en el navegador, publicación e historial con diferencias.
- **Equipo y Ajustes:** invitaciones por rol, avisos, retención de grabaciones.
- **Panel interno de CERGO:** alta de hoteles, agentes de ElevenLabs, token de herramientas, líneas y salud del servicio.

## Arquitectura
Monorepo con pnpm y Turborepo, TypeScript estricto.

```
apps/
  web/      Next.js 15 (App Router). Habla solo con su propio dominio: /api/* es un proxy a la API privada.
  api/      Hono sobre Node 22. Panel, webhook post-llamada de ElevenLabs y server tools.
  worker/   Cola propia en PostgreSQL: webhooks, audio, avisos, publicación del agente, mantenimiento.
packages/
  contracts/     Esquemas zod y tipos compartidos (entradas, respuestas, permisos, etiquetas).
  core/          Lógica de negocio. `@cergo/core/agent` es la parte pura que también usa el panel.
  db/            Drizzle + migraciones SQL (incluye RLS por hotel).
  integrations/  ElevenLabs, Resend, Twilio WhatsApp y almacenamiento S3.
```

Decisiones en [`docs/adr`](docs/adr): login propio, cola en PostgreSQL, aislamiento por hotel con RLS y prompt en dos capas. Diseño en [`docs/design-system.md`](docs/design-system.md). Conexión con ElevenLabs en [`docs/elevenlabs.md`](docs/elevenlabs.md).

Infraestructura: **Railway + PostgreSQL**. Sin Supabase.

## Desarrollo local
Requisitos: Node 22, pnpm 10 (`corepack enable`) y PostgreSQL 16 (`docker compose up -d`).

```bash
pnpm install
cp .env.example .env        # completá AUTH_SECRET y SEED_PASSWORD
pnpm db:migrate
pnpm db:seed                # hotel de demo "Casa del Lago" con 30 días de llamadas
pnpm dev                    # web :3000, API :8080 y worker
```

Usuarios de demo (clave = `SEED_PASSWORD`): `duena@casadellago.example` (dueña), `recepcion@casadellago.example` (recepción) y `equipo@cergo.example` (equipo CERGO, entra a `/admin`).

## Calidad
```bash
pnpm lint && pnpm typecheck
pnpm test         # unitarios e integración contra PostgreSQL real (TEST_DATABASE_URL)
pnpm test:e2e     # Playwright contra el stack levantado
```
CI en GitHub Actions corre todo en cada pull request, incluidas las pruebas de punta a punta.

## Deploy en Railway
Un proyecto con PostgreSQL y tres servicios desde este repo:

| Servicio | Dockerfile | Variables clave | Otros |
|---|---|---|---|
| `api` | `Dockerfile.server` | `SERVICE=api`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `AUTH_SECRET`, `APP_URL`, `ELEVENLABS_*` | Pre-deploy `node apps/api/dist/migrate.js` · healthcheck `/ready` · dominio público para ElevenLabs |
| `worker` | `Dockerfile.server` | `SERVICE=worker`, mismas variables que la API | Sin dominio |
| `web` | `Dockerfile.web` | `API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8080` | Healthcheck `/entrar` · dominio público del panel |

La API escucha en `::` (IPv4 e IPv6) para la red privada de Railway. Las grabaciones van a un bucket S3 compatible (`S3_*`); sin bucket se guardan en disco local.

Escalado: la API y la web no guardan estado y escalan con réplicas; el worker escala con réplicas o separando colas (`WORKER_QUEUES`); la API puede separar voz y panel con `API_ROLE`.
