// Anomaly Advisor Agent — port 3104
// Analyzes mission telemetry patterns and flags potential anomalies.

import express from 'express'

const app = express()
const PORT = 3104

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ agent: 'anomaly-advisor', status: 'ok', port: PORT })
})

interface TelemetryPoint {
  sequence:     number
  latDeg:       number
  lonDeg:       number
  altitudeFt:   number
  velocityMs:   number
  timestampMs:  number
  gnssStatus:   string
}

interface AnomalyReport {
  anomalies:      Anomaly[]
  riskLevel:      'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
  summary:        string
}

interface Anomaly {
  type:           string
  severity:       'LOW' | 'MEDIUM' | 'HIGH'
  sequence:       number
  description:    string
  detail:         Record<string, unknown>
}

app.post('/analyze', (req, res) => {
  const { points, maxAglFt = 400, npntClass } = req.body as {
    points: TelemetryPoint[]
    maxAglFt?: number
    npntClass?: string
  }

  if (!points || !Array.isArray(points) || points.length === 0) {
    res.status(400).json({ error: 'points array is required and must not be empty' })
    return
  }

  const anomalies: Anomaly[] = []

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]

    // Altitude spike detection
    // Threshold: 500ft between consecutive records is abnormal for drones
    // (100ft was too sensitive — normal climb/descent at ~30m/s = ~100ft/s).
    // At 1Hz recording rate, 500ft/s ≈ 150m/s is physically implausible.
    const altDiff = Math.abs(curr.altitudeFt - prev.altitudeFt)
    if (altDiff > 500) {
      anomalies.push({
        type: 'ALTITUDE_SPIKE',
        severity: altDiff > 1000 ? 'HIGH' : 'MEDIUM',
        sequence: curr.sequence,
        description: `Altitude changed by ${altDiff.toFixed(0)}ft between consecutive records`,
        detail: { prevAlt: prev.altitudeFt, currAlt: curr.altitudeFt },
      })
    }

    // Velocity spike detection
    const velDiff = Math.abs(curr.velocityMs - prev.velocityMs)
    if (velDiff > 20) {
      anomalies.push({
        type: 'VELOCITY_SPIKE',
        severity: velDiff > 40 ? 'HIGH' : 'MEDIUM',
        sequence: curr.sequence,
        description: `Velocity changed by ${velDiff.toFixed(1)}m/s between consecutive records`,
        detail: { prevVel: prev.velocityMs, currVel: curr.velocityMs },
      })
    }

    // Time gap detection (>5 seconds between records is suspicious)
    const timeDiff = curr.timestampMs - prev.timestampMs
    if (timeDiff > 5000) {
      anomalies.push({
        type: 'TIME_GAP',
        severity: timeDiff > 15000 ? 'HIGH' : 'LOW',
        sequence: curr.sequence,
        description: `${(timeDiff / 1000).toFixed(1)}s gap between records (expected ~1s)`,
        detail: { gapMs: timeDiff },
      })
    }

    // Time reversal (sequence going backwards)
    if (timeDiff < 0) {
      anomalies.push({
        type: 'TIME_REVERSAL',
        severity: 'HIGH',
        sequence: curr.sequence,
        description: 'Timestamp decreased between consecutive records — possible clock manipulation',
        detail: { prevTs: prev.timestampMs, currTs: curr.timestampMs },
      })
    }

    // Position teleport detection (>500m jump in 1s implies >1800km/h)
    const dLat = (curr.latDeg - prev.latDeg) * 111320
    const dLon = (curr.lonDeg - prev.lonDeg) * 111320 * Math.cos(curr.latDeg * Math.PI / 180)
    const distM = Math.sqrt(dLat * dLat + dLon * dLon)
    if (distM > 500 && timeDiff > 0 && timeDiff < 2000) {
      anomalies.push({
        type: 'POSITION_TELEPORT',
        severity: 'HIGH',
        sequence: curr.sequence,
        description: `Position jumped ${distM.toFixed(0)}m in ${(timeDiff / 1000).toFixed(1)}s — possible GPS spoofing`,
        detail: { distanceM: distM, timeMs: timeDiff },
      })
    }

    // AGL exceedance
    if (curr.altitudeFt > maxAglFt) {
      anomalies.push({
        type: 'AGL_EXCEEDED',
        severity: curr.altitudeFt > maxAglFt * 1.5 ? 'HIGH' : 'MEDIUM',
        sequence: curr.sequence,
        description: `Altitude ${curr.altitudeFt.toFixed(0)}ft exceeds limit of ${maxAglFt}ft`,
        detail: { altitude: curr.altitudeFt, limit: maxAglFt },
      })
    }

    // GNSS degradation
    if (curr.gnssStatus === 'DEGRADED' || curr.gnssStatus === 'NO_FIX') {
      anomalies.push({
        type: 'GNSS_DEGRADED',
        severity: curr.gnssStatus === 'NO_FIX' ? 'HIGH' : 'LOW',
        sequence: curr.sequence,
        description: `GNSS status: ${curr.gnssStatus}`,
        detail: { gnssStatus: curr.gnssStatus },
      })
    }
  }

  const highCount = anomalies.filter(a => a.severity === 'HIGH').length
  const riskLevel: AnomalyReport['riskLevel'] =
    highCount >= 3 ? 'HIGH' :
    highCount >= 1 ? 'MEDIUM' :
    anomalies.length > 0 ? 'LOW' :
    'NONE'

  const report: AnomalyReport = {
    anomalies,
    riskLevel,
    summary: anomalies.length === 0
      ? 'No anomalies detected in telemetry data.'
      : `${anomalies.length} anomaly/anomalies detected (${highCount} high severity). Risk level: ${riskLevel}.`,
  }

  res.json({ success: true, ...report })
})

app.listen(PORT, () => {
  process.stdout.write(`[anomaly-advisor] listening on port ${PORT}\n`)
})

export default app
