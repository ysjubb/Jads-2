// Stub implementation of IUidaiAdapter for development, testing, and demo.
// Returns deterministic responses. Government replaces this with a live
// UIDAI gateway integration — zero code changes in services.

import type {
  IUidaiAdapter,
  AadhaarOtpRequest,
  AadhaarOtpResponse,
  AadhaarVerifyRequest,
  AadhaarVerifyResponse,
  AadhaarDemographicMatch,
  DemographicMatchResponse,
} from '../interfaces/IUidaiAdapter'

export class UidaiAdapterStub implements IUidaiAdapter {

  async requestOtp(req: AadhaarOtpRequest): Promise<AadhaarOtpResponse> {
    // Validate format
    const len = req.useVid ? 16 : 12
    if (req.aadhaarOrVid.length !== len) {
      return { txnId: '', otpSent: false, error: 'INVALID_FORMAT' }
    }
    return {
      txnId:   `STUB_TXN_${Date.now()}`,
      otpSent: true,
    }
  }

  async verifyOtp(req: AadhaarVerifyRequest): Promise<AadhaarVerifyResponse> {
    // Stub: OTP "123456" always succeeds
    if (req.otp !== '123456') {
      return {
        verified:        false,
        aadhaarLastFour: '0000',
        txnId:           req.txnId,
        error:           'OTP_MISMATCH',
      }
    }
    return {
      verified: true,
      ekycData: {
        name:   'STUB OPERATOR',
        dob:    '1990-01-01',
        gender: 'M',
      },
      aadhaarLastFour: '1234',
      txnId:           req.txnId,
    }
  }

  async demographicMatch(
    aadhaarOrVid: string,
    match: AadhaarDemographicMatch
  ): Promise<DemographicMatchResponse> {
    return {
      matched:    true,
      matchScore: 95,
      txnId:      `STUB_DEM_${Date.now()}`,
    }
  }

  async ping(): Promise<{ reachable: boolean; latencyMs: number }> {
    return { reachable: true, latencyMs: 1 }
  }
}
