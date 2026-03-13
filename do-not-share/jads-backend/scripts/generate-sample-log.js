#!/usr/bin/env node
// ── T12: Generate a synthetic 200-point CSV flight log ──────────────────
// Outputs a CSV file that can be replayed by demo-simulator.js.
// Flight path: 500m radius circle around Delhi IGI Airport (28.5562, 77.1000)
//
// Usage:
//   node scripts/generate-sample-log.js > scripts/sample-flight.csv
//   node scripts/generate-sample-log.js --points 300 --radius 800 > custom.csv

const NUM_POINTS_DEFAULT = 200
const RADIUS_M_DEFAULT   = 500

// ── CLI ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
let numPoints = NUM_POINTS_DEFAULT
let radiusM   = RADIUS_M_DEFAULT
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--points') numPoints = parseInt(args[++i])
  if (args[i] === '--radius') radiusM   = parseInt(args[++i])
}

// Delhi IGI Airport center
const CENTER_LAT = 28.5562
const CENTER_LON = 77.1000
const GROUND_ELEV_MSL = 216 // meters MSL at IGI

// Convert radius in meters to approx degrees
const radiusDegLat = radiusM / 111_320
const radiusDegLon = radiusM / (111_320 * Math.cos(CENTER_LAT * Math.PI / 180))

// ── Generate ────────────────────────────────────────────────────────────
const header = 'ts,lat,lon,altAGL,altMSL,speedKmh,headingDeg,batteryPct,satelliteCount'
process.stdout.write(header + '\n')

const startTs = Date.now()

for (let i = 0; i < numPoints; i++) {
  const t = i / numPoints
  const angle = 2 * Math.PI * t

  // Circular path with slight figure-8 wobble
  const wobble = 0.15 * Math.sin(4 * Math.PI * t)
  const lat = CENTER_LAT + radiusDegLat * (1 + wobble) * Math.cos(angle)
  const lon = CENTER_LON + radiusDegLon * (1 + wobble) * Math.sin(angle)

  // Altitude: gentle sine wave between 60m and 110m AGL
  const altAGL = 85 + 25 * Math.sin(angle * 2)
  const altMSL = GROUND_ELEV_MSL + altAGL

  // Speed: 30-45 km/h with variation
  const speedKmh = 37 + 8 * Math.sin(angle * 3)

  // Heading: tangent to the circle
  const headingDeg = ((angle * 180 / Math.PI) + 90 + 360) % 360

  // Battery: linear drain from 98% → 18%
  const batteryPct = Math.round(98 - (80 * t))

  // Satellites: 10-16 with random jitter
  const satelliteCount = 10 + Math.floor(Math.random() * 7)

  // Timestamp: 500ms apart (2Hz)
  const ts = startTs + i * 500

  process.stdout.write(
    `${ts},` +
    `${lat.toFixed(7)},${lon.toFixed(7)},` +
    `${altAGL.toFixed(1)},${altMSL.toFixed(1)},` +
    `${speedKmh.toFixed(1)},${headingDeg.toFixed(1)},` +
    `${batteryPct},${satelliteCount}\n`
  )
}

process.stderr.write(`Generated ${numPoints} points, radius ${radiusM}m around IGI Airport\n`)
