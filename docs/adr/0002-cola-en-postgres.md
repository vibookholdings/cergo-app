# 2. Cola de trabajos propia sobre PostgreSQL

**Estado:** aceptada · 27/11/2026

## Contexto
Hay trabajo que no puede ir en la respuesta HTTP: procesar el webhook post-llamada, bajar el audio, avisar por mail y WhatsApp, publicar el agente en ElevenLabs y el mantenimiento diario. Ya tenemos PostgreSQL y no queremos sumar Redis ni otro servicio para esto.

## Decisión
Tabla `jobs` con:
- Toma con `FOR UPDATE SKIP LOCKED` y reparto justo entre hoteles (round robin), así un hotel con mucho volumen no frena a los demás.
- **Outbox:** el trabajo se encola en la misma transacción que el cambio de negocio (si la transacción falla, no queda un aviso huérfano).
- **Inbox:** los webhooks se guardan en `webhook_events` con clave única `(source, external_id)`; un reenvío de ElevenLabs no duplica nada.
- `dedupe_key` (índice único parcial), reintentos con backoff, recuperación de trabajos colgados y `NOTIFY cergo_jobs` para que el worker reaccione al instante.

## Consecuencias
Una sola base para operar y respaldar. Escala bien a decenas de miles de trabajos por hora; si algún día hace falta más, el contrato (`enqueue` / handlers por cola) permite cambiar el motor sin tocar la lógica de negocio.
