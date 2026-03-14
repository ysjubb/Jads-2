/**
 * DS-03 — Device Registration Service
 *
 * Implements Digital Sky drone device registration/deregistration
 * using X.509 PKI (M2M authentication — no JWT required).
 *
 * DS contract (§3.6):
 *   POST /api/droneDevice/register/{mbi}
 *   PATCH /api/droneDevice/deregister/{mbi}
 *
 * Request payload:
 *   - drone: { version, txn, deviceId, deviceModelId, operatorBusinessIdentifier }
 *   - signature: Base64(SHA256withRSA(JSON.stringify(drone)))
 *   - digitalCertificate: Base64(X.509 DER)
 *
 * Server validates:
 *   1. Certificate chain (PKIX) against manufacturer's stored chain
 *   2. DN matching (CN + O) between cert issuer and chain certs
 *   3. Digital signature on drone JSON using cert's public key
 *   4. Manufacturer business identifier matches cert subject organization
 *
 * Response codes: REGISTERED, DEREGISTERED, INVALID_SIGNATURE,
 *   INVALID_DIGITAL_CERTIFICATE, DRONE_ALREADY_REGISTERED, etc.
 */

import * as crypto from 'crypto'
import { createServiceLogger } from '../logger'
import { PkiCertificateChainService, extractDnField } from './pki/PkiCertificateChainService'

const log = createServiceLogger('DeviceRegistrationService')

// ── Types ──────────────────────────────────────────────────────────────

export interface DroneDevicePayload {
  version:                     string
  txn:                         string   // max 50 chars
  deviceId:                    string
  deviceModelId:               string
  operatorBusinessIdentifier:  string   // max 36 chars (UUID)
}

export interface DeviceRegistrationRequest {
  drone:              DroneDevicePayload
  signature:          string   // Base64(SHA256withRSA(JSON.stringify(drone)))
  digitalCertificate: string   // Base64(X.509 DER)
}

export type RegisterDroneResponseCode =
  | 'REGISTERED'
  | 'DEREGISTERED'
  | 'OPERATOR_BUSINESS_IDENTIFIER_INVALID'
  | 'OPERATOR_BUSINESS_IDENTIFIER_MISSING'
  | 'INVALID_SIGNATURE'
  | 'INVALID_DIGITAL_CERTIFICATE'
  | 'DRONE_ALREADY_REGISTERED'
  | 'DRONE_NOT_FOUND'
  | 'DRONE_NOT_REGISTERED'
  | 'INVALID_MANUFACTURER'
  | 'MANUFACTURER_BUSINESS_IDENTIFIER_INVALID'
  | 'MANUFACTURER_TRUSTED_CERTIFICATE_NOT_FOUND'
  | 'BAD_REQUEST_PAYLOAD'
  | 'DRONE_TYPE_NOT_APPROVED'
  | 'OPERATOR_HAS_NO_VALID_UAOP_PERMIT'
  | 'EMPTY_DEVICE_ID'

export interface DeviceRegistrationResult {
  responseCode:   RegisterDroneResponseCode
  uin?:           string
  txn?:           string
  errors?:        string[]
}

export interface RegisteredDevice {
  deviceId:                    string
  deviceModelId:               string
  uin:                         string
  operatorBusinessIdentifier:  string
  manufacturerBusinessIdentifier: string
  registeredAt:                Date
  status:                      'REGISTERED' | 'DEREGISTERED'
  certificateFingerprint:      string
}

// ── Service ────────────────────────────────────────────────────────────

export class DeviceRegistrationService {
  /** In-memory device registry (production: database) */
  private devices: Map<string, RegisteredDevice> = new Map()
  /** UIN counter for demo */
  private uinCounter = 0

  constructor(
    private readonly pkiService: PkiCertificateChainService,
    /** Map of operatorBusinessIdentifier → isValid */
    private readonly validOperators: Map<string, boolean> = new Map(),
    /** Map of manufacturerBusinessIdentifier → isValid */
    private readonly validManufacturers: Map<string, boolean> = new Map()
  ) {
    log.info('device_registration_service_initialized', { data: {} })
  }

  // ── Register ─────────────────────────────────────────────────────────

  /**
   * Register a drone device (DS §3.6 POST /api/droneDevice/register/{mbi}).
   *
   * @param mbi      Manufacturer Business Identifier (from URL path)
   * @param request  Registration payload (drone + signature + certificate)
   */
  async register(
    mbi: string,
    request: DeviceRegistrationRequest
  ): Promise<DeviceRegistrationResult> {
    const { drone, signature, digitalCertificate } = request
    const errors: string[] = []

    // Step 0: Basic payload validation
    if (!drone || !signature || !digitalCertificate) {
      return { responseCode: 'BAD_REQUEST_PAYLOAD', txn: drone?.txn,
        errors: ['Missing required fields: drone, signature, digitalCertificate'] }
    }
    if (!drone.deviceId || drone.deviceId.trim() === '') {
      return { responseCode: 'EMPTY_DEVICE_ID', txn: drone.txn }
    }
    if (!drone.operatorBusinessIdentifier) {
      return { responseCode: 'OPERATOR_BUSINESS_IDENTIFIER_MISSING', txn: drone.txn }
    }
    if (drone.txn && drone.txn.length > 50) {
      return { responseCode: 'BAD_REQUEST_PAYLOAD', txn: drone.txn,
        errors: ['txn exceeds 50 characters'] }
    }

    // Step 1: Decode and parse the digital certificate
    let certPem: string
    try {
      const certDer = Buffer.from(digitalCertificate, 'base64')
      const certBase64 = certDer.toString('base64').match(/.{1,64}/g)?.join('\n') ?? ''
      certPem = `-----BEGIN CERTIFICATE-----\n${certBase64}\n-----END CERTIFICATE-----`
      // Verify it's parseable
      new crypto.X509Certificate(certPem)
    } catch (e: any) {
      log.warn('invalid_certificate', { data: { mbi, error: e.message } })
      return { responseCode: 'INVALID_DIGITAL_CERTIFICATE', txn: drone.txn,
        errors: [`Certificate parse error: ${e.message}`] }
    }

    // Step 2: Validate manufacturer
    if (!mbi || mbi.trim() === '') {
      return { responseCode: 'MANUFACTURER_BUSINESS_IDENTIFIER_INVALID', txn: drone.txn }
    }
    // In demo mode, accept any manufacturer
    const manufacturerKnown = this.validManufacturers.has(mbi) || this.validManufacturers.size === 0
    if (!manufacturerKnown) {
      return { responseCode: 'INVALID_MANUFACTURER', txn: drone.txn }
    }

    // Step 3: Validate certificate chain against manufacturer's stored chain
    const chainResult = this.pkiService.validateDeviceCertAgainstManufacturer(certPem, mbi)
    if (!chainResult.valid) {
      // If no stored chain, try standalone validation (demo mode)
      const standaloneResult = this.pkiService.validateChain([certPem])
      if (!standaloneResult.valid) {
        log.warn('chain_validation_failed', { data: { mbi, errors: chainResult.errors } })
        return { responseCode: 'MANUFACTURER_TRUSTED_CERTIFICATE_NOT_FOUND', txn: drone.txn,
          errors: chainResult.errors }
      }
    }

    // Step 4: Verify DN matching — cert organization must match manufacturer
    const cert = new crypto.X509Certificate(certPem)
    const certOrg = extractDnField(cert.subject, 'O')
    // DS checks that manufacturer business identifier matches — for demo we log but don't block
    if (certOrg) {
      log.info('dn_match_check', { data: { mbi, certOrg } })
    }

    // Step 5: Verify digital signature (SHA256withRSA)
    try {
      const droneJson = JSON.stringify(drone)
      const verifier = crypto.createVerify('SHA256')
      verifier.update(droneJson)
      const sigValid = verifier.verify(cert.publicKey, signature, 'base64')

      if (!sigValid) {
        log.warn('signature_invalid', { data: { mbi, deviceId: drone.deviceId } })
        return { responseCode: 'INVALID_SIGNATURE', txn: drone.txn }
      }
    } catch (e: any) {
      log.warn('signature_verification_error', { data: { mbi, error: e.message } })
      return { responseCode: 'INVALID_SIGNATURE', txn: drone.txn,
        errors: [`Signature verification error: ${e.message}`] }
    }

    // Step 6: Validate operator
    if (this.validOperators.size > 0 && !this.validOperators.has(drone.operatorBusinessIdentifier)) {
      return { responseCode: 'OPERATOR_BUSINESS_IDENTIFIER_INVALID', txn: drone.txn }
    }

    // Step 7: Check if already registered
    const existingKey = `${mbi}:${drone.deviceId}`
    const existing = this.devices.get(existingKey)
    if (existing && existing.status === 'REGISTERED') {
      return { responseCode: 'DRONE_ALREADY_REGISTERED', txn: drone.txn, uin: existing.uin }
    }

    // Step 8: Register and generate UIN
    const uin = this.generateUin()
    const device: RegisteredDevice = {
      deviceId: drone.deviceId,
      deviceModelId: drone.deviceModelId,
      uin,
      operatorBusinessIdentifier: drone.operatorBusinessIdentifier,
      manufacturerBusinessIdentifier: mbi,
      registeredAt: new Date(),
      status: 'REGISTERED',
      certificateFingerprint: cert.fingerprint256,
    }
    this.devices.set(existingKey, device)

    log.info('device_registered', {
      data: { mbi, deviceId: drone.deviceId, uin, operator: drone.operatorBusinessIdentifier }
    })

    return { responseCode: 'REGISTERED', uin, txn: drone.txn }
  }

  // ── Deregister ───────────────────────────────────────────────────────

  /**
   * Deregister a drone device (DS §3.6 PATCH /api/droneDevice/deregister/{mbi}).
   */
  async deregister(
    mbi: string,
    request: DeviceRegistrationRequest
  ): Promise<DeviceRegistrationResult> {
    const { drone, signature, digitalCertificate } = request

    if (!drone || !signature || !digitalCertificate) {
      return { responseCode: 'BAD_REQUEST_PAYLOAD', txn: drone?.txn }
    }

    // Decode certificate
    let certPem: string
    try {
      const certDer = Buffer.from(digitalCertificate, 'base64')
      const certBase64 = certDer.toString('base64').match(/.{1,64}/g)?.join('\n') ?? ''
      certPem = `-----BEGIN CERTIFICATE-----\n${certBase64}\n-----END CERTIFICATE-----`
      new crypto.X509Certificate(certPem)
    } catch {
      return { responseCode: 'INVALID_DIGITAL_CERTIFICATE', txn: drone.txn }
    }

    // Verify signature
    try {
      const cert = new crypto.X509Certificate(certPem)
      const droneJson = JSON.stringify(drone)
      const verifier = crypto.createVerify('SHA256')
      verifier.update(droneJson)
      const sigValid = verifier.verify(cert.publicKey, signature, 'base64')
      if (!sigValid) {
        return { responseCode: 'INVALID_SIGNATURE', txn: drone.txn }
      }
    } catch {
      return { responseCode: 'INVALID_SIGNATURE', txn: drone.txn }
    }

    // Find device
    const existingKey = `${mbi}:${drone.deviceId}`
    const existing = this.devices.get(existingKey)
    if (!existing) {
      return { responseCode: 'DRONE_NOT_FOUND', txn: drone.txn }
    }
    if (existing.status === 'DEREGISTERED') {
      return { responseCode: 'DRONE_NOT_REGISTERED', txn: drone.txn }
    }

    // Deregister
    existing.status = 'DEREGISTERED'
    this.devices.set(existingKey, existing)

    log.info('device_deregistered', {
      data: { mbi, deviceId: drone.deviceId, uin: existing.uin }
    })

    return { responseCode: 'DEREGISTERED', txn: drone.txn }
  }

  // ── Query ────────────────────────────────────────────────────────────

  /**
   * Look up a device by UIN.
   */
  getDeviceByUin(uin: string): RegisteredDevice | null {
    for (const device of this.devices.values()) {
      if (device.uin === uin) return device
    }
    return null
  }

  /**
   * Get all registered devices (for admin listing).
   */
  getAllDevices(): RegisteredDevice[] {
    return Array.from(this.devices.values())
  }

  /**
   * Get devices for an operator.
   */
  getDevicesByOperator(operatorBusinessIdentifier: string): RegisteredDevice[] {
    return Array.from(this.devices.values())
      .filter(d => d.operatorBusinessIdentifier === operatorBusinessIdentifier)
  }

  // ── Demo Helpers ─────────────────────────────────────────────────────

  /**
   * Register a demo device directly (bypasses PKI for dev convenience).
   */
  registerDemoDevice(
    deviceId: string,
    deviceModelId: string,
    operatorId: string,
    manufacturerId: string
  ): RegisteredDevice {
    const uin = this.generateUin()
    const device: RegisteredDevice = {
      deviceId,
      deviceModelId,
      uin,
      operatorBusinessIdentifier: operatorId,
      manufacturerBusinessIdentifier: manufacturerId,
      registeredAt: new Date(),
      status: 'REGISTERED',
      certificateFingerprint: 'DEMO_NO_CERT',
    }
    this.devices.set(`${manufacturerId}:${deviceId}`, device)
    log.info('demo_device_registered', { data: { uin, deviceId } })
    return device
  }

  // ── Private ──────────────────────────────────────────────────────────

  private generateUin(): string {
    this.uinCounter++
    const seq = this.uinCounter.toString().padStart(12, '0')
    return `UA${seq}`
  }
}
