// AFTN DLA (Delay) Message Builder — ICAO Doc 4444 §11.4.2.4
//
// Produces a valid AFTN DLA message to notify a delay in departure.
// Format:  (DLA-CALLSIGN-ADEP-ORIGINALEOBT-ADES-NEWEOBT)
//
// Mandatory invariants (enforced with hard throws):
//   - Message MUST start with (DLA-
//   - Message MUST end with )
//   - Both original and new EOBT are required
//   - New EOBT must differ from original EOBT

import { createServiceLogger } from '../logger'

const log = createServiceLogger('AftnDlaBuilder')

export interface DlaInput {
  callsign:      string   // Aircraft ID (e.g., VT-ABC)
  departureIcao: string   // ADEP — 4-char ICAO
  originalEobt:  string   // Original EOBT — DDHHmm
  newEobt:       string   // Revised EOBT — DDHHmm
  destination:   string   // ADES — 4-char ICAO
  dof?:          string   // Date of flight — YYMMDD (for Item 18 DOF/)
}

export class AftnDlaBuilder {

  build(input: DlaInput): string {
    if (!input.callsign || !input.departureIcao || !input.originalEobt || !input.newEobt || !input.destination) {
      throw new Error('DLA_BUILD_FAILED: callsign, departureIcao, originalEobt, newEobt, and destination are required')
    }

    if (input.originalEobt === input.newEobt) {
      throw new Error('DLA_BUILD_FAILED: newEobt must differ from originalEobt')
    }

    // ICAO Doc 4444 DLA format: (DLA-CALLSIGN-ADEP-ORIGINALEOBT-ADES-NEWEOBT[-DOF/YYMMDD])
    let message = `(DLA-${input.callsign}-${input.departureIcao}${input.originalEobt}-${input.destination}-${input.newEobt}`

    if (input.dof) {
      message += `-DOF/${input.dof}`
    }

    message += ')'

    // Format assertions
    if (!message.startsWith('(DLA-')) {
      throw new Error(`DLA_BUILD_FAILED: Message does not start with (DLA-. Got: ${message.substring(0, 30)}`)
    }
    if (!message.endsWith(')')) {
      throw new Error(`DLA_BUILD_FAILED: Message does not end with ). Got: ...${message.slice(-30)}`)
    }

    log.info('dla_message_built', {
      data: {
        callsign: input.callsign,
        departure: input.departureIcao,
        destination: input.destination,
        originalEobt: input.originalEobt,
        newEobt: input.newEobt,
        messageLength: message.length,
      }
    })

    return message
  }
}
