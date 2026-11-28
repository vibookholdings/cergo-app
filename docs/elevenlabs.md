# Conectar un hotel con ElevenLabs

Guía para el equipo CERGO. El hotel no toca nada de esto: lo configura CERGO una vez por hotel y después el hotel maneja todo desde el panel.

## 1. Agentes
En ElevenLabs Conversational AI, creá el agente del hotel (voz rioplatense) y, si querés que las pruebas del panel no toquen el agente real, un segundo **agente de prueba** igual.

Cargá los IDs en el panel interno: **Hoteles → ficha del hotel → Agente de voz**.

> El prompt, el primer mensaje, el idioma y la voz **los publica el panel** (PATCH `/v1/convai/agents/{id}`). No los edites a mano en ElevenLabs: se pisan en la próxima publicación.

Si no hay agente de prueba, la prueba por voz usa el agente real con *overrides*. En ese caso, en **Security → Overrides** habilitá: system prompt, first message y language.

## 2. Webhook post-llamada
- **URL:** `https://<dominio-público-de-la-api>/webhooks/elevenlabs`
- **Eventos:** transcripción (`post_call_transcription`) y audio (`post_call_audio`).
- **Secreto HMAC:** el mismo valor que `ELEVENLABS_WEBHOOK_SECRET` en la API.

La API verifica la firma (`elevenlabs-signature: t=…,v0=…`), guarda el evento una sola vez y responde enseguida; el worker lo procesa (llamada, transcripción, motivo, resultado, vínculo con reservas y pendientes, métricas).

## 3. Recolección de datos (Analysis)
Agregá el campo **`motivo`** (string): *"Motivo principal de la llamada: reservation, inquiry, change, complaint u other."* Si falta, CERGO lo clasifica con reglas.

## 4. Server tools
Cuatro herramientas tipo webhook, todas `POST`, con header `Authorization: Bearer <token del hotel>` (se genera al crear el hotel y se puede rotar desde la ficha). Body en JSON:

| Herramienta | URL | Parámetros |
|---|---|---|
| `consultar_disponibilidad` | `/tools/consultar_disponibilidad` | `check_in`, `check_out` (AAAA-MM-DD), `adults`, `children` |
| `cotizar` | `/tools/cotizar` | `check_in`, `check_out`, `adults`, `children`, `room_type` (opcional) |
| `reservar` | `/tools/reservar` | `guest_name`, `guest_phone`, `guest_email` (opc.), `check_in`, `check_out`, `adults`, `children`, `room_type`, `notes` (opc.) |
| `derivar_a_recepcion` | `/tools/derivar_a_recepcion` | `reason`, `guest_name`, `guest_phone`, `summary` (opc.), `urgency`: `normal` \| `high` \| `emergency` |

En todas sumá estos dos parámetros como **variables dinámicas**:
- `conversation_id` ← `system__conversation_id` (vincula la reserva o el pendiente con la llamada).
- `cergo_test` ← `cergo_test` (vale `"1"` en las pruebas del panel: la herramienta responde igual pero no guarda nada; en llamadas reales vale `"0"`, el panel lo publica como valor por defecto).

Las respuestas son `{ ok, message, … }` con un `message` pensado para decirse en voz alta (montos en dólares).

## 5. Línea telefónica
Número de Twilio o SIP trunk conectado al agente. El hotel desvía su línea al número de CERGO (si no atienden, fuera de horario o siempre). Cargá el número en la ficha del hotel.

## 6. Verificación
1. En el panel del hotel, **Agente → Publicar**: la versión queda "Publicada" en segundos.
2. **Probar por voz** desde el panel: la llamada aparece en **Llamadas** marcada como prueba.
3. Llamá al número: la llamada, su resumen y la grabación aparecen en **Llamadas**; si el agente derivó, el pendiente llega por mail/WhatsApp.
