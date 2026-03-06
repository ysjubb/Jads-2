// AFTN ARR (Arrival) Message Builder — ICAO Doc 4444 §11.4.2.3
//
// Produces a valid AFTN ARR message to report aircraft arrival.
// Format:  (ARR-CALLSIGN-ADES-ARRIVALTIME[-ADEP[-DOF/YYMMDD]])
//
// Mandatory invariants (enforced with hard throws):
//   - Message MUST start with (ARR-
//   - Message MUST end with )
//   - Arrival time is ATA in HHmm UTC

import { createServiceLogger } from '../logger'

const log = createServiceLogger('AftnArrBuilder')

export interface ArrInput {
  callsign:          string   // Aircraft ID (e.g., VT-ABC)
  arrivalAerodrome:  string   // ADES — 4-char ICAO (where it landed)
  arrivalTime:       string   // ATA — HHmm UTC
  departureIcao?:    string   // ADEP — optional, for disambiguation
  dof?:              string   // Date of flight — YYMMDD (for Item 18 DOF/)
}

export class AftnArrBuilder {

  build(input: ArrInput): string {
    if (!input.callsign || !input.arrivalAerodrome || !input.arrivalTime) {
      throw new Error('ARR_BUILD_FAILED: callsign, arrivalAerodrome, and arrivalTime are required')
    }

    // ICAO Doc 4444 ARR format: (ARR-CALLSIGN-ADES-ARRIVALTIME[-ADEP[-DOF/YYMMDD]])
    let message = `(ARR-${input.callsign}-${input.arrivalAerodrome}-${input.arrivalTime}`

    if (input.departureIcao) {
      message += `-${input.departureIcao}`
    }

    if (input.dof) {
      message += `-DOF/${input.dof}`
    }

    message += ')'

    // Format assertions
    if (!message.startsWith('(ARR-')) {
      throw new Error(`ARR_BUILD_FAILED: Message does not start with (ARR-. Got: ${message.substring(0, 30)}`)
    }
    if (!message.endsWith(')')) {
      throw new Error(`ARR_BUILD_FAILED: Message does not end with ). Got: ...${message.slice(-30)}`)
    }

    log.info('arr_message_built', {
      data: {
        callsign: input.callsign,
        arrivalAerodrome: input.arrivalAerodrome,
        arrivalTime: input.arrivalTime,
        messageLength: message.length,
      }
    })

    return message
  }
}
