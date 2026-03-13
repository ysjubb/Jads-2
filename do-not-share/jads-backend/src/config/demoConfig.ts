// ── T03: Demo / ngrok configuration ──────────────────────────────────────
// When DEMO_MODE=true the backend relaxes CORS and logs the public URL.
// JADS_PUBLIC_URL is the ngrok / tunnelled URL shown to remote viewers.
// JADS_WS_URL is the corresponding WebSocket endpoint.

export const DEMO_CONFIG = {
  /** Master switch — gates all demo-mode behavior */
  enabled: (process.env.DEMO_MODE ?? 'false') === 'true',

  /** Public URL exposed via ngrok (e.g. https://abc123.ngrok-free.app) */
  publicUrl: process.env.JADS_PUBLIC_URL ?? '',

  /** WebSocket URL exposed via ngrok (e.g. wss://abc123.ngrok-free.app/ws/missions) */
  wsUrl: process.env.JADS_WS_URL ?? '',

  /** Extra CORS origins allowed in demo mode (comma-separated) */
  extraOrigins: (process.env.DEMO_CORS_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  /** Default demo mission ID when running the simulator */
  defaultMissionId: process.env.DEMO_MISSION_ID ?? 'demo-mission-001',

  /** Simulator replay speed multiplier (1 = real-time, 10 = 10x) */
  replaySpeed: parseFloat(process.env.DEMO_REPLAY_SPEED ?? '1'),
} as const

/**
 * Returns the CORS origin list, adding demo origins when DEMO_MODE is on.
 * Used by server.ts to expand the allowed origins dynamically.
 */
export function getDemoCorsOrigins(baseOrigins: string[]): string[] {
  if (!DEMO_CONFIG.enabled) return baseOrigins
  return [
    ...baseOrigins,
    ...DEMO_CONFIG.extraOrigins,
    // ngrok free tier sends an interstitial from *.ngrok-free.app
    ...(DEMO_CONFIG.publicUrl ? [DEMO_CONFIG.publicUrl] : []),
  ]
}
