// NOTAM Interpreter Agent — port 3101
// Accepts raw NOTAM text and returns a structured, human-readable interpretation.

import express from 'express'

const app = express()
const PORT = 3101

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ agent: 'notam-interpreter', status: 'ok', port: PORT })
})

interface NotamRequest {
  notamRaw: string
  icaoCode?: string
}

interface NotamInterpretation {
  summary:       string
  affectedArea:  string
  timeWindow:    string
  operationalImpact: string
  severity:      'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  tags:          string[]
}

app.post('/interpret', (req, res) => {
  const { notamRaw, icaoCode } = req.body as NotamRequest

  if (!notamRaw || typeof notamRaw !== 'string') {
    res.status(400).json({ error: 'notamRaw is required' })
    return
  }

  // Deterministic interpretation logic — no LLM dependency
  const upper = notamRaw.toUpperCase()
  const tags: string[] = []
  let severity: NotamInterpretation['severity'] = 'LOW'

  if (upper.includes('CLOSED') || upper.includes('CLSD'))  { tags.push('CLOSURE');   severity = 'CRITICAL' }
  if (upper.includes('RWY'))                                { tags.push('RUNWAY') }
  if (upper.includes('TWY'))                                { tags.push('TAXIWAY') }
  if (upper.includes('NAV') || upper.includes('VOR') || upper.includes('NDB')) { tags.push('NAVAID') }
  if (upper.includes('OBST'))                               { tags.push('OBSTACLE');  if (severity === 'LOW') severity = 'MEDIUM' }
  if (upper.includes('DRONE') || upper.includes('UAS'))     { tags.push('UAS');       if (severity !== 'CRITICAL') severity = 'HIGH' }
  if (upper.includes('MIL') || upper.includes('MILITARY'))  { tags.push('MILITARY');  if (severity !== 'CRITICAL') severity = 'HIGH' }
  if (upper.includes('TFR') || upper.includes('RESTRICTED')){ tags.push('TFR');       severity = 'CRITICAL' }
  if (tags.length === 0) tags.push('GENERAL')

  // Extract time window if present (B) ... (C) pattern
  const timeMatch = notamRaw.match(/B\)\s*(\d{10})\s.*?C\)\s*(\d{10}|PERM)/i)
  const timeWindow = timeMatch
    ? `${timeMatch[1]} to ${timeMatch[2]}`
    : 'See NOTAM for effective period'

  const interpretation: NotamInterpretation = {
    summary:           `NOTAM${icaoCode ? ` for ${icaoCode}` : ''}: ${tags.join(', ')} notice`,
    affectedArea:      icaoCode ?? 'Not specified',
    timeWindow,
    operationalImpact: severity === 'CRITICAL'
      ? 'Operations may be prohibited or severely restricted'
      : severity === 'HIGH'
        ? 'Operations require additional planning and caution'
        : 'Awareness required — plan accordingly',
    severity,
    tags,
  }

  res.json({ success: true, interpretation })
})

app.listen(PORT, () => {
  process.stdout.write(`[notam-interpreter] listening on port ${PORT}\n`)
})

export default app
