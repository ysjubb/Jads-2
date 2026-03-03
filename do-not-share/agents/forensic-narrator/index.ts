// Forensic Narrator Agent — port 3102
// Generates human-readable forensic narratives from mission verification data.

import express from 'express'

const app = express()
const PORT = 3102

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ agent: 'forensic-narrator', status: 'ok', port: PORT })
})

interface ForensicInput {
  missionId:            string
  chainVerified:        boolean
  chainFailureSequence: number | null
  ntpSyncStatus:        string
  certValidAtStart:     boolean
  isDuplicate:          boolean
  violationCount:       number
  criticalViolations:   number
  recordCount:          number
  npntClass:            string
  gnssDegradedPercent:  number
  strongboxBacked:      boolean
  secureBootVerified:   boolean
}

interface ForensicNarrative {
  verdict:     'COMPLIANT' | 'WARNING' | 'CRITICAL_FAILURE'
  title:       string
  narrative:   string
  findings:    string[]
  riskScore:   number   // 0-100
}

app.post('/narrate', (req, res) => {
  const input = req.body as ForensicInput

  if (!input.missionId) {
    res.status(400).json({ error: 'missionId is required' })
    return
  }

  const findings: string[] = []
  let riskScore = 0

  // Chain integrity
  if (!input.chainVerified) {
    findings.push(`Hash chain verification FAILED${input.chainFailureSequence != null ? ` at sequence ${input.chainFailureSequence}` : ''}. Telemetry integrity cannot be guaranteed.`)
    riskScore += 40
  } else {
    findings.push('SHA-256 hash chain verified end-to-end. No tampering detected.')
  }

  // NTP sync
  if (input.ntpSyncStatus === 'FAILED') {
    findings.push('NTP synchronization was not established. All timestamps are unreliable for forensic purposes.')
    riskScore += 25
  } else if (input.ntpSyncStatus === 'DEGRADED') {
    findings.push('NTP sync was degraded. Timestamps may have reduced accuracy.')
    riskScore += 10
  } else {
    findings.push('NTP quorum was established. Timestamps are forensically reliable.')
  }

  // Certificate
  if (!input.certValidAtStart) {
    findings.push('Device certificate was invalid or revoked at mission start. Device identity is unverifiable.')
    riskScore += 30
  }

  // Duplicate
  if (input.isDuplicate) {
    findings.push('This mission was flagged as a DUPLICATE submission. Original submission takes precedence.')
    riskScore += 15
  }

  // Violations
  if (input.criticalViolations > 0) {
    findings.push(`${input.criticalViolations} critical violation(s) recorded during the mission.`)
    riskScore += Math.min(input.criticalViolations * 10, 30)
  }

  // GNSS
  if (input.gnssDegradedPercent > 20) {
    findings.push(`${input.gnssDegradedPercent.toFixed(1)}% of records had degraded GNSS — exceeds 20% threshold.`)
    riskScore += 10
  }

  riskScore = Math.min(riskScore, 100)

  const verdict: ForensicNarrative['verdict'] =
    riskScore >= 40 ? 'CRITICAL_FAILURE' :
    riskScore >= 15 ? 'WARNING' :
    'COMPLIANT'

  const title =
    verdict === 'CRITICAL_FAILURE' ? 'Critical Forensic Failure — Investigation Required' :
    verdict === 'WARNING'          ? 'Forensic Warnings Present — Review Recommended' :
    'All Forensic Invariants Hold — Mission Compliant'

  const narrative = `Mission ${input.missionId} (${input.npntClass} zone, ${input.recordCount} records) ` +
    `completed forensic verification with a risk score of ${riskScore}/100. ` +
    `${findings.length} finding(s) were generated. ` +
    (verdict === 'COMPLIANT'
      ? 'No anomalies detected. The telemetry record is forensically sound.'
      : `Verdict: ${verdict}. Further investigation may be warranted.`)

  const result: ForensicNarrative = { verdict, title, narrative, findings, riskScore }
  res.json({ success: true, ...result })
})

app.listen(PORT, () => {
  process.stdout.write(`[forensic-narrator] listening on port ${PORT}\n`)
})

export default app
