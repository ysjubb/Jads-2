/**
 * FP11 — NPNT Permission Artefact Generator — DGCA v1.2 XML Full Schema
 *
 * Generates a complete NPNT (No Permission No Takeoff) Permission Artefact
 * XML document conforming to DGCA v1.2 specification (March 2020).
 *
 * The PA is an XML document that an RFM (Registered Flight Module) validates
 * before allowing the drone to arm.
 */

import { NpntPermissionInput, validateNpntInput } from './NpntTypes';

// ── Helper: Format Date to IST ─────────────────────────────────────────

/**
 * Format a Date as ISO 8601 with +05:30 IST offset.
 */
function toIstString(date: Date): string {
  // IST is UTC+05:30
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);

  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+05:30`;
}

/**
 * Escape XML special characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Builder ────────────────────────────────────────────────────────────

/**
 * Build a DGCA v1.2 NPNT Permission Artefact XML document (unsigned).
 *
 * @param input  The permission input data
 * @returns      The XML string (unsigned — signature added by FP12)
 * @throws       If validation fails
 */
export function buildPermissionArtefactXml(input: NpntPermissionInput): string {
  // Validate input
  const errors = validateNpntInput(input);
  if (errors.length > 0) {
    throw new Error(`NPNT PA validation failed:\n${errors.join('\n')}`);
  }

  // Auto-close polygon if not already closed
  const flyArea = [...input.flyArea];
  const first = flyArea[0];
  const last = flyArea[flyArea.length - 1];
  if (first.latitude !== last.latitude || first.longitude !== last.longitude) {
    flyArea.push({ latitude: first.latitude, longitude: first.longitude });
  }

  // Build coordinate elements
  const coordElements = flyArea
    .map(
      pt =>
        `      <Coordinate latitude="${pt.latitude.toFixed(4)}" longitude="${pt.longitude.toFixed(4)}"/>`
    )
    .join('\n');

  // Build frequency elements
  const freqElements = input.frequencies
    .map(f => `        <frequency>${escapeXml(f)}</frequency>`)
    .join('\n');

  // Build the complete XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<UAPermission xmlns="http://www.dgca.gov.in/npnt">
  <Permission>
    <FlightID>${escapeXml(input.flightId)}</FlightID>
    <Owner>
      <operatorID>${escapeXml(input.operatorId)}</operatorID>
      <pilotID>${escapeXml(input.pilotId)}</pilotID>
      <UARegistrationNumber>${escapeXml(input.uaRegistrationNumber)}</UARegistrationNumber>
    </Owner>
    <FlightDetails>
      <flightPurpose>${escapeXml(input.flightPurpose)}</flightPurpose>
      <payloadDetails>
        <payloadType>${escapeXml(input.payloadType)}</payloadType>
        <payloadMake>${escapeXml(input.payloadMake)}</payloadMake>
        <payloadModel>${escapeXml(input.payloadModel)}</payloadModel>
        <payloadWeight>${input.payloadWeight}</payloadWeight>
      </payloadDetails>
      <droneDetails>
        <make>${escapeXml(input.droneMake)}</make>
        <model>${escapeXml(input.droneModel)}</model>
        <category>${escapeXml(input.droneCategory)}</category>
        <class>${escapeXml(input.droneClass)}</class>
      </droneDetails>
    </FlightDetails>
    <FlightParameters>
      <flightStartTime>${toIstString(input.flightStartTime)}</flightStartTime>
      <flightEndTime>${toIstString(input.flightEndTime)}</flightEndTime>
      <maxAltitude>${input.maxAltitudeMeters}</maxAltitude>
      <frequenciesUsed>
${freqElements}
      </frequenciesUsed>
      <flyArea>
${coordElements}
      </flyArea>
    </FlightParameters>
  </Permission>
</UAPermission>`;

  return xml;
}

/**
 * Parse a PA XML string to extract key fields (for verification display).
 */
export interface ParsedPermissionArtefact {
  flightId: string;
  operatorId: string;
  pilotId: string;
  uaRegistrationNumber: string;
  flightPurpose: string;
  droneMake: string;
  droneModel: string;
  droneCategory: string;
  flightStartTime: string;
  flightEndTime: string;
  maxAltitude: number;
  flyAreaPoints: number;
}

/**
 * Simple regex-based PA XML parser (no XML parser dependency).
 */
export function parsePermissionArtefactXml(xml: string): ParsedPermissionArtefact {
  const extract = (tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return match?.[1] ?? '';
  };

  const coordCount = (xml.match(/<Coordinate /g) || []).length;

  return {
    flightId: extract('FlightID'),
    operatorId: extract('operatorID'),
    pilotId: extract('pilotID'),
    uaRegistrationNumber: extract('UARegistrationNumber'),
    flightPurpose: extract('flightPurpose'),
    droneMake: extract('make'),
    droneModel: extract('model'),
    droneCategory: extract('category'),
    flightStartTime: extract('flightStartTime'),
    flightEndTime: extract('flightEndTime'),
    maxAltitude: parseInt(extract('maxAltitude')) || 0,
    flyAreaPoints: coordCount,
  };
}
