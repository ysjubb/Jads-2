/**
 * FP18 — End-to-End Demo Orchestrator
 *
 * Chains all Phase A–D components into a single live demonstration:
 *   FPL → AFTN message → signed NPNT PA → simulated flight with
 *   violations → hash-chain log → verify chain → BSA certificate
 */

import * as crypto from 'crypto';
import { buildAftnEnvelope } from '../aftn/AftnEnvelopeBuilder';
import { buildFplAddressees } from '../aftn/AftnAddressTable';
import { buildField18 } from '../aftn/Field18Builder';
import { validateField10F18 } from '../aftn/Field10F18CrossValidator';
import { validateField10a } from '../aftn/Field10aEquipment';
import { validateField10b } from '../aftn/Field10bSurveillance';
import { formatAltitudeForField15 } from '../aftn/IndiaAIPTransitions';
import {
  buildPermissionArtefactXml,
  parsePermissionArtefactXml,
} from '../npnt/PermissionArtefactBuilder';
import { signPaXml, generateDemoCertificate } from '../npnt/XmlDsigSigner';
import { FlightLogChain } from '../npnt/FlightLogChain';
import { generateBsa2023Certificate } from '../npnt/Bsa2023CertGenerator';
import { generateFlightId } from '../npnt/NpntTypes';
import type { NpntPermissionInput } from '../npnt/NpntTypes';
import type { Field18 } from '../aftn/Field18Builder';

// ── Types ──────────────────────────────────────────────────────────────

export interface DemoFlightInput {
  // AFTN FPL fields
  callsign: string;
  adep: string;           // ICAO departure
  ades: string;           // ICAO destination
  aircraftType: string;   // e.g. 'B738'
  wakeTurbulence: string; // L/M/H/J
  flightRules: string;    // I/V/Y/Z
  equipment10a: string;   // Field 10a
  equipment10b: string;   // Field 10b
  cruiseSpeed: string;    // e.g. 'N0450'
  cruiseLevel: string;    // e.g. 'F350'
  route: string;          // e.g. 'W3 IGOLU W46 GOA'
  eet: string;            // e.g. '0145'
  alternate?: string;     // ICAO alternate

  // Drone / NPNT fields (for drone demo scenario)
  isDrone?: boolean;
  droneUIN?: string;
  droneMake?: string;
  droneModel?: string;
  droneCategory?: string;
  operatorId?: string;
  pilotId?: string;
  flyArea?: Array<{ latitude: number; longitude: number }>;
  maxAltitudeMeters?: number;
}

export interface DemoCreateResult {
  missionId: string;
  aftnMessage: string;
  signedPaXml?: string;
  flightId: string;
  field10aValidation: string[];
  field10bValidation: string[];
  crossValidation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export interface DemoSimulateResult {
  totalEntries: number;
  breaches: number;
  chainHash: string;
  lastEntryHash: string;
  entries: Array<{
    seq: number;
    type: string;
    lat: number;
    lon: number;
    alt: number;
  }>;
}

export interface DemoFullReport {
  aftnMessage: string;
  paXml?: string;
  crossValidationReport: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  flightLogSummary: {
    totalEntries: number;
    breaches: number;
    chainHash: string;
  };
  chainVerification: {
    valid: boolean;
    entriesVerified: number;
    errors: string[];
  };
  bsa2023Certificate: any;
  jadsVsOfpl: {
    jadsCapabilities: string[];
    ofplCapabilities: string[];
    jadsAhead: string[];
  };
}

// ── In-Memory Store ────────────────────────────────────────────────────

const _demoMissions: Record<string, {
  input: DemoFlightInput;
  aftnMessage: string;
  paXml?: string;
  chain?: FlightLogChain;
  flightId: string;
}> = {};

// ── Demo Certificate (generated once) ──────────────────────────────────

let _demoCert: { privateKey: string; certificate: string } | null = null;
let _demoCertPromise: Promise<{ privateKey: string; certificate: string }> | null = null;

async function getDemoCert(): Promise<{ privateKey: string; certificate: string }> {
  if (_demoCert) return _demoCert;
  if (!_demoCertPromise) {
    _demoCertPromise = generateDemoCertificate().then(cert => {
      _demoCert = cert;
      return cert;
    });
  }
  return _demoCertPromise;
}

// ── Create Flight ──────────────────────────────────────────────────────

export async function createDemoFlight(input: DemoFlightInput): Promise<DemoCreateResult> {
  const missionId = `DEMO-${Date.now().toString(36).toUpperCase()}`;
  const flightId = generateFlightId();

  // ── Validate Field 10a/10b ──
  const field10aErrors = validateField10a(input.equipment10a);
  const field10bErrors = validateField10b(input.equipment10b);

  // ── Field 18 ──
  const f18: Field18 = {
    dof: formatDof(new Date()),
    reg: input.callsign,
    opr: 'JADS',
  };

  // Extract PBN if R is in equipment
  if (input.equipment10a.includes('R')) {
    f18.pbn = 'A1B1D1L1'; // default PBN codes for demo
  }

  if (input.isDrone) {
    f18.typ = `${input.droneMake ?? 'DJI'} ${input.droneModel ?? 'PHANTOM 4'}`;
    f18.rmk = `UIN/${input.droneUIN ?? 'UA001234567890'}`;
  }

  // ── Cross-validate Field 10 ↔ 18 ──
  const crossResult = validateField10F18(input.equipment10a, {
    pbn: f18.pbn,
    com: f18.com,
    nav: f18.nav,
    dat: f18.dat,
    sts: f18.sts,
  });

  const field18Str = buildField18(f18);

  // ── Build FPL message text ──
  const fplText = buildFplMessageText(input, field18Str);

  // ── Build AFTN envelope ──
  const addresses = buildFplAddressees(input.adep, input.ades, input.alternate);
  const filingTime = formatFilingTime(new Date());

  // Use a fallback originator if no ARO address found
  const originator = addresses[0] ?? `${input.adep}YAZX`;

  const envelope = buildAftnEnvelope({
    priority: 'FF',
    addresses: addresses.length > 0 ? addresses : [`${input.adep}YAZX`],
    filingTime,
    originator,
    messageText: fplText,
  });

  // ── Generate NPNT PA if drone ──
  let signedPaXml: string | undefined;

  if (input.isDrone && input.flyArea && input.flyArea.length >= 3) {
    const paInput: NpntPermissionInput = {
      flightId,
      operatorId: input.operatorId ?? 'JADS-DEMO-001',
      pilotId: input.pilotId ?? 'PIL-DEMO-001',
      uaRegistrationNumber: input.droneUIN ?? 'UA001234567890',
      flightPurpose: 'SURVEILLANCE',
      payloadType: 'CAMERA',
      payloadMake: input.droneMake ?? 'DJI',
      payloadModel: input.droneModel ?? 'Zenmuse X5S',
      payloadWeight: 461,
      droneMake: input.droneMake ?? 'DJI',
      droneModel: input.droneModel ?? 'PHANTOM 4',
      droneCategory: (input.droneCategory as any) ?? 'MEDIUM',
      droneClass: 'NTA',
      flightStartTime: new Date(),
      flightEndTime: new Date(Date.now() + 60 * 60 * 1000), // +1 hour
      maxAltitudeMeters: input.maxAltitudeMeters ?? 100,
      frequencies: ['2.4 GHz', '5.8 GHz'],
      flyArea: input.flyArea,
    };

    const unsignedXml = buildPermissionArtefactXml(paInput);
    const cert = await getDemoCert();
    try {
      const signResult = signPaXml(unsignedXml, cert.privateKey, cert.certificate);
      signedPaXml = signResult.signedXml;
    } catch {
      signedPaXml = unsignedXml; // Fallback to unsigned for demo
    }
  }

  // Store for later simulation
  _demoMissions[missionId] = {
    input,
    aftnMessage: envelope.message,
    paXml: signedPaXml,
    flightId,
  };

  return {
    missionId,
    aftnMessage: envelope.message,
    signedPaXml,
    flightId,
    field10aValidation: field10aErrors,
    field10bValidation: field10bErrors,
    crossValidation: {
      valid: crossResult.valid,
      errors: crossResult.errors,
      warnings: crossResult.warnings,
    },
  };
}

// ── Simulate Flight ────────────────────────────────────────────────────

export async function simulateDemoFlight(
  missionId: string,
  includeViolations = true,
  violationCount = 2
): Promise<DemoSimulateResult> {
  const mission = _demoMissions[missionId];
  if (!mission) {
    throw new Error(`Demo mission not found: ${missionId}`);
  }

  const cert = await getDemoCert();
  const chain = new FlightLogChain(
    mission.flightId,
    mission.input.droneUIN ?? 'UA001234567890',
    cert.privateKey
  );

  const baseLat = mission.input.flyArea?.[0]?.latitude ?? 28.5562;
  const baseLon = mission.input.flyArea?.[0]?.longitude ?? 77.1000;
  const now = Date.now();

  // ARM entry
  chain.addEntry({
    entryType: 'ARM',
    timestamp: now,
    latitude: baseLat,
    longitude: baseLon,
    altitudeMeters: 0,
    speedMps: 0,
    headingDeg: 0,
  });

  // TAKEOFF
  chain.addEntry({
    entryType: 'TAKEOFF',
    timestamp: now + 5000,
    latitude: baseLat,
    longitude: baseLon,
    altitudeMeters: 5,
    speedMps: 2,
    headingDeg: 0,
  });

  // 30 POSITION entries
  let violationsInserted = 0;
  for (let i = 0; i < 30; i++) {
    const t = now + 7000 + i * 2000;
    const lat = baseLat + (i * 0.0005);
    const lon = baseLon + (i * 0.0003);
    const alt = 30 + Math.sin(i * 0.3) * 20;

    // Inject violations at specific points
    if (includeViolations && violationsInserted < violationCount && (i === 10 || i === 20)) {
      chain.addEntry({
        entryType: 'GEOFENCE_BREACH',
        timestamp: t,
        latitude: lat + 0.05, // Outside boundary
        longitude: lon + 0.05,
        altitudeMeters: alt + 200, // Above max altitude
        speedMps: 15,
        headingDeg: (i * 12) % 360,
      });
      violationsInserted++;
    } else {
      chain.addEntry({
        entryType: 'POSITION',
        timestamp: t,
        latitude: lat,
        longitude: lon,
        altitudeMeters: alt,
        speedMps: 8 + Math.random() * 4,
        headingDeg: (i * 12) % 360,
      });
    }
  }

  // LAND
  chain.addEntry({
    entryType: 'LAND',
    timestamp: now + 70000,
    latitude: baseLat + 0.015,
    longitude: baseLon + 0.009,
    altitudeMeters: 2,
    speedMps: 1,
    headingDeg: 180,
  });

  // DISARM
  chain.addEntry({
    entryType: 'DISARM',
    timestamp: now + 72000,
    latitude: baseLat + 0.015,
    longitude: baseLon + 0.009,
    altitudeMeters: 0,
    speedMps: 0,
    headingDeg: 180,
  });

  mission.chain = chain;

  // Store chain data for verification endpoints
  const { storeDemoChainData } = require('../../routes/verificationRoutes');
  storeDemoChainData(missionId, chain.exportChain());

  const entries = chain.exportChain();
  return {
    totalEntries: entries.length,
    breaches: chain.breachCount,
    chainHash: chain.getChainHash(),
    lastEntryHash: chain.lastEntry?.entryHash ?? '',
    entries: entries.map(e => ({
      seq: e.sequenceNumber,
      type: e.entryType,
      lat: e.latitude,
      lon: e.longitude,
      alt: e.altitudeMeters,
    })),
  };
}

// ── Full Report ────────────────────────────────────────────────────────

export function getDemoFullReport(missionId: string): DemoFullReport {
  const mission = _demoMissions[missionId];
  if (!mission) {
    throw new Error(`Demo mission not found: ${missionId}`);
  }

  const chain = mission.chain;
  if (!chain) {
    throw new Error(`Flight not simulated yet for mission: ${missionId}`);
  }

  // Cross-validation
  const crossResult = validateField10F18(mission.input.equipment10a, {
    pbn: mission.input.equipment10a.includes('R') ? 'A1B1D1L1' : undefined,
  });

  // Chain verification
  const chainVerification = chain.verifyChain();

  // BSA 2023 certificate
  const bsaCert = generateBsa2023Certificate(chain, {
    missionId,
    flightId: mission.flightId,
    operatorName: 'JADS Demo Operator',
    pilotId: mission.input.pilotId ?? 'PIL-DEMO-001',
    droneUIN: mission.input.droneUIN ?? 'UA001234567890',
    droneMake: mission.input.droneMake ?? 'DJI',
    droneModel: mission.input.droneModel ?? 'PHANTOM 4',
    flightDate: new Date().toISOString().split('T')[0],
  });

  return {
    aftnMessage: mission.aftnMessage,
    paXml: mission.paXml,
    crossValidationReport: {
      valid: crossResult.valid,
      errors: crossResult.errors,
      warnings: crossResult.warnings,
    },
    flightLogSummary: {
      totalEntries: chain.length,
      breaches: chain.breachCount,
      chainHash: chain.getChainHash(),
    },
    chainVerification: {
      valid: chainVerification.valid,
      entriesVerified: chainVerification.entriesVerified,
      errors: chainVerification.errors,
    },
    bsa2023Certificate: bsaCert,
    jadsVsOfpl: getJadsVsOfpl(),
  };
}

// ── AFTN Comparison ────────────────────────────────────────────────────

export function getAftnComparison(): {
  ofpl: { capabilities: string[]; cannot: string[] };
  jads: { capabilities: string[]; parity: string[]; ahead: string[] };
} {
  return {
    ofpl: {
      capabilities: [
        'AFTN message transmission via AAI AMSS',
        'AIRAC route/airway/waypoint database',
        'Indian NOTAM live feed (AAI AIS)',
        'ADC number generation (IAF AFMLU)',
        'FIC number assignment (AAI FIC)',
        'DO-200B certified aerodrome database',
        'Real-time METAR/SIGMET from IMD/AAI',
        'Legal standing as official AAI portal',
        'Digital Sky UTMSP licensing',
      ],
      cannot: [
        'NPNT Permission Artefact generation',
        'XMLDSig signing of PAs',
        'BSA 2023 hash chain evidence',
        'Post-quantum cryptographic signatures',
        'Geofence violation evidence chain',
        'Unified civil-military UTM',
        'Real-time NPNT enforcement',
        'Auto-BSA 2023 certificate generation',
        'Dual PQC+classical signing',
      ],
    },
    jads: {
      capabilities: [
        'AFTN message format (all types)',
        'Field 10a all ~40 equipment codes',
        'Field 10b all 16 surveillance codes',
        'Field 10↔18 full PBN dependency matrix',
        'Field 18 all 20+ ordered indicators',
        'STS/ all 13 codes + NONRVSM conflict',
        'Indian AIP transition altitudes (127 aerodromes)',
        'AFTN address table — all Indian FIRs',
        'Chain verification endpoints',
        'End-to-end demo workflow',
      ],
      parity: [
        'AFTN FPL/CNL/DLA/CHG/DEP/ARR message format',
        'ICAO Doc 4444 field validation',
        'Equipment and surveillance code tables',
        'PBN dependency matrix validation',
      ],
      ahead: [
        'NPNT PA generation (DGCA v1.2 XML)',
        'XMLDSig RSA-2048-SHA256 signing',
        'ML-DSA-65 post-quantum signatures (FIPS 204)',
        'Flight log SHA-256 hash chain',
        'BSA 2023 Section 63 certificate auto-generation',
        'Geofence violation hash-chain evidence',
        'Hybrid RSA+ML-DSA dual signing',
        'Court-ready verification endpoints',
      ],
    },
  };
}

function getJadsVsOfpl() {
  const comparison = getAftnComparison();
  return {
    jadsCapabilities: comparison.jads.capabilities,
    ofplCapabilities: comparison.ofpl.capabilities,
    jadsAhead: comparison.jads.ahead,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatDof(date: Date): string {
  const yy = date.getFullYear().toString().slice(-2);
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function formatFilingTime(date: Date): string {
  const dd = date.getUTCDate().toString().padStart(2, '0');
  const hh = date.getUTCHours().toString().padStart(2, '0');
  const mm = date.getUTCMinutes().toString().padStart(2, '0');
  return `${dd}${hh}${mm}`;
}

function buildFplMessageText(input: DemoFlightInput, field18Str: string): string {
  const item7 = input.callsign;
  const item8 = `${input.flightRules}${input.isDrone ? 'G' : 'S'}`;
  const item9 = `${input.aircraftType}/${input.wakeTurbulence}`;
  const item10 = `${input.equipment10a}/${input.equipment10b}`;
  const item13 = `${input.adep}${formatFilingTime(new Date()).substring(2)}`; // EOBT from current time
  const item15 = `${input.cruiseSpeed}${input.cruiseLevel} ${input.route}`;
  const item16 = `${input.ades}${input.eet}${input.alternate ? ' ' + input.alternate : ''}`;

  return `(FPL-${item7}-${item8}\n-${item9}-${item10}\n-${item13}\n-${item15}\n-${item16}\n-${field18Str})`;
}

// ── Default Demo Scenarios ─────────────────────────────────────────────

/**
 * Pre-configured AIC302 Delhi→Mumbai demo scenario.
 */
export function getAic302Scenario(): DemoFlightInput {
  return {
    callsign: 'AIC302',
    adep: 'VIDP',
    ades: 'VABB',
    aircraftType: 'B738',
    wakeTurbulence: 'M',
    flightRules: 'I',
    equipment10a: 'SDE2E3FGHIJ3J5RWXY',
    equipment10b: 'LB1D1',
    cruiseSpeed: 'N0450',
    cruiseLevel: 'F350',
    route: 'W3 IGOLU W46 GOA',
    eet: '0145',
    alternate: 'VAAH',
  };
}

/**
 * Pre-configured drone enforcement demo scenario.
 */
export function getDroneEnforcementScenario(): DemoFlightInput {
  return {
    callsign: 'JADSD1',
    adep: 'ZZZZ',
    ades: 'ZZZZ',
    aircraftType: 'ZZZZ',
    wakeTurbulence: 'L',
    flightRules: 'V',
    equipment10a: 'G',
    equipment10b: 'N',
    cruiseSpeed: 'N0020',
    cruiseLevel: 'A010',
    route: 'DCT',
    eet: '0020',
    isDrone: true,
    droneUIN: 'UA001234567890',
    droneMake: 'DJI',
    droneModel: 'PHANTOM 4',
    droneCategory: 'MEDIUM',
    operatorId: 'JADS-DEMO-001',
    pilotId: 'PIL-DEMO-001',
    maxAltitudeMeters: 100,
    flyArea: [
      { latitude: 28.5355, longitude: 77.3910 },
      { latitude: 28.5355, longitude: 77.4200 },
      { latitude: 28.5550, longitude: 77.4200 },
      { latitude: 28.5550, longitude: 77.3910 },
    ],
  };
}
