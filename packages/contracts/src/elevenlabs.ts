import { z } from "zod";

/**
 * Webhook post-llamada de ElevenLabs Conversational AI. El esquema es tolerante (passthrough):
 * ElevenLabs suma campos con el tiempo y no queremos rechazar un evento por eso.
 */
const transcriptTurn = z
  .object({
    role: z.string(),
    message: z.string().nullable().optional(),
    time_in_call_secs: z.number().nullable().optional(),
    tool_calls: z.array(z.object({ tool_name: z.string().optional() }).passthrough()).nullable().optional(),
  })
  .passthrough();

export const elevenlabsWebhookSchema = z
  .object({
    type: z.string(),
    event_timestamp: z.number().optional(),
    data: z
      .object({
        agent_id: z.string(),
        conversation_id: z.string(),
        status: z.string().optional(),
        transcript: z.array(transcriptTurn).optional(),
        full_audio: z.string().optional(),
        metadata: z
          .object({
            start_time_unix_secs: z.number().optional(),
            call_duration_secs: z.number().optional(),
            cost: z.number().optional(),
            termination_reason: z.string().optional(),
            main_language: z.string().optional(),
            phone_call: z
              .object({
                direction: z.string().optional(),
                external_number: z.string().optional(),
                agent_number: z.string().optional(),
                type: z.string().optional(),
              })
              .passthrough()
              .nullable()
              .optional(),
          })
          .passthrough()
          .optional(),
        analysis: z
          .object({
            call_successful: z.string().optional(),
            transcript_summary: z.string().nullable().optional(),
            data_collection_results: z
              .record(z.string(), z.object({ value: z.unknown().optional() }).passthrough())
              .optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
        conversation_initiation_client_data: z
          .object({
            dynamic_variables: z.record(z.string(), z.unknown()).optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type ElevenlabsWebhook = z.infer<typeof elevenlabsWebhookSchema>;
