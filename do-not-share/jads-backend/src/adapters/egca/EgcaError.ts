// Typed error for eGCA adapter failures.
// Maps HTTP 4xx/5xx responses to structured errors with retryable flag.
// Services can inspect `code` and `retryable` without parsing strings.

export class EgcaError extends Error {
  public readonly name = 'EgcaError'

  constructor(
    /** Machine-readable error code (e.g. 'EGCA_AUTH_FAILED', 'EGCA_TIMEOUT'). */
    public readonly code:      string,
    /** Human-readable description. */
    message:                   string,
    /** Whether the caller should retry the request. */
    public readonly retryable: boolean,
    /** Original HTTP status code, if available. */
    public readonly httpStatus?: number,
  ) {
    super(message)
  }
}

// ── Factory helpers ─────────────────────────────────────────────────────────

export function egcaAuthError(message: string): EgcaError {
  return new EgcaError('EGCA_AUTH_FAILED', message, false, 401)
}

export function egcaForbiddenError(message: string): EgcaError {
  return new EgcaError('EGCA_FORBIDDEN', message, false, 403)
}

export function egcaNotFoundError(resource: string, id: string): EgcaError {
  return new EgcaError('EGCA_NOT_FOUND', `${resource} ${id} not found on eGCA`, false, 404)
}

export function egcaValidationError(message: string): EgcaError {
  return new EgcaError('EGCA_VALIDATION', message, false, 422)
}

export function egcaRateLimitError(): EgcaError {
  return new EgcaError('EGCA_RATE_LIMITED', 'eGCA API rate limit exceeded', true, 429)
}

export function egcaServerError(httpStatus: number, message: string): EgcaError {
  return new EgcaError('EGCA_SERVER_ERROR', message, true, httpStatus)
}

export function egcaTimeoutError(): EgcaError {
  return new EgcaError('EGCA_TIMEOUT', 'eGCA API request timed out', true)
}

export function egcaNetworkError(message: string): EgcaError {
  return new EgcaError('EGCA_NETWORK_ERROR', message, true)
}
