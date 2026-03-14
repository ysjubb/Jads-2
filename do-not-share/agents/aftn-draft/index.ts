// AFTN Draft Agent — port 3103
// Assists with drafting AFTN messages (FPL, CNL, DLA, CHG) from structured input.

import express from 'express'

const app = express()
const PORT = 3103

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ agent: 'aftn-draft', status: 'ok', port: PORT })
})

interface DraftRequest {
  messageType:    'FPL' | 'CNL' | 'DLA' | 'CHG'
  callsign:       string
  departureIcao:  string
  destinationIcao: string
  eobt:           string
  // FPL-specific
  flightRules?:   string
  flightType?:    string
  aircraftType?:  string
  wakeTurbulence?: string
  equipment?:     string
  route?:         string
  cruisingLevel?: string
  cruisingSpeed?: string
  totalEet?:      string        // Total EET in HHMM format (e.g. "0130" = 1h30m)
  // DLA-specific
  newEobt?:       string
  // CHG-specific
  changeFields?:  Record<string, string>
}

app.post('/draft', (req, res) => {
  const input = req.body as DraftRequest

  if (!input.messageType || !input.callsign || !input.departureIcao) {
    res.status(400).json({ error: 'messageType, callsign, and departureIcao are required' })
    return
  }

  let draft: string
  const suggestions: string[] = []

  switch (input.messageType) {
    case 'FPL': {
      if (!input.route || !input.cruisingLevel || !input.cruisingSpeed) {
        res.status(400).json({ error: 'FPL requires route, cruisingLevel, cruisingSpeed' })
        return
      }
      // EET: use provided totalEet, or default to "0000" (must be corrected by pilot).
      // Previous code incorrectly used eobt.substring(2) which yielded the minutes
      // portion of EOBT rather than the flight duration.
      const eet = input.totalEet ?? '0000'
      draft = [
        `(FPL-${input.callsign}-${input.flightRules ?? 'I'}${input.flightType ?? 'G'}`,
        `-${input.aircraftType ?? 'ZZZZ'}/${input.wakeTurbulence ?? 'L'}`,
        `-${input.equipment ?? 'S'}/C`,
        `-${input.departureIcao}${input.eobt}`,
        `-${input.cruisingSpeed}${input.cruisingLevel} ${input.route}`,
        `-${input.destinationIcao}${eet}`,
        `-0)`,
      ].join('\n')
      if (!input.totalEet) suggestions.push('WARNING: Total EET not provided — defaulted to 0000. Supply totalEet in HHMM format.')

      if (!input.flightRules) suggestions.push('Flight rules defaulted to IFR (I). Verify if VFR intended.')
      if (!input.wakeTurbulence) suggestions.push('Wake turbulence defaulted to Light (L). Check aircraft category.')
      break
    }

    case 'CNL': {
      draft = `(CNL-${input.callsign}-${input.departureIcao}${input.eobt}-${input.destinationIcao})`
      suggestions.push('CNL must be transmitted before EOBT for the message to be accepted.')
      break
    }

    case 'DLA': {
      if (!input.newEobt) {
        res.status(400).json({ error: 'DLA requires newEobt' })
        return
      }
      draft = `(DLA-${input.callsign}-${input.departureIcao}${input.eobt}-${input.destinationIcao}-${input.newEobt})`
      suggestions.push('DLA should be filed as soon as the delay is known.')
      if (input.newEobt <= input.eobt) {
        suggestions.push('WARNING: New EOBT is not after original EOBT. Verify the revised time.')
      }
      break
    }

    case 'CHG': {
      const changes = input.changeFields ?? {}
      const changeStr = Object.entries(changes).map(([k, v]) => `${k}/${v}`).join(' ')
      draft = `(CHG-${input.callsign}-${input.departureIcao}${input.eobt}-${input.destinationIcao}-${changeStr})`
      suggestions.push('CHG message modifies the previously filed FPL. Ensure all changed fields are listed.')
      break
    }
  }

  res.json({
    success: true,
    draft,
    messageType: input.messageType,
    suggestions,
    note: 'This is a draft. Review before transmission via AFTN gateway.',
  })
})

app.listen(PORT, () => {
  process.stdout.write(`[aftn-draft] listening on port ${PORT}\n`)
})

export default app
