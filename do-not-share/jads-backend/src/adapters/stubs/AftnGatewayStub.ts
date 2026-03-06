/**
 * AFTN TRANSMISSION GATEWAY — STUB IMPLEMENTATION
 * ================================================
 * Status: NOT CONNECTED TO LIVE AAI AMHS NETWORK
 *
 * What this does now: logs the built FPL message and returns a simulated
 * acknowledgement. No message is transmitted externally.
 *
 * What production requires:
 * - Connection to AAI's AMHS (Aeronautical Message Handling System)
 *   based on ITU-T X.400 protocol (Frequentis-supplied system, 2026)
 * - OR legacy AFTN socket connection to AAI AMSS (being phased out)
 * - Authenticated session with AAI's AFTN address (VIDDYNYX or equivalent)
 * - Formal AAI integration agreement and test environment access
 *
 * Integration path:
 * - Apply for AAI AMHS connectivity (contact: AAI CNS dept, Delhi FIC)
 * - Obtain test AFTN address and sandbox credentials from AAI
 * - Replace this stub with X.400 P1 message envelope + AFTN header
 * - Implement acknowledgement parsing (ACK/NAK from AMHS)
 * - Implement retry logic with exponential backoff
 *
 * Do NOT remove this stub before live credentials are available.
 */

import type { IAftnGateway, AftnMessage, FilingResult } from '../interfaces/IAftnGateway'
import { createServiceLogger } from '../../logger'

const log = createServiceLogger('AftnGatewayStub')

const STUB_AFTN_ADDRESS = 'VIDDYNYX'  // Delhi FIC AFTN address

export class AftnGatewayStub implements IAftnGateway {

  async fileFpl(message: AftnMessage): Promise<FilingResult> {
    try {
      const now = new Date().toISOString()

      // Log the complete built AFTN message for demo/debug visibility
      log.info('stub_file_fpl', {
        data: {
          messageType:    message.messageType,
          callsign:       this.extractCallsign(message.messageContent),
          addressees:     message.addressees,
          originator:     message.originator,
          aftnAddress:    STUB_AFTN_ADDRESS,
          stubMode:       true,
          timestamp:      now,
          builtMessage:   message.messageContent,
        }
      })

      if (!message.messageContent.startsWith('(FPL-')) {
        return {
          accepted:           false,
          aftnTransmissionId: null,
          atsRef:             null,
          rejectionReason:    'STUB: Message does not start with (FPL-',
          transmittedAtUtc:   now,
          stubMode:           true,
          builtMessage:       message.messageContent,
          simulatedAck:       'NAK — STUB MODE — FORMAT REJECTED',
          aftnAddress:        STUB_AFTN_ADDRESS,
        }
      }

      return {
        accepted:           true,
        aftnTransmissionId: `AFTN-${Date.now()}`,
        atsRef:             `STUB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        rejectionReason:    null,
        transmittedAtUtc:   now,
        stubMode:           true,
        builtMessage:       message.messageContent,
        simulatedAck:       'ACK — STUB MODE — NOT SENT TO AAI AMHS',
        aftnAddress:        STUB_AFTN_ADDRESS,
      }
    } catch (err) {
      // Stub must never throw — graceful failure
      log.error('stub_file_fpl_error', { data: { error: String(err) } })
      return {
        accepted:           false,
        aftnTransmissionId: null,
        atsRef:             null,
        rejectionReason:    `STUB: Internal error — ${String(err)}`,
        transmittedAtUtc:   new Date().toISOString(),
        stubMode:           true,
        builtMessage:       message.messageContent ?? '',
        simulatedAck:       'NAK — STUB MODE — INTERNAL ERROR',
        aftnAddress:        STUB_AFTN_ADDRESS,
      }
    }
  }

  async cancelFpl(atsRef: string, callsign: string, _depAerodrome: string, _depTime: string): Promise<FilingResult> {
    try {
      const now = new Date().toISOString()
      log.info('stub_cancel_fpl', {
        data: { atsRef, callsign, aftnAddress: STUB_AFTN_ADDRESS, stubMode: true, timestamp: now }
      })
      return {
        accepted:           true,
        aftnTransmissionId: `AFTN-CNL-${Date.now()}`,
        atsRef,
        rejectionReason:    null,
        transmittedAtUtc:   now,
        stubMode:           true,
        simulatedAck:       'ACK — STUB MODE — CNL NOT SENT TO AAI AMHS',
        aftnAddress:        STUB_AFTN_ADDRESS,
      }
    } catch (err) {
      log.error('stub_cancel_fpl_error', { data: { error: String(err) } })
      return {
        accepted: false, aftnTransmissionId: null, atsRef,
        rejectionReason: `STUB: Internal error — ${String(err)}`,
        transmittedAtUtc: new Date().toISOString(),
        stubMode: true, simulatedAck: 'NAK — STUB MODE — INTERNAL ERROR',
        aftnAddress: STUB_AFTN_ADDRESS,
      }
    }
  }

  async modifyFpl(atsRef: string, _changes: Partial<AftnMessage>): Promise<FilingResult> {
    try {
      const now = new Date().toISOString()
      log.info('stub_modify_fpl', {
        data: { atsRef, aftnAddress: STUB_AFTN_ADDRESS, stubMode: true, timestamp: now }
      })
      return {
        accepted:           true,
        aftnTransmissionId: `AFTN-CHG-${Date.now()}`,
        atsRef,
        rejectionReason:    null,
        transmittedAtUtc:   now,
        stubMode:           true,
        simulatedAck:       'ACK — STUB MODE — CHG NOT SENT TO AAI AMHS',
        aftnAddress:        STUB_AFTN_ADDRESS,
      }
    } catch (err) {
      log.error('stub_modify_fpl_error', { data: { error: String(err) } })
      return {
        accepted: false, aftnTransmissionId: null, atsRef,
        rejectionReason: `STUB: Internal error — ${String(err)}`,
        transmittedAtUtc: new Date().toISOString(),
        stubMode: true, simulatedAck: 'NAK — STUB MODE — INTERNAL ERROR',
        aftnAddress: STUB_AFTN_ADDRESS,
      }
    }
  }

  async ping() { return { connected: true, latencyMs: 12 } }

  private extractCallsign(content: string): string {
    return content.match(/\(FPL-([A-Z0-9]+)-/)?.[1] ?? 'UNKNOWN'
  }
}
