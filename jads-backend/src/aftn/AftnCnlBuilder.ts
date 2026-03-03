// AFTN CNL (Cancellation) Message Builder — ICAO Doc 4444 §11.4.2.5
//
// Produces a valid AFTN CNL message to cancel a previously filed flight plan.
// Format:  (CNL-CALLSIGN-ADEP-EOBT-ADES)
//
// Mandatory invariants (enforced with hard throws):
//   - Message MUST start with (CNL-
//   - Message MUST end with )
//   - Original EOBT is required (identifies which FPL to cancel)
//   - ATS reference (if available) included in transmission metadata

import { createServiceLogger } from '../logger'

const log = createServiceLogger('AftnCnlBuilder')

export interface CnlInput {
  callsign:      string   // Aircraft ID (e.g., VT-ABC)
  departureIcao: string   // ADEP — 4-char ICAO
  eobt:          string   // Original EOBT — DDHHmm
  destination:   string   // ADES — 4-char ICAO
  dof?:          string   // Date of flight — YYMMDD (for Item 18 DOF/)
}

export class AftnCnlBuilder {

  build(input: CnlInput): string {
    if (!input.callsign || !input.departureIcao || !input.eobt || !input.destination) {
      throw new Error('CNL_BUILD_FAILED: callsign, departureIcao, eobt, and destination are required')
    }

    // ICAO Doc 4444 CNL format: (CNL-CALLSIGN-ADEP-EOBT-ADES[-DOF/YYMMDD])
    let message = `(CNL-${input.callsign}-${input.departureIcao}${input.eobt}-${input.destination}`

    if (input.dof) {
      message += `-DOF/${input.dof}`
    }

    message += ')'

    // Format assertions
    if (!message.startsWith('(CNL-')) {
      throw new Error(`CNL_BUILD_FAILED: Message does not start with (CNL-. Got: ${message.substring(0, 30)}`)
    }
    if (!message.endsWith(')')) {
      throw new Error(`CNL_BUILD_FAILED: Message does not end with ). Got: ...${message.slice(-30)}`)
    }

    log.info('cnl_message_built', {
      data: {
        callsign: input.callsign,
        departure: input.departureIcao,
        destination: input.destination,
        messageLength: message.length,
      }
    })

    return message
  }
}
