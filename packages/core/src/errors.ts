export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "mfa_required"
  | "mfa_setup_required"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "rate_limited"
  | "unavailable"
  | "internal";

const statusByCode: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  mfa_required: 401,
  mfa_setup_required: 403,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

/** Error de negocio con un código estable y un mensaje apto para mostrar al usuario. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = statusByCode[code];
  }
}

export const notFound = (what = "Recurso") => new AppError("not_found", `${what} no encontrado`);
export const forbidden = (msg = "No tenés permiso para hacer esto") => new AppError("forbidden", msg);
