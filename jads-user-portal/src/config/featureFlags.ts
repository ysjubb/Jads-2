/**
 * Feature flags for the JADS user portal.
 * Toggle features without code changes. In production, source from backend config.
 */
export const FEATURE_FLAGS = {
  /** Enable Jeppesen chart integration */
  JEPPESEN_CHARTS_ENABLED: false,
  /** Auto-submit flight plans to DigitalSky */
  DIGITAL_SKY_AUTO_SUBMIT: false,
  /** Enable BVLOS mission filing */
  BVLOS_FILING_ENABLED: true,
  /** Add Q-prefix to purely numeric callsigns */
  NUMERIC_CALLSIGN_Q_PREFIX: true,
  /** Show AIRAC currency warnings */
  AIRAC_CURRENCY_CHECK: true,
  /** Enable live telemetry WebSocket connection */
  LIVE_TELEMETRY_ENABLED: false,
  /** Show evidence chain viewer */
  EVIDENCE_CHAIN_ENABLED: true,
  /** Use live backend adapters (false = stubs) */
  USE_LIVE_ADAPTERS: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
