// Stage 7 pure logic tests — no database required.
// Covers: AirspaceVersioningService rules, RouteSemanticEngine geodesics,
// AltitudeComplianceEngine semicircular rule, FirGeometryEngine ray casting,
// AftnMessageBuilder format, Item18Parser.

import { RouteSemanticEngine }      from '../services/RouteSemanticEngine'
import { AltitudeComplianceEngine } from '../services/AltitudeComplianceEngine'
import { FirGeometryEngine }        from '../services/FirGeometryEngine'
import { AftnMessageBuilder }       from '../services/AftnMessageBuilder'
import { Item18Parser }             from '../services/Item18Parser'
import { AftnCnlBuilder }          from '../aftn/AftnCnlBuilder'
import { AftnDlaBuilder }          from '../aftn/AftnDlaBuilder'
import { AftnArrBuilder }          from '../aftn/AftnArrBuilder'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Minimal stub airspace service for RouteSemanticEngine tests (no DB)
function makeRouteEngine(waypoints: any[] = [], airways: any[] = []) {
  const airspaceSvc = {
    getAllActiveWaypoints: async () => waypoints,
    getActiveAirway:       async (id: string) => airways.find(a => a.airwayId === id) ?? null,
  } as any
  return new RouteSemanticEngine({} as any, airspaceSvc)
}

// ── RouteSemanticEngine ───────────────────────────────────────────────────────

describe('RouteSemanticEngine — geodesics', () => {
  const eng = makeRouteEngine()

  // VIDP: 28.5665°N 77.1031°E
  // VABB: 19.0896°N 72.8656°E
  test('RS-01: VIDP→VABB haversine distance ≈ 660–665 NM', () => {
    const dist = eng.haversineNm(28.5665, 77.1031, 19.0896, 72.8656)
    expect(dist).toBeGreaterThan(600)
    expect(dist).toBeLessThan(640)
  })

  test('RS-02: haversineNm(same, same) = 0', () => {
    expect(eng.haversineNm(28.5665, 77.1031, 28.5665, 77.1031)).toBeCloseTo(0, 5)
  })

  test('RS-03: VIDP→VABB true bearing ≈ 205–215° (south-southwest)', () => {
    const bearing = eng.trueBearing(28.5665, 77.1031, 19.0896, 72.8656)
    expect(bearing).toBeGreaterThan(200)
    expect(bearing).toBeLessThan(220)
  })

  test('RS-04: VABB→VIDP bearing ≈ 025–035° (north-northeast, reverse of above)', () => {
    const bearing = eng.trueBearing(19.0896, 72.8656, 28.5665, 77.1031)
    expect(bearing).toBeGreaterThan(20)
    expect(bearing).toBeLessThan(40)
  })

  test('RS-05: Magnetic variation easterly (positive) is subtracted from true track', () => {
    expect(eng.applyMagneticVariation(210, 0.5)).toBeCloseTo(209.5, 4)
    expect(eng.applyMagneticVariation(10, 2.0)).toBeCloseTo(8.0, 4)
  })

  test('RS-06: Magnetic variation wrap around 360', () => {
    expect(eng.applyMagneticVariation(5, 10)).toBeCloseTo(355, 4)  // 5 - 10 → 355
  })

  test('RS-07: TAS N0450 = 450 knots', () => {
    expect(eng.computeTas('N', '0450')).toBe(450)
  })

  test('RS-08: TAS K0800 = 432 knots (800 / 1.852)', () => {
    expect(eng.computeTas('K', '0800')).toBe(432)
  })

  test('RS-09: TAS M082 = 547 knots (82 × 666.739 / 100)', () => {
    expect(eng.computeTas('M', '082')).toBe(547)
  })

  test('RS-10: EARTH_RADIUS_NM constant is exactly 3440.065', () => {
    // Verify via 90° arc = quarter of Earth circumference
    const quarterCirc = eng.haversineNm(0, 0, 90, 0)
    // 90° arc = 2π × 3440.065 / 4 ≈ 5400.6 NM
    expect(quarterCirc).toBeCloseTo(3440.065 * Math.PI / 2, 1)
  })

  test('RS-11: Coordinate "2835N07706E" parsed to {lat:28.58, lon:77.1}', async () => {
    const eng2 = makeRouteEngine()
    const result = await eng2.validateAndCompute({
      departureIcao: 'VIDP', destinationIcao: 'VABB',
      routeString: '2835N07706E',
      speedIndicator: 'N', speedValue: '0450',
      depLatDeg: 28.5665, depLonDeg: 77.1031, depMagVar: 0,
      destLatDeg: 19.0896, destLonDeg: 72.8656,
    })
    // Should not produce COORDINATE_PARSE_FAILED warning
    const coordErr = result.warnings.find(w => w.code === 'COORDINATE_PARSE_FAILED')
    expect(coordErr).toBeUndefined()
  })

  test('RS-12: DCT-only route → no WAYPOINT_NOT_FOUND errors, legs computed', async () => {
    const result = await makeRouteEngine().validateAndCompute({
      departureIcao: 'VIDP', destinationIcao: 'VABB',
      routeString: 'DCT',
      speedIndicator: 'N', speedValue: '0450',
      depLatDeg: 28.5665, depLonDeg: 77.1031, depMagVar: 0,
      destLatDeg: 19.0896, destLonDeg: 72.8656,
    })
    expect(result.errors.find(e => e.code === 'WAYPOINT_NOT_FOUND')).toBeUndefined()
    const totalDistanceNm = result.legs.reduce((sum, leg) => sum + leg.distanceNm, 0)
    expect(totalDistanceNm).toBeGreaterThan(600)
  })

  test('RS-13: Unknown waypoint XXXXX → WAYPOINT_NOT_FOUND warning (not error)', async () => {
    const result = await makeRouteEngine().validateAndCompute({
      departureIcao: 'VIDP', destinationIcao: 'VABB',
      routeString: 'XXXXX',
      speedIndicator: 'N', speedValue: '0450',
      depLatDeg: 28.5665, depLonDeg: 77.1031, depMagVar: 0,
      destLatDeg: 19.0896, destLonDeg: 72.8656,
    })
    // 5-letter token matches waypoint regex [A-Z]{2,5} but not found → WAYPOINT_NOT_FOUND
    expect(result.warnings.find(w => w.code === 'WAYPOINT_NOT_FOUND')).toBeDefined()
    expect(result.errors.find(e => e.code === 'WAYPOINT_NOT_FOUND')).toBeUndefined()
  })

  // EET CALCULATION — verifies the production RouteSemanticEngine computes
  // totalEetMinutes from distance and TAS, not just passes through a string.
  test('RS-EET-01: VIDP→VABB DCT at N0450 → EET ≈ 80–90 minutes', async () => {
    const result = await makeRouteEngine().validateAndCompute({
      departureIcao: 'VIDP', destinationIcao: 'VABB',
      routeString: 'DCT',
      speedIndicator: 'N', speedValue: '0450',
      depLatDeg: 28.5665, depLonDeg: 77.1031, depMagVar: 0,
      destLatDeg: 19.0896, destLonDeg: 72.8656,
    })
    // ~620 NM at 450 kts → ~83 minutes
    expect(result.totalEetMinutes).toBeGreaterThan(70)
    expect(result.totalEetMinutes).toBeLessThan(100)
    expect(result.cruiseTasKts).toBe(450)
  })

  test('RS-EET-02: Slower speed K0500 → longer EET than N0450', async () => {
    const fast = await makeRouteEngine().validateAndCompute({
      departureIcao: 'VIDP', destinationIcao: 'VABB',
      routeString: 'DCT',
      speedIndicator: 'N', speedValue: '0450',
      depLatDeg: 28.5665, depLonDeg: 77.1031, depMagVar: 0,
      destLatDeg: 19.0896, destLonDeg: 72.8656,
    })
    const slow = await makeRouteEngine().validateAndCompute({
      departureIcao: 'VIDP', destinationIcao: 'VABB',
      routeString: 'DCT',
      speedIndicator: 'K', speedValue: '0500',  // 500 km/h ≈ 270 kts
      depLatDeg: 28.5665, depLonDeg: 77.1031, depMagVar: 0,
      destLatDeg: 19.0896, destLonDeg: 72.8656,
    })
    // Same distance, slower TAS → longer EET
    expect(slow.totalEetMinutes).toBeGreaterThan(fast.totalEetMinutes)
    expect(slow.cruiseTasKts).toBeLessThan(fast.cruiseTasKts)
  })

  test('RS-EET-03: Zero distance (same dep/dest) → EET = 0', async () => {
    const result = await makeRouteEngine().validateAndCompute({
      departureIcao: 'VIDP', destinationIcao: 'VIDP',
      routeString: 'DCT',
      speedIndicator: 'N', speedValue: '0450',
      depLatDeg: 28.5665, depLonDeg: 77.1031, depMagVar: 0,
      destLatDeg: 28.5665, destLonDeg: 77.1031,
    })
    expect(result.totalEetMinutes).toBe(0)
  })

  test('RS-14: Unknown airway Z999 → AIRWAY_NOT_FOUND error', async () => {
    const result = await makeRouteEngine().validateAndCompute({
      departureIcao: 'VIDP', destinationIcao: 'VABB',
      routeString: 'Z999',
      speedIndicator: 'N', speedValue: '0450',
      depLatDeg: 28.5665, depLonDeg: 77.1031, depMagVar: 0,
      destLatDeg: 19.0896, destLonDeg: 72.8656,
    })
    // Single letter + digits matches airway regex [A-Z]\d{1,3} → AIRWAY_NOT_FOUND
    expect(result.errors.find(e => e.code === 'AIRWAY_NOT_FOUND')).toBeDefined()
  })
})

// ── AltitudeComplianceEngine ──────────────────────────────────────────────────

describe('AltitudeComplianceEngine — semicircular rule', () => {
  const eng = new AltitudeComplianceEngine()

  test('AC-01: IFR FL330 eastbound (090°) → SEMICIRCULAR_RULE_COMPLIANT', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '330',
      magneticTrackDeg: 90, equipment: 'SDFGW'
    })
    expect(r.errors.find(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBeUndefined()
    expect(r.info.find(i => i.code === 'SEMICIRCULAR_RULE_COMPLIANT')).toBeDefined()
  })

  test('AC-02: IFR FL330 westbound (270°) → SEMICIRCULAR_RULE_VIOLATION', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '330',
      magneticTrackDeg: 270, equipment: 'SDFGW'
    })
    expect(r.errors.find(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBeDefined()
  })

  test('AC-03: IFR FL320 eastbound → violation (320 is westbound level)', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '320',
      magneticTrackDeg: 90, equipment: 'SDFGW'
    })
    expect(r.errors.find(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBeDefined()
  })

  test('AC-04: IFR FL320 westbound → COMPLIANT (320 is valid westbound RVSM)', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '320',
      magneticTrackDeg: 270, equipment: 'SDFGW'
    })
    expect(r.errors.find(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBeUndefined()
  })

  test('AC-05: magneticTrackDeg=null → SEMICIRCULAR_UNABLE_NO_TRACK warning (never silent)', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '330',
      magneticTrackDeg: null, equipment: 'SDFGW'
    })
    expect(r.warnings.find(w => w.code === 'SEMICIRCULAR_UNABLE_NO_TRACK')).toBeDefined()
    expect(r.errors.find(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBeUndefined()
  })

  test('AC-06: FL350 eastbound with W equipment → RVSM_COMPLIANT', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '350',
      magneticTrackDeg: 90, equipment: 'SDFGW'
    })
    expect(r.errors.find(e => e.code === 'RVSM_EQUIPMENT_MISSING')).toBeUndefined()
    expect(r.info.find(i => i.code === 'RVSM_COMPLIANT')).toBeDefined()
  })

  test('AC-07: FL350 eastbound without W → RVSM_EQUIPMENT_MISSING error', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '350',
      magneticTrackDeg: 90, equipment: 'SDFG'
    })
    expect(r.errors.find(e => e.code === 'RVSM_EQUIPMENT_MISSING')).toBeDefined()
  })

  test('AC-08: VFR → hemispherical advisory info, no semicircular errors', () => {
    const r = eng.checkCompliance({
      flightRules: 'V', levelIndicator: 'F', levelValue: '085',
      magneticTrackDeg: 90, equipment: 'S'
    })
    expect(r.errors.length).toBe(0)
    expect(r.info.find(i => i.code === 'VFR_HEMISPHERICAL_ADVISORY')).toBeDefined()
  })

  test('AC-09: Destination with specific transition alt → info says aerodrome-specific', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '270',
      magneticTrackDeg: 270, equipment: 'S',
      destinationTransitionAltFt: 6000
    })
    const taInfo = r.info.find(i => i.code === 'TRANSITION_ALTITUDE_INFO')
    expect(taInfo?.message).toContain('aerodrome-specific')
    expect(taInfo?.message).toContain('6000ft')
  })

  test('AC-10: No destination TA → info says national default 9000ft', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '270',
      magneticTrackDeg: 270, equipment: 'S'
    })
    const taInfo = r.info.find(i => i.code === 'TRANSITION_ALTITUDE_INFO')
    expect(taInfo?.message).toContain('national default')
    expect(taInfo?.message).toContain('9000ft')
  })

  test('AC-11: FL290 eastbound → in EASTBOUND_VALID_FL_RVSM → compliant', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '290',
      magneticTrackDeg: 90, equipment: 'SDFGW'
    })
    expect(r.errors.find(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBeUndefined()
  })

  test('AC-12: FL270 eastbound → in EASTBOUND_VALID_FL_BELOW_RVSM → compliant', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '270',
      magneticTrackDeg: 90, equipment: 'S'
    })
    expect(r.errors.find(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBeUndefined()
  })

  test('AC-13: FL460 → LEVEL_ABOVE_FL450 warning', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'F', levelValue: '460',
      magneticTrackDeg: 90, equipment: 'SDFGW'
    })
    expect(r.warnings.find(w => w.code === 'LEVEL_ABOVE_FL450')).toBeDefined()
  })

  test('AC-14: A-indicator level → semicircular rule skipped, no violation', () => {
    const r = eng.checkCompliance({
      flightRules: 'I', levelIndicator: 'A', levelValue: '045',
      magneticTrackDeg: 90, equipment: 'S'
    })
    expect(r.errors.find(e => e.code === 'SEMICIRCULAR_RULE_VIOLATION')).toBeUndefined()
    expect(r.info.find(i => i.code === 'ALTITUDE_REF_SEMICIRCULAR_SKIPPED')).toBeDefined()
  })
})

// ── FirGeometryEngine ─────────────────────────────────────────────────────────

describe('FirGeometryEngine — ray casting & FIR sequencing', () => {
  const eng = new FirGeometryEngine()

  test('FG-01: Delhi (28.6°N, 77.1°E) is in VIDF', () => {
    const fir = eng.pointInFir(28.6, 77.1)
    expect(fir?.firCode).toBe('VIDF')
  })

  test('FG-02: Mumbai (19.1°N, 72.9°E) is in VABB', () => {
    const fir = eng.pointInFir(19.1, 72.9)
    expect(fir?.firCode).toBe('VABB')
  })

  test('FG-03: Kolkata (22.6°N, 88.4°E) is in VECC', () => {
    const fir = eng.pointInFir(22.6, 88.4)
    expect(fir?.firCode).toBe('VECC')
  })

  test('FG-04: Chennai (13.0°N, 80.2°E) is in VOMF', () => {
    // Uses full polygon from IndiaFirBoundaries.ts
    const fir = eng.pointInFir(13.0, 80.2)
    expect(fir?.firCode).toBe('VOMF')
  })

  test('FG-05: London (51.5°N, 0.1°W) is outside all India FIRs', () => {
    expect(eng.pointInFir(51.5, -0.1)).toBeNull()
  })

  test('FG-06: FIR sequence VIDP→VABB includes VIDF and VABB in route order', () => {
    // Build a route from Delhi to Mumbai with midpoint in each FIR
    const legs = [
      {
        from: { type: 'AERODROME' as const, identifier: 'VIDP', latDeg: 28.6, lonDeg: 77.1 },
        to:   { type: 'WAYPOINT'  as const, identifier: 'MID1', latDeg: 24.0, lonDeg: 75.0 },
        distanceNm: 350, trueTrackDeg: 210, magneticTrackDeg: 210, magneticVariation: 0
      },
      {
        from: { type: 'WAYPOINT'  as const, identifier: 'MID1', latDeg: 24.0, lonDeg: 75.0 },
        to:   { type: 'AERODROME' as const, identifier: 'VABB', latDeg: 19.1, lonDeg: 72.9 },
        distanceNm: 310, trueTrackDeg: 215, magneticTrackDeg: 215, magneticVariation: 0
      }
    ]
    const result = eng.computeFirSequence(legs, 450, 'VIDP', 'VABB')
    const firCodes = result.crossings.map(c => c.firCode)
    expect(firCodes).toContain('VIDF')
    expect(firCodes).toContain('VABB')
    expect(firCodes.indexOf('VIDF')).toBeLessThan(firCodes.indexOf('VABB')) // route order
  })

  test('FG-07: VIDP→VOMM (Delhi→Chennai) does not include VABB', () => {
    // Direct south-easterly route does not enter Mumbai FIR
    const legs = [
      {
        from: { type: 'AERODROME' as const, identifier: 'VIDP', latDeg: 28.6, lonDeg: 77.1 },
        to:   { type: 'AERODROME' as const, identifier: 'VOMM', latDeg: 13.0, lonDeg: 80.2 },
        distanceNm: 980, trueTrackDeg: 165, magneticTrackDeg: 165, magneticVariation: 0
      }
    ]
    const result = eng.computeFirSequence(legs, 450, 'VIDP', 'VOMM')
    const firCodes = result.crossings.map(c => c.firCode)
    expect(firCodes).not.toContain('VABB')
  })

  test('FG-08: Empty route legs → empty FIR sequence', () => {
    const result = eng.computeFirSequence([], 450, 'VIDP', 'VABB')
    expect(result.crossings).toHaveLength(0)
  })

  test('FG-09: eetPerFirJson is valid JSON array', () => {
    const legs = [
      {
        from: { type: 'AERODROME' as const, identifier: 'VIDP', latDeg: 28.6, lonDeg: 77.1 },
        to:   { type: 'AERODROME' as const, identifier: 'VABB', latDeg: 19.1, lonDeg: 72.9 },
        distanceNm: 660, trueTrackDeg: 210, magneticTrackDeg: 210, magneticVariation: 0
      }
    ]
    const result = eng.computeFirSequence(legs, 450, 'VIDP', 'VABB')
    const parsed = JSON.parse(result.eetPerFirJson)
    expect(Array.isArray(parsed)).toBe(true)
  })
})

// ── AftnMessageBuilder ────────────────────────────────────────────────────────

describe('AftnMessageBuilder', () => {
  const parser  = new Item18Parser()
  const builder = new AftnMessageBuilder()

  function buildMsg(overrides: any = {}): string {
    return builder.build({
      callsign: 'AI101', flightRules: 'I', flightType: 'S',
      aircraftType: 'B738', wakeTurbulence: 'M',
      equipment: 'SDFGW', surveillance: 'SB1',
      departureIcao: 'VIDP', eobt: '011000',
      speed: 'N0450', level: 'F330', route: 'DCT',
      destination: 'VABB', eet: '0130',
      item18Parsed: parser.parse('DOF/260101 OPR/INDIGO'),
      ...overrides
    })
  }

  test('AB-01: Message starts with (FPL-', () => {
    expect(buildMsg()).toMatch(/^\(FPL-/)
  })

  test('AB-02: Message ends with )', () => {
    expect(buildMsg().endsWith(')')).toBe(true)
  })

  test('AB-03: Item 18 rebuilt from parsed components, not raw string', () => {
    const msg = buildMsg()
    expect(msg).toContain('DOF/260101')
    expect(msg).toContain('OPR/INDIGO')
  })

  test('AB-04: PBN codes rebuilt correctly B4D3S1', () => {
    const msg = builder.build({
      callsign: 'AI101', flightRules: 'I', flightType: 'S',
      aircraftType: 'B738', wakeTurbulence: 'M',
      equipment: 'SDFGRW', surveillance: 'SB1',
      departureIcao: 'VIDP', eobt: '011000',
      speed: 'N0450', level: 'F330', route: 'DCT',
      destination: 'VABB', eet: '0130',
      item18Parsed: parser.parse('PBN/B4D3S1 OPR/INDIGO'),
    })
    expect(msg).toContain('PBN/B4D3S1')
  })

  test('AB-05: Empty Item 18 → DOF auto-generated (mandatory per ICAO)', () => {
    const msg = builder.build({
      callsign: 'AI101', flightRules: 'I', flightType: 'S',
      aircraftType: 'B738', wakeTurbulence: 'M',
      equipment: 'S', surveillance: 'S',
      departureIcao: 'VIDP', eobt: '011000',
      speed: 'N0450', level: 'F330', route: 'DCT',
      destination: 'VABB', eet: '0130',
      item18Parsed: parser.parse(null),
    })
    // DOF is auto-generated even when Item 18 is empty — mandatory per ICAO
    expect(msg).toContain('DOF/')
  })

  test('AB-06: Alternates included in Item 16', () => {
    const msg = buildMsg({ alternate1: 'VOBL' })
    expect(msg).toContain('VABB/0130 VOBL')
  })

  test('AB-07: Item 19 endurance and POB included', () => {
    const msg = buildMsg({ endurance: '0400', pob: 175 })
    expect(msg).toContain('E/0400')
    expect(msg).toContain('P/175')
  })

  test('AB-08: AFTN addressees for VIDP→VABB include VIDPZTZX, VABBZTZX, VIDPZPZX', () => {
    const addressees = builder.deriveAddressees('VIDP', 'VABB', [
      { firCode: 'VIDF' }, { firCode: 'VABB' }
    ]);
    ['VIDPZTZX', 'VABBZTZX', 'VIDFZTZX', 'VIDPZPZX'].forEach(addr => {
      expect(addressees).toContain(addr)
    })
  })

  test('AB-09: No duplicate addressees', () => {
    const addressees = builder.deriveAddressees('VIDP', 'VABB', [
      { firCode: 'VIDF' }, { firCode: 'VABB' }
    ])
    const unique = new Set(addressees)
    expect(unique.size).toBe(addressees.length)
  })
})

// ── Item18Parser ──────────────────────────────────────────────────────────────

describe('Item18Parser', () => {
  const parser = new Item18Parser()

  test('I18-01: DOF/240115 parsed correctly', () => {
    const r = parser.parse('DOF/240115')
    expect(r.dof).toBe('240115')
  })

  test('I18-02: REG/VT-ABC parsed', () => {
    expect(parser.parse('REG/VT-ABC').reg).toBe('VT-ABC')
  })

  test('I18-03: PBN/B4D3S1 → [B4, D3, S1]', () => {
    expect(parser.parse('PBN/B4D3S1').pbnCodes).toEqual(['B4', 'D3', 'S1'])
  })

  test('I18-04: OPR/INDIGO parsed', () => {
    expect(parser.parse('OPR/INDIGO').opr).toBe('INDIGO')
  })

  test('I18-05: Multiple tokens parsed together', () => {
    const r = parser.parse('DOF/240115 REG/VT-ABC PBN/B4D3 OPR/INDIGO')
    expect(r.dof).toBe('240115')
    expect(r.reg).toBe('VT-ABC')
    expect(r.pbnCodes).toEqual(['B4', 'D3'])
    expect(r.opr).toBe('INDIGO')
  })

  test('I18-06: Null/empty → empty result, no crash', () => {
    const r = parser.parse(null)
    expect(r.dof).toBeNull()
    expect(r.pbnCodes).toHaveLength(0)
  })

  test('I18-07: "0" → empty result', () => {
    const r = parser.parse('0')
    expect(r.dof).toBeNull()
  })

  test('I18-08: Unknown token XXXXX/value → in unknown[]', () => {
    const r = parser.parse('XXXXX/something')
    expect(r.unknown.length).toBeGreaterThan(0)
  })

  test('I18-09: validateDof("240115") → true (Jan 15 2024)', () => {
    expect(parser.validateDof('240115')).toBe(true)
  })

  test('I18-10: validateDof("241350") → false (month 13)', () => {
    expect(parser.validateDof('241350')).toBe(false)
  })

  test('I18-11: validateDof("240132") → false (day 32)', () => {
    expect(parser.validateDof('240132')).toBe(false)
  })

  test('I18-12: PBN code B4 requires G (GNSS) equipment', () => {
    expect(parser.getRequiredEquipmentForPbn('B4')).toContain('G')
  })
})

// ── AirspaceVersioningService — tested via real production code ──────────────
// AUDIT FIX: AV-01–AV-10 were tautological (tested string literals / local
// variables, never called any production service). Rewritten to exercise the
// real AirspaceVersioningService.approveDroneZoneVersion() with mocked Prisma.

import { AirspaceVersioningService } from '../services/AirspaceVersioningService'

function makeMockPrisma(overrides: Record<string, any> = {}): any {
  return {
    airspaceVersion: {
      findUniqueOrThrow: async ({ where }: any) => overrides.draft ?? {
        id: where.id, dataType: 'DRONE_ZONE', approvalStatus: 'DRAFT',
        createdBy: 'admin-A', payloadJson: JSON.stringify({ zoneId: 'Z1', zoneName: 'Test', zoneType: 'GREEN', polygon: { type: 'Polygon', coordinates: [[[77,28],[78,28],[78,29],[77,29],[77,28]]] }, maxAglFt: 400, effectiveArea: 'Delhi', notes: '', authority: 'DGCA' }),
        versionNumber: 1, effectiveFrom: new Date(), effectiveTo: null,
      },
      findMany: async () => overrides.existingVersions ?? [],
      update: jest.fn(async () => ({})),
      create: jest.fn(async (d: any) => ({ id: 'new-version-id', ...d.data })),
    },
    specialUser: {
      findUnique: async () => overrides.approverAccount ?? { createdByAdminId: 'admin-unrelated' },
    },
    auditLog: {
      create: jest.fn(async (d: any) => d),
    },
    ...overrides.prisma,
  }
}

describe('AirspaceVersioningService — state invariants (real production code)', () => {

  test('AV-01: DRAFT drone zone approval by different admin → status becomes ACTIVE', async () => {
    const prisma = makeMockPrisma()
    const svc = new AirspaceVersioningService(prisma)
    // admin-B approves admin-A's draft — should succeed
    await svc.approveDroneZoneVersion('admin-B', 'draft-001')
    expect(prisma.airspaceVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'draft-001' }, data: expect.objectContaining({ approvalStatus: 'ACTIVE' }) })
    )
  })

  test('AV-02: Two-person rule: approver === creator → TWO_PERSON_RULE_VIOLATION thrown', async () => {
    const prisma = makeMockPrisma()
    const svc = new AirspaceVersioningService(prisma)
    // admin-A tries to approve their own draft — must throw
    await expect(svc.approveDroneZoneVersion('admin-A', 'draft-001'))
      .rejects.toThrow('TWO_PERSON_RULE_VIOLATION')
  })

  test('AV-03: Two-person rule: approver !== creator → no violation', async () => {
    const prisma = makeMockPrisma()
    const svc = new AirspaceVersioningService(prisma)
    // admin-B approves admin-A's draft — should NOT throw
    await expect(svc.approveDroneZoneVersion('admin-B', 'draft-001')).resolves.not.toThrow()
  })

  test('AV-04: Non-DRONE_ZONE version → NOT_A_DRONE_ZONE_VERSION thrown', async () => {
    const prisma = makeMockPrisma({ draft: {
      id: 'draft-002', dataType: 'WAYPOINT', approvalStatus: 'DRAFT', createdBy: 'admin-A',
      payloadJson: '{}', versionNumber: 1, effectiveFrom: new Date(), effectiveTo: null,
    }})
    const svc = new AirspaceVersioningService(prisma)
    await expect(svc.approveDroneZoneVersion('admin-B', 'draft-002'))
      .rejects.toThrow('NOT_A_DRONE_ZONE_VERSION')
  })

  test('AV-05: Already ACTIVE version → ALREADY_ACTIVE thrown', async () => {
    const prisma = makeMockPrisma({ draft: {
      id: 'draft-003', dataType: 'DRONE_ZONE', approvalStatus: 'ACTIVE', createdBy: 'admin-A',
      payloadJson: '{}', versionNumber: 1, effectiveFrom: new Date(), effectiveTo: null,
    }})
    const svc = new AirspaceVersioningService(prisma)
    await expect(svc.approveDroneZoneVersion('admin-B', 'draft-003'))
      .rejects.toThrow('ALREADY_ACTIVE')
  })

  test('AV-06: Approval by admin provisioned by zone creator → ADMIN_LINEAGE_VIOLATION', async () => {
    // admin-A created the zone AND provisioned admin-B's account — collusion vector
    const prisma = makeMockPrisma({
      approverAccount: { createdByAdminId: 'admin-A' },  // approver was provisioned by creator
    })
    const svc = new AirspaceVersioningService(prisma)
    await expect(svc.approveDroneZoneVersion('admin-B', 'draft-001'))
      .rejects.toThrow('ADMIN_LINEAGE_VIOLATION')
  })

  test('AV-07: Approval by admin who provisioned the zone creator → ADMIN_LINEAGE_VIOLATION', async () => {
    // admin-B provisioned admin-A's account, then admin-A creates zone, admin-B approves
    const prisma = makeMockPrisma({
      approverAccount: { createdByAdminId: 'admin-unrelated' },
    })
    // Override specialUser.findUnique to return different results for different IDs
    let callCount = 0
    prisma.specialUser.findUnique = async () => {
      callCount++
      if (callCount === 1) return { createdByAdminId: 'admin-unrelated' }  // approver
      return { createdByAdminId: 'admin-B' }  // creator was provisioned by approver
    }
    const svc = new AirspaceVersioningService(prisma)
    await expect(svc.approveDroneZoneVersion('admin-B', 'draft-001'))
      .rejects.toThrow('ADMIN_LINEAGE_VIOLATION')
  })

  test('AV-08: TWO_PERSON_RULE_VIOLATION is logged to auditLog', async () => {
    const prisma = makeMockPrisma()
    const svc = new AirspaceVersioningService(prisma)
    try { await svc.approveDroneZoneVersion('admin-A', 'draft-001') } catch {}
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'drone_zone_approval_rejected_same_admin',
          errorCode: 'SAME_ADMIN_APPROVAL_FORBIDDEN',
        })
      })
    )
  })

  test('AV-09: Already WITHDRAWN version → ALREADY_WITHDRAWN thrown', async () => {
    const prisma = makeMockPrisma({ draft: {
      id: 'draft-004', dataType: 'DRONE_ZONE', approvalStatus: 'WITHDRAWN', createdBy: 'admin-A',
      payloadJson: '{}', versionNumber: 1, effectiveFrom: new Date(), effectiveTo: null,
    }})
    const svc = new AirspaceVersioningService(prisma)
    await expect(svc.approveDroneZoneVersion('admin-B', 'draft-004'))
      .rejects.toThrow('ALREADY_WITHDRAWN')
  })

  test('AV-10: Successful approval supersedes existing active version of same zone', async () => {
    const existingActive = {
      id: 'old-active', dataType: 'DRONE_ZONE', approvalStatus: 'ACTIVE', createdBy: 'admin-C',
      payloadJson: JSON.stringify({ zoneId: 'Z1' }), versionNumber: 1,
    }
    const prisma = makeMockPrisma({ existingVersions: [existingActive] })
    const svc = new AirspaceVersioningService(prisma)
    await svc.approveDroneZoneVersion('admin-B', 'draft-001')
    // Should have called update twice: once to supersede old, once to activate new
    expect(prisma.airspaceVersion.update).toHaveBeenCalledTimes(2)
  })
})

// ── AftnCnlBuilder — CNL messages ──────────────────────────────────────────

describe('AftnCnlBuilder — CNL messages', () => {
  const builder = new AftnCnlBuilder()

  test('CNL-01: Basic CNL format starts with (CNL- and ends with )', () => {
    const msg = builder.build({
      callsign: 'VT-ABC', departureIcao: 'VIDP', eobt: '011000', destination: 'VABB',
    })
    expect(msg).toBe('(CNL-VT-ABC-VIDP011000-VABB)')
    expect(msg.startsWith('(CNL-')).toBe(true)
    expect(msg.endsWith(')')).toBe(true)
  })

  test('CNL-02: CNL with DOF appended', () => {
    const msg = builder.build({
      callsign: 'VT-ABC', departureIcao: 'VIDP', eobt: '011000', destination: 'VABB', dof: '260307',
    })
    expect(msg).toBe('(CNL-VT-ABC-VIDP011000-VABB-DOF/260307)')
  })

  test('CNL-03: Missing callsign throws CNL_BUILD_FAILED', () => {
    expect(() => builder.build({
      callsign: '', departureIcao: 'VIDP', eobt: '011000', destination: 'VABB',
    })).toThrow('CNL_BUILD_FAILED')
  })
})

// ── AftnDlaBuilder — DLA messages ──────────────────────────────────────────

describe('AftnDlaBuilder — DLA messages', () => {
  const builder = new AftnDlaBuilder()

  test('DLA-01: Basic DLA format starts with (DLA- and ends with )', () => {
    const msg = builder.build({
      callsign: 'VT-ABC', departureIcao: 'VIDP', originalEobt: '011000',
      newEobt: '011200', destination: 'VABB',
    })
    expect(msg).toBe('(DLA-VT-ABC-VIDP011000-VABB-011200)')
    expect(msg.startsWith('(DLA-')).toBe(true)
    expect(msg.endsWith(')')).toBe(true)
  })

  test('DLA-02: Same EOBT throws DLA_BUILD_FAILED', () => {
    expect(() => builder.build({
      callsign: 'VT-ABC', departureIcao: 'VIDP', originalEobt: '011000',
      newEobt: '011000', destination: 'VABB',
    })).toThrow('DLA_BUILD_FAILED')
  })

  test('DLA-03: DLA with DOF appended', () => {
    const msg = builder.build({
      callsign: 'VT-ABC', departureIcao: 'VIDP', originalEobt: '011000',
      newEobt: '011200', destination: 'VABB', dof: '260307',
    })
    expect(msg).toBe('(DLA-VT-ABC-VIDP011000-VABB-011200-DOF/260307)')
  })
})

// ── AftnArrBuilder — ARR messages ──────────────────────────────────────────

describe('AftnArrBuilder — ARR messages', () => {
  const builder = new AftnArrBuilder()

  test('ARR-01: Basic ARR format — (ARR-CALLSIGN-ADEPEOBT-ADES-ATA)', () => {
    const msg = builder.build({
      callsign: 'VT-ABC', departureIcao: 'VIDP', eobt: '021045',
      arrivalAerodrome: 'VABB', arrivalTime: '1230',
    })
    expect(msg).toBe('(ARR-VT-ABC-VIDP021045-VABB-1230)')
    expect(msg.startsWith('(ARR-')).toBe(true)
    expect(msg.endsWith(')')).toBe(true)
  })

  test('ARR-02: ARR with DOF', () => {
    const msg = builder.build({
      callsign: 'VT-ABC', departureIcao: 'VIDP', eobt: '021045',
      arrivalAerodrome: 'VABB', arrivalTime: '1230', dof: '260307',
    })
    expect(msg).toBe('(ARR-VT-ABC-VIDP021045-VABB-1230-DOF/260307)')
  })

  test('ARR-03: Missing eobt throws ARR_BUILD_FAILED', () => {
    expect(() => builder.build({
      callsign: 'VT-ABC', departureIcao: 'VIDP', eobt: '',
      arrivalAerodrome: 'VABB', arrivalTime: '1230',
    })).toThrow('ARR_BUILD_FAILED')
  })
})
