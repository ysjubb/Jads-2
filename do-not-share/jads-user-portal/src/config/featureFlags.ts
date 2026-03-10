// Feature flags for progressive rollout

export interface FeatureFlags {
  BVLOS_WIZARD: boolean
  OPENAIP_LAYERS: boolean
  JEPPESEN_CHARTS: boolean
  BRIEFING_PACK: boolean
  FLEET_MANAGER: boolean
  TRAJECTORY_VIEWER: boolean
  I18N_HINDI: boolean
  EVIDENCE_EXPORT: boolean
  PWA_OFFLINE: boolean
}

const DEFAULT_FLAGS: FeatureFlags = {
  BVLOS_WIZARD: true,
  OPENAIP_LAYERS: true,
  JEPPESEN_CHARTS: true,
  BRIEFING_PACK: true,
  FLEET_MANAGER: true,
  TRAJECTORY_VIEWER: true,
  I18N_HINDI: true,
  EVIDENCE_EXPORT: true,
  PWA_OFFLINE: false,
}

export function getFeatureFlags(): FeatureFlags {
  try {
    const stored = localStorage.getItem('jads-feature-flags')
    if (stored) return { ...DEFAULT_FLAGS, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return DEFAULT_FLAGS
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag]
}
