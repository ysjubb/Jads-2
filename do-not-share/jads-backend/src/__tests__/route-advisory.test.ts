/**
 * RouteAdvisoryService — Unit Tests
 *
 * Tests advisory generation for known Indian ATS airway routes,
 * no-recommendation fallback, speed parsing, flight level advisory
 * (semicircular rule), FIR crossings, and reporting points.
 */

import { RouteAdvisoryService, RouteAdvisory } from '../services/RouteAdvisoryService'

describe('RouteAdvisoryService', () => {
  const service = new RouteAdvisoryService()

  // ── Known route: Delhi → Mumbai (L301) ─────────────────────────────────

  describe('VIDP → VABB (Delhi → Mumbai, L301)', () => {
    let advisory: RouteAdvisory

    beforeAll(() => {
      advisory = service.generateAdvisory({
        adep: 'VIDP',
        ades: 'VABB',
        cruisingLevel: 'F350',
        cruisingSpeed: 'N0480',
      })
    })

    it('should have a recommendation', () => {
      expect(advisory.hasRecommendation).toBe(true)
      expect(advisory.recommended).not.toBeNull()
    })

    it('should recommend airway L301', () => {
      expect(advisory.recommended!.airwayName).toBe('L301')
    })

    it('should include GANDO, PAKER, IGARI, TATIM as reporting points', () => {
      const rpIds = advisory.reportingPoints.map(rp => rp.identifier)
      expect(rpIds).toContain('GANDO')
      expect(rpIds).toContain('PAKER')
      expect(rpIds).toContain('IGARI')
      expect(rpIds).toContain('TATIM')
    })

    it('should have segments with valid distances', () => {
      expect(advisory.recommended!.segments.length).toBeGreaterThan(0)
      for (const seg of advisory.recommended!.segments) {
        expect(seg.distanceNm).toBeGreaterThan(0)
        expect(seg.eetMinutes).toBeGreaterThanOrEqual(0)
        expect(seg.magneticTrackDeg).toBeGreaterThanOrEqual(0)
        expect(seg.magneticTrackDeg).toBeLessThan(360)
      }
    })

    it('should have total distance > 500 NM (Delhi-Mumbai is ~590 NM via airways)', () => {
      expect(advisory.recommended!.totalDistanceNm).toBeGreaterThan(500)
      expect(advisory.recommended!.totalDistanceNm).toBeLessThan(900)
    })

    it('should have total EET > 0', () => {
      expect(advisory.recommended!.totalEetMinutes).toBeGreaterThan(0)
    })

    it('should include a direct route comparison', () => {
      expect(advisory.directRoute.totalDistanceNm).toBeGreaterThan(0)
      expect(advisory.directRoute.routeString).toBe('VIDP DCT VABB')
    })

    it('should have FIR crossings', () => {
      expect(advisory.firCrossings.length).toBeGreaterThan(0)
      const firCodes = advisory.firCrossings.map(f => f.firCode)
      // Delhi→Mumbai crosses at least VIDF and VABB FIRs
      expect(firCodes).toContain('VIDF')
    })
  })

  // ── Known route: Delhi → Kolkata (G204) ────────────────────────────────

  describe('VIDP → VECC (Delhi → Kolkata, G204)', () => {
    let advisory: RouteAdvisory

    beforeAll(() => {
      advisory = service.generateAdvisory({
        adep: 'VIDP',
        ades: 'VECC',
        cruisingLevel: 'F330',
        cruisingSpeed: 'N0450',
      })
    })

    it('should recommend airway G204', () => {
      expect(advisory.hasRecommendation).toBe(true)
      expect(advisory.recommended!.airwayName).toBe('G204')
    })

    it('should include waypoints between VIDP and VECC', () => {
      const wpIds = advisory.recommended!.waypoints.map(w => w.identifier)
      expect(wpIds[0]).toBe('VIDP')
      expect(wpIds[wpIds.length - 1]).toBe('VECC')
    })
  })

  // ── No-recommendation fallback ─────────────────────────────────────────

  describe('No-recommendation fallback (obscure pair)', () => {
    let advisory: RouteAdvisory

    beforeAll(() => {
      advisory = service.generateAdvisory({
        adep: 'VILK',   // Lucknow
        ades: 'VIAR',   // Tirupati — unlikely to have a defined airway
        cruisingLevel: 'F350',
        cruisingSpeed: 'N0450',
      })
    })

    it('should have no recommendation', () => {
      expect(advisory.hasRecommendation).toBe(false)
      expect(advisory.recommended).toBeNull()
    })

    it('should still provide direct route', () => {
      expect(advisory.directRoute.routeString).toBe('VILK DCT VIAR')
      expect(advisory.directRoute.totalDistanceNm).toBeGreaterThan(0)
    })

    it('should still provide flight level advisory', () => {
      expect(advisory.flightLevelAdvisory.requestedLevel).toBe('F350')
      expect(typeof advisory.flightLevelAdvisory.isCompliant).toBe('boolean')
    })
  })

  // ── Flight level advisory (semicircular rule) ──────────────────────────

  describe('Flight level advisory — semicircular rule', () => {
    it('should flag eastbound FL320 as non-compliant (needs ODD FL)', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'VECC',  // eastbound track
        cruisingLevel: 'F320', cruisingSpeed: 'N0450',
      })
      // VIDP→VECC is roughly eastbound, so FL320 (even) should be non-compliant
      expect(advisory.flightLevelAdvisory.direction).toBe('EASTBOUND')
      expect(advisory.flightLevelAdvisory.isCompliant).toBe(false)
    })

    it('should accept eastbound FL350 as compliant (ODD FL)', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'VECC',
        cruisingLevel: 'F350', cruisingSpeed: 'N0450',
      })
      expect(advisory.flightLevelAdvisory.isCompliant).toBe(true)
    })

    it('should handle VFR as always compliant', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'VABB',
        cruisingLevel: 'VFR', cruisingSpeed: 'N0120',
      })
      expect(advisory.flightLevelAdvisory.isCompliant).toBe(true)
      expect(advisory.flightLevelAdvisory.recommendedLevel).toBe('VFR')
    })
  })

  // ── Speed parsing ──────────────────────────────────────────────────────

  describe('Speed parsing edge cases', () => {
    it('should handle K (km/h) speed indicator', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'VABB',
        cruisingLevel: 'F350', cruisingSpeed: 'K0890',
      })
      // K0890 → ~480 kts → should yield reasonable EET
      expect(advisory.directRoute.totalEetMinutes).toBeGreaterThan(30)
      expect(advisory.directRoute.totalEetMinutes).toBeLessThan(200)
    })

    it('should handle M (Mach) speed indicator', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'VABB',
        cruisingLevel: 'F350', cruisingSpeed: 'M080',
      })
      // M080 → ~480 kts → similar EET to N0480
      expect(advisory.directRoute.totalEetMinutes).toBeGreaterThan(0)
    })

    it('should use default speed for empty input', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'VABB',
        cruisingLevel: 'F350', cruisingSpeed: '',
      })
      expect(advisory.directRoute.totalEetMinutes).toBeGreaterThan(0)
    })
  })

  // ── Unknown aerodromes ─────────────────────────────────────────────────

  describe('Unknown aerodrome handling', () => {
    it('should return no-recommendation for unknown ADEP', () => {
      const advisory = service.generateAdvisory({
        adep: 'ZZZZ', ades: 'VABB',
        cruisingLevel: 'F350', cruisingSpeed: 'N0450',
      })
      expect(advisory.hasRecommendation).toBe(false)
      expect(advisory.directRoute.totalDistanceNm).toBe(0)
    })

    it('should return no-recommendation for unknown ADES', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'ZZZZ',
        cruisingLevel: 'F350', cruisingSpeed: 'N0450',
      })
      expect(advisory.hasRecommendation).toBe(false)
    })
  })

  // ── Reporting points ───────────────────────────────────────────────────

  describe('Reporting points', () => {
    it('should have monotonically increasing distances from departure', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'VABB',
        cruisingLevel: 'F350', cruisingSpeed: 'N0480',
      })
      const dists = advisory.reportingPoints.map(rp => rp.distanceFromDepNm)
      for (let i = 1; i < dists.length; i++) {
        expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1])
      }
    })

    it('should not include aerodromes as reporting points', () => {
      const advisory = service.generateAdvisory({
        adep: 'VIDP', ades: 'VABB',
        cruisingLevel: 'F350', cruisingSpeed: 'N0480',
      })
      const rpIds = advisory.reportingPoints.map(rp => rp.identifier)
      expect(rpIds).not.toContain('VIDP')
      expect(rpIds).not.toContain('VABB')
    })
  })
})
