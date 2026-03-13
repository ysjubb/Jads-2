#!/usr/bin/env node
// ── T12: Generate a 30-day demo JWT ─────────────────────────────────────
// Prints a JWT suitable for the demo simulator or Postman testing.
// Uses the JWT_SECRET from .env (or a --secret flag).
//
// Usage:
//   node scripts/generate-demo-token.js
//   node scripts/generate-demo-token.js --role PLATFORM_SUPER_ADMIN --admin
//   node scripts/generate-demo-token.js --secret mySecret123 --days 7

const crypto = require('crypto')
const path   = require('path')

// ── Try to load .env ────────────────────────────────────────────────────
try {
  const envPath = path.join(__dirname, '..', '.env')
  const fs = require('fs')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim()
      }
    }
  }
} catch { /* ignore */ }

// ── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
let secret   = process.env.JWT_SECRET || ''
let role     = 'RPAS_OPERATOR'
let userId   = 'demo-user-001'
let email    = 'demo@jads.gov.in'
let days     = 30
let useAdmin = false

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--secret': secret   = args[++i]; break
    case '--role':   role     = args[++i]; break
    case '--user':   userId   = args[++i]; break
    case '--email':  email    = args[++i]; break
    case '--days':   days     = parseInt(args[++i]); break
    case '--admin':  useAdmin = true; break
    default:
      console.error(`Unknown flag: ${args[i]}`)
      process.exit(1)
  }
}

if (useAdmin) {
  secret = process.env.ADMIN_JWT_SECRET || secret
  if (!role.includes('ADMIN') && !role.includes('AUDITOR')) {
    role = 'GOVT_ADMIN'
  }
}

if (!secret) {
  console.error('ERROR: No JWT secret found. Set JWT_SECRET in .env or pass --secret <value>')
  process.exit(1)
}

// ── Minimal JWT signing (HS256) ─────────────────────────────────────────
function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signJwt(payload, secretKey) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64  = base64url(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)))
  const signature  = crypto
    .createHmac('sha256', secretKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest()
  return `${headerB64}.${payloadB64}.${base64url(signature)}`
}

// ── Build token ─────────────────────────────────────────────────────────
const now = Math.floor(Date.now() / 1000)
const payload = {
  sub:   userId,
  email: email,
  role:  role,
  iat:   now,
  exp:   now + days * 24 * 60 * 60,
  iss:   'jads-demo-generator',
}

const token = signJwt(payload, secret)

console.log()
console.log('╔══════════════════════════════════════════════════════╗')
console.log('║            JADS Demo Token Generator v4.0           ║')
console.log('╚══════════════════════════════════════════════════════╝')
console.log()
console.log(`  Role:    ${role}`)
console.log(`  User:    ${userId}`)
console.log(`  Email:   ${email}`)
console.log(`  Expires: ${new Date((now + days * 86400) * 1000).toISOString()}`)
console.log(`  Secret:  ${useAdmin ? 'ADMIN_JWT_SECRET' : 'JWT_SECRET'}`)
console.log()
console.log('── Token ──────────────────────────────────────────────')
console.log(token)
console.log()
console.log('── Usage ──────────────────────────────────────────────')
console.log(`  # REST API:`)
console.log(`  curl -H "Authorization: Bearer ${token.substring(0, 20)}..." \\`)
console.log(`       -H "X-JADS-Version: 4.0" \\`)
console.log(`       http://localhost:8080/api/missions/demo-mission-001/track/live`)
console.log()
console.log(`  # WebSocket:`)
console.log(`  wscat -c "ws://localhost:8080/ws/missions?token=${token.substring(0, 20)}...&subscribe=demo-mission-001"`)
console.log()
console.log(`  # Demo simulator:`)
console.log(`  node scripts/demo-simulator.js --token ${token.substring(0, 20)}...`)
console.log()
