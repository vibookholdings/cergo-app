/**
 * Parte pura del agente (sin base de datos ni red): el panel web la usa para mostrar en vivo el
 * prompt final y la revisión automática mientras el hotel edita, con exactamente la misma lógica
 * que usa el servidor al publicar.
 */
export { BASE_LAYER, BASE_LAYER_VERSION } from "./base-layer";
export { compileAgent, formatMonthDay, type CompiledAgent } from "./compose";
export { hasBlocking, reviewConfig } from "./review";
