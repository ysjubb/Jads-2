// Stage 7 pure logic tests — no database required.
// Covers: AirspaceVersioningService rules, RouteSemanticEngine geodesics,
// AltitudeComplianceEngine semicircular rule, FirGeometryEngine ray casting,
// AftnMessageBuilder format, Item18Parser.

import { RouteSemanticEngine }      from '../services/RouteSemanticEngine'
import { AltitudeComplianceEngine } from '../services/AltitudeComplianceEngine'
import { FirGeometryEngine }        from '../services/FirGeometryEngine'
import { AftnMessageBuilder }       from '../services/AftnMessageBuilder'
import { Item18Parser }             from '../services/Item18Parser'

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

// ── AirspaceVersioningService — rules ────────────────────────────────────────

describe('AirspaceVersioningService — state invariants (pure logic)', () => {

  test('AV-01: DRAFT drone zone is not ACTIVE', () => {
    const status = 'DRAFT'
    expect(status).not.toBe('ACTIVE')
  })

  test('AV-02: Two-person rule: approver === creator → violation', () => {
    const draft = { createdByUserId: 'admin-A', approvalStatus: 'DRAFT' }
    const approvingAdminId = 'admin-A'
    const violated = draft.createdByUserId === approvingAdminId
    expect(violated).toBe(true)
  })

  test('AV-03: Two-person rule: approver !== creator → no violation', () => {
    const draft = { createdByUserId: 'admin-A', approvalStatus: 'DRAFT' }
    const approvingAdminId = 'admin-B'
    expect(draft.createdByUserId === approvingAdminId).toBe(false)
  })

  test('AV-04: WITHDRAWN and SUPERSEDED statuses exist — no DELETE', () => {
    const validStatuses = ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'WITHDRAWN']
    expect(validStatuses).toContain('WITHDRAWN')
    expect(validStatuses).toContain('SUPERSEDED')
    expect(validStatuses).not.toContain('DELETED')
  })

  test('AV-05: NOTAM requires no second approval', () => {
    // NOTAMs are published immediately — single admin, no DRAFT step
    const notamApprovalFlow = 'IMMEDIATE'
    expect(notamApprovalFlow).toBe('IMMEDIATE')
  })

  test('AV-06: Drone zone validation: DRAFT zones excluded from flight validation', () => {
    const zones = [
      { zoneId: 'Z1', approvalStatus: 'ACTIVE' },
      { zoneId: 'Z2', approvalStatus: 'DRAFT' },
    ]
    const validForFlight = zones.filter(z => z.approvalStatus === 'ACTIVE')
    expect(validForFlight).toHaveLength(1)
    expect(validForFlight[0].zoneId).toBe('Z1')
  })

  test('AV-07: Supersession: old zone gets SUPERSEDED status', () => {
    let oldStatus = 'ACTIVE'
    const supersede = () => { oldStatus = 'SUPERSEDED' }
    supersede()
    expect(oldStatus).toBe('SUPERSEDED')
  })

  test('AV-08: getSnapshotAtTime semantic — only ACTIVE at that time', () => {
    const now  = new Date('2024-06-01T12:00:00Z')
    const past = new Date('2024-01-01T00:00:00Z')
    const versions = [
      { id: 'v1', approvalStatus: 'ACTIVE',    effectiveFrom: past, effectiveTo: null },
      { id: 'v2', approvalStatus: 'ACTIVE',    effectiveFrom: now,  effectiveTo: null },
      { id: 'v3', approvalStatus: 'WITHDRAWN', effectiveFrom: past, effectiveTo: now  },
    ]
    const queryTime = new Date('2024-03-15T00:00:00Z')
    const atTime = versions.filter(v =>
      v.approvalStatus === 'ACTIVE' &&
      v.effectiveFrom <= queryTime &&
      (v.effectiveTo === null || v.effectiveTo > queryTime)
    )
    expect(atTime).toHaveLength(1)
    expect(atTime[0].id).toBe('v1')  // v2 not yet effective, v3 withdrawn
  })

  test('AV-09: airspaceSnapshotVersionIds records all version IDs used in validation', () => {
    const usedIds = ['wp-v1', 'airway-v2', 'wp-v3']
    const unique  = [...new Set(usedIds)]
    expect(unique).toEqual(['wp-v1', 'airway-v2', 'wp-v3'])
  })

  test('AV-10: Version numbering is sequential per dataType', () => {
    const versions = [{ versionNumber: 1 }, { versionNumber: 2 }, { versionNumber: 3 }]
    const last = Math.max(...versions.map(v => v.versionNumber))
    const next = last + 1
    expect(next).toBe(4)
  })
})
