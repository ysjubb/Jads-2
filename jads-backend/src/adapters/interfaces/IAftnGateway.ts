// AFTN (Aeronautical Fixed Telecommunication Network) gateway adapter.
// Used for filing FPL messages with AAI ATC.
// Format: ICAO Doc 4444 Appendix 2.
// Stub until AAI digital channel credentials are issued.
// Inject AftnGatewayLive via constructor — no code change required.

export interface AftnMessage {
  messageType:    'FPL' | 'CHG' | 'CNL' | 'DLA' | 'ARR' | 'DEP'
  priority:       'FF' | 'GG' | 'KK'    // FF=urgent, GG=normal, KK=low
  addressees:     string[]
  originator:     string
  filingTime:     string                 // DDHHmm UTC
  messageContent: string                 // Full AFTN message body
}

export interface FilingResult {
  accepted:            boolean
  aftnTransmissionId:  string | null
  atsRef:              string | null
  rejectionReason:     string | null
  transmittedAtUtc:    string
}

export interface IAftnGateway {
  fileFpl(message: AftnMessage): Promise<FilingResult>
  cancelFpl(atsRef: string, callsign: string, depAerodrome: string, depTime: string): Promise<FilingResult>
  modifyFpl(atsRef: string, changes: Partial<AftnMessage>): Promise<FilingResult>
  ping(): Promise<{ connected: boolean; latencyMs: number }>
}
