#!/usr/bin/env node
// ── T12: JADS Demo Telemetry Simulator ──────────────────────────────────
// Replays a CSV telemetry log (or generates synthetic data) as live
// telemetry via the REST API, letting evaluators see the full pipeline
// without a real drone in the air.
//
// Usage:
//   node scripts/demo-simulator.js \
//     --file    scripts/sample-flight.csv \
//     --mission demo-mission-001 \
//     --uin     UA-DEL-0001 \
//     --backend http://localhost:8080 \
//     --token   <jwt> \
//     --speed   1 \
//     --loop    \
//     --violate-at 120
//
// CSV columns: ts,lat,lon,altAGL,altMSL,speedKmh,headingDeg,batteryPct,satelliteCount

const fs   = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const { URL } = require('url')

// ── CLI arg parsing ─────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    file:       null,
    mission:    'demo-mission-001',
    uin:        'UA-DEL-0001',
    backend:    'http://localhost:8080',
    token:      '',
    speed:      1,
    loop:       false,
    violateAt:  -1,      // row index at which to inject an out-of-bounds point
    source:     'SIMULATOR',
  }
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':       opts.file      = args[++i]; break
      case '--mission':    opts.mission   = args[++i]; break
      case '--uin':        opts.uin       = args[++i]; break
      case '--backend':    opts.backend   = args[++i]; break
      case '--token':      opts.token     = args[++i]; break
      case '--speed':      opts.speed     = parseFloat(args[++i]); break
      case '--loop':       opts.loop      = true; break
      case '--violate-at': opts.violateAt = parseInt(args[++i]); break
      case '--source':     opts.source    = args[++i]; break
      default:
        console.error(`Unknown flag: ${args[i]}`)
        process.exit(1)
    }
  }
  if (!opts.token) {
    console.error('ERROR: --token is required. Generate one with: node scripts/generate-demo-token.js')
    process.exit(1)
  }
  return opts
}

// ── CSV reader ──────────────────────────────────────────────────────────
function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const lines = raw.trim().split('\n')
  const header = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const cols = line.split(',')
    const row = {}
    header.forEach((h, i) => { row[h] = cols[i]?.trim() ?? '' })
    return row
  })
}

// ── Synthetic flight generator (if no CSV provided) ─────────────────────
function generateSyntheticTrack(numPoints) {
  // Circular flight around Delhi IGI Airport (28.5562, 77.1000)
  const centerLat = 28.5562
  const centerLon = 77.1000
  const radiusDeg = 0.004   // ~450m
  const points = []
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints
    const lat = centerLat + radiusDeg * Math.cos(angle)
    const lon = centerLon + radiusDeg * Math.sin(angle)
    const heading = ((angle * 180 / Math.PI) + 90) % 360
    points.push({
      ts:             '',  // will be set at send time
      lat:            lat.toFixed(7),
      lon:            lon.toFixed(7),
      altAGL:         (80 + 20 * Math.sin(angle * 2)).toFixed(1),
      altMSL:         (295 + 20 * Math.sin(angle * 2)).toFixed(1),
      speedKmh:       (35 + 5 * Math.sin(angle)).toFixed(1),
      headingDeg:     heading.toFixed(1),
      batteryPct:     Math.max(15, 100 - (i / numPoints) * 85).toFixed(0),
      satelliteCount: (12 + Math.floor(Math.random() * 4)).toString(),
    })
  }
  return points
}

// ── Inject geofence violation at specified row ──────────────────────────
function injectViolation(rows, index) {
  if (index < 0 || index >= rows.length) return
  const row = rows[index]
  // Push 2km north-east — guaranteed to be outside any reasonable geofence
  row.lat = (parseFloat(row.lat) + 0.02).toFixed(7)
  row.lon = (parseFloat(row.lon) + 0.02).toFixed(7)
  row.altAGL = '450'  // above typical 400ft ceiling
  console.log(`  ⚠  Violation injected at row ${index}: lat=${row.lat}, lon=${row.lon}, altAGL=${row.altAGL}`)
}

// ── HTTP POST helper ────────────────────────────────────────────────────
function postTelemetry(backendUrl, missionId, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/missions/${missionId}/telemetry`, backendUrl)
    const isHttps = url.protocol === 'https:'
    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${token}`,
        'X-JADS-Version': '4.0',
      },
    }
    const lib = isHttps ? https : http
    const req = lib.request(options, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        } else {
          resolve(JSON.parse(data))
        }
      })
    })
    req.on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

// ── Main replay loop ────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs()
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║          JADS Demo Telemetry Simulator v4.0         ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log(`  Mission:  ${opts.mission}`)
  console.log(`  UIN:      ${opts.uin}`)
  console.log(`  Backend:  ${opts.backend}`)
  console.log(`  Speed:    ${opts.speed}x`)
  console.log(`  Loop:     ${opts.loop}`)
  console.log()

  let rows
  if (opts.file) {
    console.log(`  Loading CSV: ${opts.file}`)
    rows = readCsv(opts.file)
    console.log(`  Loaded ${rows.length} telemetry points`)
  } else {
    console.log('  No CSV provided — generating 200-point synthetic flight')
    rows = generateSyntheticTrack(200)
  }

  if (opts.violateAt >= 0) {
    injectViolation(rows, opts.violateAt)
  }

  const intervalMs = 500 / opts.speed  // base rate 2 Hz (500ms)
  let iteration = 0

  do {
    iteration++
    console.log(`\n── Replay pass ${iteration} ──────────────────────────────`)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const point = {
        missionId:      opts.mission,
        uin:            opts.uin,
        lat:            parseFloat(row.lat),
        lon:            parseFloat(row.lon),
        altAGL:         parseFloat(row.altAGL),
        altMSL:         parseFloat(row.altMSL  ?? row.altAGL),
        speedKmh:       parseFloat(row.speedKmh ?? '0'),
        headingDeg:     parseFloat(row.headingDeg ?? '0'),
        batteryPct:     parseInt(row.batteryPct ?? '100'),
        satelliteCount: parseInt(row.satelliteCount ?? '0'),
        source:         opts.source,
        ts:             Date.now(),
      }

      try {
        const res = await postTelemetry(opts.backend, opts.mission, opts.token, point)
        const status = res.geofence?.status ?? 'OK'
        const bat = point.batteryPct < 20 ? ' 🔋 LOW' : ''
        process.stdout.write(
          `\r  [${String(i + 1).padStart(3)}/${rows.length}] ` +
          `lat=${point.lat.toFixed(5)} lon=${point.lon.toFixed(5)} ` +
          `alt=${point.altAGL}m spd=${point.speedKmh}km/h ` +
          `bat=${point.batteryPct}% ${status}${bat}   `
        )
      } catch (err) {
        console.error(`\n  ✗ Error at row ${i}: ${err.message}`)
      }

      await sleep(intervalMs)
    }

    console.log('\n  ✓ Pass complete')
  } while (opts.loop)

  console.log('\n  Done.')
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
