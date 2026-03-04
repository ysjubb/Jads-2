// Adapter interface for UIDAI (Unique Identification Authority of India) integration.
// Government replaces UidaiAdapterStub with their live UIDAI implementation
// without changing any service code.
//
// UIDAI provides Aadhaar-based identity verification for:
//   1. Civilian drone operator eKYC (Aadhaar OTP flow)
//   2. Pilot identity verification at registration
//   3. Periodic re-verification (every 90 days per JADS policy)
//
// PRIVACY: JADS never stores raw Aadhaar numbers. Only the VID (Virtual ID)
// or a salted SHA-256 hash is retained. Full Aadhaar is used transiently
// during the OTP flow and discarded immediately after verification.

// ── Types ──────────────────────────────────────────────────────────────────

export interface AadhaarOtpRequest {
  aadhaarOrVid:  string        // 12-digit Aadhaar or 16-digit VID
  useVid:        boolean       // true if aadhaarOrVid is a VID
  reason:        string        // Consent purpose string shown to user
}

export interface AadhaarOtpResponse {
  txnId:         string        // UIDAI transaction ID for OTP session
  otpSent:       boolean       // Whether OTP was dispatched
  error?:        string        // e.g. 'INVALID_AADHAAR', 'RATE_LIMITED'
}

export interface AadhaarVerifyRequest {
  txnId:         string        // From the OTP generation response
  otp:           string        // 6-digit OTP entered by user
}

export interface AadhaarVerifyResponse {
  verified:      boolean       // true if OTP matched and identity confirmed
  ekycData?: {
    name:          string      // As registered with UIDAI
    dob:           string      // YYYY-MM-DD
    gender:        'M' | 'F' | 'T'
    photoBase64?:  string      // Only if photo consent was given
    address?:      string      // Only if address consent was given
  }
  aadhaarLastFour: string      // Last 4 digits (for display, never full number)
  txnId:         string        // UIDAI transaction reference
  error?:        string
}

export interface AadhaarDemographicMatch {
  name:          string        // Name to match against UIDAI records
  dob?:          string        // Date of birth YYYY-MM-DD
  gender?:       'M' | 'F' | 'T'
}

export interface DemographicMatchResponse {
  matched:       boolean       // Whether name/DOB/gender matched UIDAI records
  matchScore:    number        // 0-100, UIDAI's fuzzy match confidence
  txnId:         string
  error?:        string
}

// ── Interface ──────────────────────────────────────────────────────────────

export interface IUidaiAdapter {
  /** Request OTP to the registered mobile number for the given Aadhaar/VID. */
  requestOtp(req: AadhaarOtpRequest): Promise<AadhaarOtpResponse>

  /** Verify the OTP and retrieve eKYC data if consent was given. */
  verifyOtp(req: AadhaarVerifyRequest): Promise<AadhaarVerifyResponse>

  /** Demographic match — verify name/DOB against UIDAI without OTP (limited use). */
  demographicMatch(
    aadhaarOrVid: string,
    match: AadhaarDemographicMatch
  ): Promise<DemographicMatchResponse>

  /** Health check — verify UIDAI gateway is reachable. */
  ping(): Promise<{ reachable: boolean; latencyMs: number }>
}
