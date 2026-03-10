// Production implementation of IEgcaAdapter.
// Calls the DGCA eGCA API over HTTPS with JWT Bearer token auth.
//
// Features:
//   - Auto-refresh JWT 5 minutes before expiry
//   - Exponential backoff retry: 3 attempts at 1s / 2s / 4s
//   - 30-second request timeout
//   - Audit logging with redacted sensitive fields
//   - Typed EgcaError for all HTTP 4xx/5xx responses
//
// PRODUCTION: Requires EGCA_API_BASE_URL, EGCA_API_EMAIL, EGCA_API_PASSWORD env vars.

import * as https from 'https'
import * as http  from 'http'
import { URL }    from 'url'

import { createServiceLogger }  from '../../logger'
import { env }                  from '../../env'
import type { IEgcaAdapter }    from './EgcaAdapter'
import {
  EgcaError,
  egcaAuthError,
  egcaForbiddenError,
  egcaNotFoundError,
  egcaValidationError,
  egcaRateLimitError,
  egcaServerError,
  egcaTimeoutError,
  egcaNetworkError,
} from './EgcaError'
import type {
  UINValidationResult,
  RPCValidationResult,
  UAOPValidationResult,
  FlightPermissionPayload,
  FlightPermissionResult,
  PermissionStatus,
  FlightPermission,
  PaginatedResult,
  ZoneClassification,
  LatLng,
  EgcaAuthResult,
} from './types'

const log = createServiceLogger('EgcaAdapterImpl')

// ── Constants ───────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS       = 30_000
const MAX_RETRIES              = 3
const RETRY_BASE_DELAY_MS      = 1_000
const TOKEN_REFRESH_MARGIN_MS  = 5 * 60 * 1_000  // refresh 5 min before expiry

/** Fields redacted in audit logs. */
const REDACTED_FIELDS = new Set(['password', 'token', 'authorization', 'cookie'])

// ── Helpers ─────────────────────────────────────────────────────────────────

function redactForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(key.toLowerCase())) {
      redacted[key] = '***REDACTED***'
    } else if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
      redacted[key] = redactForLog(value as Record<string, unknown>)
    } else if (Buffer.isBuffer(value)) {
      redacted[key] = `<Buffer ${value.length} bytes>`
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── HTTP request helper (Node.js native — no axios dependency) ──────────────

interface HttpResponse {
  statusCode: number
  headers:    http.IncomingHttpHeaders
  body:       Buffer
}

function makeRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: Buffer | string,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === 'https:' ? https : http

    const reqHeaders: Record<string, string> = { ...headers }

    if (body) {
      reqHeaders['Content-Length'] = Buffer.isBuffer(body)
        ? String(body.length)
        : String(Buffer.byteLength(body, 'utf-8'))
    }

    const opts: https.RequestOptions = {
      method,
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      headers:  reqHeaders,
      timeout:  REQUEST_TIMEOUT_MS,
    }

    const req = transport.request(opts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers:    res.headers,
          body:       Buffer.concat(chunks),
        })
      })
    })

    req.on('timeout', () => {
      req.destroy()
      reject(egcaTimeoutError())
    })

    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED' ||
          (err as NodeJS.ErrnoException).code === 'ENOTFOUND' ||
          (err as NodeJS.ErrnoException).code === 'ECONNRESET') {
        reject(egcaNetworkError(err.message))
      } else {
        reject(egcaNetworkError(err.message))
      }
    })

    if (body) req.write(body)
    req.end()
  })
}

// ── Implementation ──────────────────────────────────────────────────────────

export class EgcaAdapterImpl implements IEgcaAdapter {
  private readonly baseUrl: string
  private token:      string | null = null
  private expiresAt:  Date | null   = null

  constructor(
    baseUrl?: string,
    private readonly email?:    string,
    private readonly password?: string,
  ) {
    this.baseUrl = (baseUrl || env.EGCA_API_BASE_URL).replace(/\/+$/, '')
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  async authenticate(email: string, password: string): Promise<EgcaAuthResult> {
    log.info('egca_authenticate_start', { data: { email: '***REDACTED***' } })

    const res = await this.requestWithRetry('POST', '/auth/login', {
      email,
      password,
    }, false)

    const json = JSON.parse(res.body.toString('utf-8'))
    const token     = json.token   ?? json.access_token
    const expiresIn = json.expiresIn ?? json.expires_in ?? 3600

    if (!token) {
      throw egcaAuthError('eGCA authentication response missing token')
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1_000)
    this.token     = token
    this.expiresAt = expiresAt

    log.info('egca_authenticate_success', { data: { expiresAt: expiresAt.toISOString() } })
    return { token, expiresAt }
  }

  // ── UIN Validation ──────────────────────────────────────────────────────

  async validateUIN(uin: string): Promise<UINValidationResult> {
    log.info('egca_validate_uin', { data: { uin } })
    const res = await this.authedRequest('GET', `/uin/validate/${encodeURIComponent(uin)}`)
    return JSON.parse(res.body.toString('utf-8'))
  }

  // ── RPC Validation ──────────────────────────────────────────────────────

  async validateRPC(rpcId: string): Promise<RPCValidationResult> {
    log.info('egca_validate_rpc', { data: { rpcId } })
    const res = await this.authedRequest('GET', `/rpc/validate/${encodeURIComponent(rpcId)}`)
    return JSON.parse(res.body.toString('utf-8'))
  }

  // ── UAOP Validation ────────────────────────────────────────────────────

  async validateUAOP(uaopNumber: string): Promise<UAOPValidationResult> {
    log.info('egca_validate_uaop', { data: { uaopNumber } })
    const res = await this.authedRequest('GET', `/uaop/validate/${encodeURIComponent(uaopNumber)}`)
    return JSON.parse(res.body.toString('utf-8'))
  }

  // ── Flight Permission Submission ────────────────────────────────────────

  async submitFlightPermission(payload: FlightPermissionPayload): Promise<FlightPermissionResult> {
    log.info('egca_submit_flight_permission', {
      data: redactForLog({
        uinNumber: payload.uinNumber,
        droneId:   payload.droneId,
        purpose:   payload.flightPurpose,
        operation: payload.typeOfOperation,
      }),
    })

    const res = await this.authedRequest('POST', '/flight-permission/apply', payload)
    return JSON.parse(res.body.toString('utf-8'))
  }

  // ── Permission Status ──────────────────────────────────────────────────

  async getPermissionStatus(applicationId: string): Promise<PermissionStatus> {
    log.info('egca_get_permission_status', { data: { applicationId } })
    const res = await this.authedRequest('GET', `/flight-permission/status/${encodeURIComponent(applicationId)}`)
    return JSON.parse(res.body.toString('utf-8'))
  }

  // ── Download Permission Artefact ────────────────────────────────────────

  async downloadPermissionArtefact(applicationId: string): Promise<Buffer> {
    log.info('egca_download_permission_artefact', { data: { applicationId } })
    const res = await this.authedRequest(
      'GET',
      `/flight-permission/artefact/${encodeURIComponent(applicationId)}`,
      undefined,
      'application/octet-stream',
    )
    log.info('egca_permission_artefact_downloaded', {
      data: { applicationId, sizeBytes: res.body.length },
    })
    return res.body
  }

  // ── Upload Flight Log ──────────────────────────────────────────────────

  async uploadFlightLog(applicationId: string, logBundle: Buffer): Promise<void> {
    log.info('egca_upload_flight_log', {
      data: { applicationId, bundleSizeBytes: logBundle.length },
    })
    await this.authedRequest(
      'POST',
      `/flight-log/upload/${encodeURIComponent(applicationId)}`,
      logBundle,
      'application/octet-stream',
    )
    log.info('egca_flight_log_uploaded', { data: { applicationId } })
  }

  // ── List Flight Permissions ─────────────────────────────────────────────

  async listFlightPermissions(
    operatorId: string, page: number, pageSize: number,
  ): Promise<PaginatedResult<FlightPermission>> {
    log.info('egca_list_permissions', { data: { operatorId, page, pageSize } })
    const qs = `?operatorId=${encodeURIComponent(operatorId)}&page=${page}&pageSize=${pageSize}`
    const res = await this.authedRequest('GET', `/flight-permission/list${qs}`)
    return JSON.parse(res.body.toString('utf-8'))
  }

  // ── Airspace Zone Check ─────────────────────────────────────────────────

  async checkAirspaceZone(polygon: LatLng[]): Promise<ZoneClassification> {
    log.info('egca_check_airspace_zone', { data: { vertexCount: polygon.length } })
    const res = await this.authedRequest('POST', '/airspace/zone-check', { polygon })
    return JSON.parse(res.body.toString('utf-8'))
  }

  // ── Private: token management ─────────────────────────────────────────

  private isTokenValid(): boolean {
    if (!this.token || !this.expiresAt) return false
    return this.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS
  }

  private async ensureToken(): Promise<string> {
    if (this.isTokenValid()) return this.token!

    const email    = this.email    ?? env.EGCA_API_EMAIL
    const password = this.password ?? env.EGCA_API_PASSWORD

    log.info('egca_token_refresh', { data: { reason: this.token ? 'expiring' : 'initial' } })
    await this.authenticate(email, password)

    if (!this.token) {
      throw egcaAuthError('Failed to obtain eGCA token after refresh')
    }
    return this.token
  }

  // ── Private: authenticated request ────────────────────────────────────

  private async authedRequest(
    method: string,
    path: string,
    body?: unknown,
    accept?: string,
  ): Promise<HttpResponse> {
    const doRequest = async (): Promise<HttpResponse> => {
      const token = await this.ensureToken()
      return this.requestWithRetry(method, path, body, true, token, accept)
    }

    try {
      return await doRequest()
    } catch (err) {
      // On 401, force token refresh and retry once
      if (err instanceof EgcaError && err.httpStatus === 401) {
        log.warn('egca_token_expired_mid_request', { data: { path } })
        this.token    = null
        this.expiresAt = null
        return doRequest()
      }
      throw err
    }
  }

  // ── Private: request with exponential backoff retry ───────────────────

  private async requestWithRetry(
    method: string,
    path: string,
    body?: unknown,
    requireAuth: boolean = true,
    token?: string,
    accept?: string,
  ): Promise<HttpResponse> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Accept':       accept ?? 'application/json',
      'User-Agent':   'JADS-Platform/4.0',
    }

    if (requireAuth && token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    let requestBody: Buffer | string | undefined
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) {
        headers['Content-Type'] = 'application/octet-stream'
        requestBody = body
      } else {
        headers['Content-Type'] = 'application/json'
        requestBody = JSON.stringify(body)
      }
    }

    let lastError: EgcaError | undefined
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const startMs = Date.now()

      try {
        log.debug('egca_request', {
          data: redactForLog({ method, url, attempt, headers: { ...headers } }),
        })

        const res = await makeRequest(method, url, headers, requestBody)
        const elapsedMs = Date.now() - startMs

        log.info('egca_response', {
          data: {
            method, path, statusCode: res.statusCode, elapsedMs, attempt,
            responseSize: res.body.length,
          },
        })

        // Success
        if (res.statusCode >= 200 && res.statusCode < 300) {
          return res
        }

        // Map HTTP errors to typed EgcaError
        const errorBody = this.tryParseErrorBody(res.body)
        const errorMsg  = errorBody?.message ?? errorBody?.error ?? `HTTP ${res.statusCode}`

        if (res.statusCode === 401) throw egcaAuthError(errorMsg)
        if (res.statusCode === 403) throw egcaForbiddenError(errorMsg)
        if (res.statusCode === 404) throw egcaNotFoundError(path, '')
        if (res.statusCode === 422) throw egcaValidationError(errorMsg)
        if (res.statusCode === 429) throw egcaRateLimitError()

        // 5xx — retryable
        if (res.statusCode >= 500) {
          lastError = egcaServerError(res.statusCode, errorMsg)
          // Fall through to retry logic
        } else {
          // Other 4xx — not retryable
          throw new EgcaError('EGCA_CLIENT_ERROR', errorMsg, false, res.statusCode)
        }
      } catch (err) {
        if (err instanceof EgcaError) {
          if (!err.retryable) throw err
          lastError = err
        } else {
          lastError = egcaNetworkError(err instanceof Error ? err.message : String(err))
        }
      }

      // Retry with exponential backoff (only for retryable errors)
      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)  // 1s, 2s, 4s
        log.warn('egca_request_retry', {
          data: {
            method, path, attempt, nextAttempt: attempt + 1, delayMs,
            errorCode: lastError?.code, errorMessage: lastError?.message,
          },
        })
        await sleep(delayMs)
      }
    }

    // All retries exhausted
    log.error('egca_request_failed', {
      data: {
        method, path, maxRetries: MAX_RETRIES,
        errorCode: lastError?.code, errorMessage: lastError?.message,
      },
    })
    throw lastError ?? egcaNetworkError('Request failed after all retries')
  }

  // ── Private: parse error response body ────────────────────────────────

  private tryParseErrorBody(body: Buffer): { message?: string; error?: string } | null {
    try {
      return JSON.parse(body.toString('utf-8'))
    } catch {
      return null
    }
  }
}
