import type { IAftnGateway, AftnMessage, FilingResult } from '../interfaces/IAftnGateway'
import { createServiceLogger } from '../../logger'

const log = createServiceLogger('AftnGatewayStub')

export class AftnGatewayStub implements IAftnGateway {

  async fileFpl(message: AftnMessage): Promise<FilingResult> {
    log.info('stub_file_fpl', {
      data: { messageType: message.messageType, callsign: this.extractCallsign(message.messageContent) }
    })

    if (!message.messageContent.startsWith('(FPL-')) {
      return {
        accepted: false, aftnTransmissionId: null, atsRef: null,
        rejectionReason: 'STUB: Message does not start with (FPL-',
        transmittedAtUtc: new Date().toISOString()
      }
    }

    return {
      accepted:           true,
      aftnTransmissionId: `AFTN-${Date.now()}`,
      atsRef:             `STUB-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      rejectionReason:    null,
      transmittedAtUtc:   new Date().toISOString()
    }
  }

  async cancelFpl(atsRef: string, callsign: string): Promise<FilingResult> {
    log.info('stub_cancel_fpl', { data: { atsRef, callsign } })
    return {
      accepted: true, aftnTransmissionId: `AFTN-CNL-${Date.now()}`,
      atsRef, rejectionReason: null, transmittedAtUtc: new Date().toISOString()
    }
  }

  async modifyFpl(atsRef: string): Promise<FilingResult> {
    log.info('stub_modify_fpl', { data: { atsRef } })
    return {
      accepted: true, aftnTransmissionId: `AFTN-CHG-${Date.now()}`,
      atsRef, rejectionReason: null, transmittedAtUtc: new Date().toISOString()
    }
  }

  async ping() { return { connected: true, latencyMs: 12 } }

  private extractCallsign(content: string): string {
    return content.match(/\(FPL-([A-Z0-9]+)-/)?.[1] ?? 'UNKNOWN'
  }
}
