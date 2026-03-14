/**
 * FP11 — NPNT Permission Artefact Generator
 *
 * Generates NPNT Permission Artefact XML matching the Digital Sky
 * Freemarker template from iSPIRT/digital-sky-api.
 *
 * DS PA uses XML ATTRIBUTES (not child elements):
 *   <Owner operatorID="{id}">
 *     <Pilot id="{id}" validTo="NA"/>
 *   </Owner>
 *   <UADetails uinNo="{uin}"/>
 *   <FlightPurpose shortDesc="{purpose}"/>
 *   <PayloadDetails payLoadWeightInKg="{kg}" payloadDetails="{text}"/>
 *   <FlightParameters flightStartTime="" flightEndTime="" maxAltitude="{feet AGL}">
 *     <Coordinates><Coordinate latitude="" longitude=""/></Coordinates>
 *   </FlightParameters>
 */

import { NpntPermissionInput, validateNpntInput } from './NpntTypes';

// ── Helper: Format Date to IST ─────────────────────────────────────────

/**
 * Format a Date as ISO 8601 with +05:30 IST offset.
 * DS uses this format for flightStartTime / flightEndTime attributes.
 */
function toIstString(date: Date): string {
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
 * Escape XML special characters for use in attribute values and text content.
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
 * Build a NPNT Permission Artefact XML document (unsigned) matching
 * the Digital Sky Freemarker template schema.
 *
 * Key DS alignment:
 *   - All data in XML attributes (not child elements)
 *   - maxAltitude in feet AGL
 *   - payloadWeight in kg
 *   - Optional FIC/ADC numbers on FlightParameters
 *   - Optional recurrence fields
 *
 * @param input  The permission input data
 * @returns      The XML string (unsigned — signature added by XmlDsigSigner)
 * @throws       If validation fails
 */
export function buildPermissionArtefactXml(input: NpntPermissionInput): string {
  // Validate input against DS thresholds
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

  // Build <Coordinate> elements inside <Coordinates>
  const coordElements = flyArea
    .map(
      pt =>
        `          <Coordinate latitude="${pt.latitude.toFixed(6)}" longitude="${pt.longitude.toFixed(6)}"/>`
    )
    .join('\n');

  // Build FlightParameters attributes
  const fpAttrs: string[] = [
    `flightStartTime="${escapeXml(toIstString(input.flightStartTime))}"`,
    `flightEndTime="${escapeXml(toIstString(input.flightEndTime))}"`,
  ];

  // Optional recurrence attributes
  if (input.recurrenceTimeExpression) {
    fpAttrs.push(`recurrenceTimeExpression="${escapeXml(input.recurrenceTimeExpression)}"`);
    fpAttrs.push(`recurrenceTimeExpressionType="${escapeXml(input.recurrenceTimeExpressionType || 'CRON_QUARTZ')}"`);
    if (input.recurringTimeDurationInMinutes !== undefined) {
      fpAttrs.push(`recurringTimeDurationInMinutes="${input.recurringTimeDurationInMinutes}"`);
    }
  }

  fpAttrs.push(`maxAltitude="${input.maxAltitudeFeetAGL}"`);

  // Optional FIC/ADC numbers (set by approval pipeline)
  if (input.ficNumber) {
    fpAttrs.push(`ficNumber="${escapeXml(input.ficNumber)}"`);
  }
  if (input.adcNumber) {
    fpAttrs.push(`adcNumber="${escapeXml(input.adcNumber)}"`);
  }

  const fpAttrString = fpAttrs.join('\n          ');

  // Build the complete XML matching DS Freemarker template
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<UAPermission>
  <Permission>
    <Owner operatorID="${escapeXml(input.operatorId)}">
      <Pilot id="${escapeXml(input.pilotId)}" validTo="${escapeXml(input.pilotValidTo)}"/>
    </Owner>
    <FlightDetails>
      <UADetails uinNo="${escapeXml(input.uaRegistrationNumber)}"/>
      <FlightPurpose shortDesc="${escapeXml(input.flightPurpose)}"/>
      <PayloadDetails payLoadWeightInKg="${input.payloadWeightKg}" payloadDetails="${escapeXml(input.payloadDetails)}"/>
      <FlightParameters
          ${fpAttrString}>
        <Coordinates>
${coordElements}
        </Coordinates>
      </FlightParameters>
    </FlightDetails>
  </Permission>
</UAPermission>`;

  return xml;
}

// ── Parser ──────────────────────────────────────────────────────────────

/**
 * Parsed PA fields (aligned with DS schema).
 */
export interface ParsedPermissionArtefact {
  operatorId: string;
  pilotId: string;
  pilotValidTo: string;
  uinNo: string;
  flightPurpose: string;
  payloadWeightKg: number;
  payloadDetails: string;
  flightStartTime: string;
  flightEndTime: string;
  maxAltitudeFt: number;
  ficNumber: string;
  adcNumber: string;
  flyAreaPoints: number;
  flyArea: Array<{ latitude: number; longitude: number }>;
}

/**
 * Parse a DS-format PA XML string to extract key fields.
 * Handles attribute-based schema from the Freemarker template.
 */
export function parsePermissionArtefactXml(xml: string): ParsedPermissionArtefact {
  // Extract attribute value from a tag
  const extractAttr = (tag: string, attr: string): string => {
    const tagMatch = xml.match(new RegExp(`<${tag}[^>]*?>`));
    if (!tagMatch) return '';
    const attrMatch = tagMatch[0].match(new RegExp(`${attr}="([^"]*)"`));
    return attrMatch?.[1] ?? '';
  };

  // Extract all Coordinate elements
  const coordRegex = /<Coordinate\s+latitude="([^"]+)"\s+longitude="([^"]+)"\s*\/>/g;
  const flyArea: Array<{ latitude: number; longitude: number }> = [];
  let coordMatch;
  while ((coordMatch = coordRegex.exec(xml)) !== null) {
    flyArea.push({
      latitude: parseFloat(coordMatch[1]),
      longitude: parseFloat(coordMatch[2]),
    });
  }

  return {
    operatorId: extractAttr('Owner', 'operatorID'),
    pilotId: extractAttr('Pilot', 'id'),
    pilotValidTo: extractAttr('Pilot', 'validTo'),
    uinNo: extractAttr('UADetails', 'uinNo'),
    flightPurpose: extractAttr('FlightPurpose', 'shortDesc'),
    payloadWeightKg: parseFloat(extractAttr('PayloadDetails', 'payLoadWeightInKg')) || 0,
    payloadDetails: extractAttr('PayloadDetails', 'payloadDetails'),
    flightStartTime: extractAttr('FlightParameters', 'flightStartTime'),
    flightEndTime: extractAttr('FlightParameters', 'flightEndTime'),
    maxAltitudeFt: parseInt(extractAttr('FlightParameters', 'maxAltitude')) || 0,
    ficNumber: extractAttr('FlightParameters', 'ficNumber'),
    adcNumber: extractAttr('FlightParameters', 'adcNumber'),
    flyAreaPoints: flyArea.length,
    flyArea,
  };
}

// ── Legacy Compatibility ────────────────────────────────────────────────

/**
 * Convert legacy JADS PA input (meters, grams, child-element schema)
 * to DS-aligned input (feet, kg, attribute schema).
 *
 * Use this when existing code passes the old format.
 */
export interface LegacyNpntInput {
  flightId: string;
  operatorId: string;
  pilotId: string;
  uaRegistrationNumber: string;
  flightPurpose: string;
  payloadType: string;
  payloadMake: string;
  payloadModel: string;
  payloadWeight: number;        // grams (legacy)
  droneMake: string;
  droneModel: string;
  droneCategory: string;
  droneClass: string;
  flightStartTime: Date;
  flightEndTime: Date;
  maxAltitudeMeters: number;    // meters AGL (legacy)
  frequencies: string[];
  flyArea: Array<{ latitude: number; longitude: number }>;
}

/**
 * Convert a legacy JADS input to DS-aligned NpntPermissionInput.
 */
export function convertLegacyInput(legacy: LegacyNpntInput): NpntPermissionInput {
  const metersToFeet = (m: number) => Math.round(m * 3.28084);
  const gramsToKg = (g: number) => g / 1000;

  return {
    operatorId: legacy.operatorId,
    pilotId: legacy.pilotId,
    pilotValidTo: 'NA',
    uaRegistrationNumber: legacy.uaRegistrationNumber,
    flightPurpose: legacy.flightPurpose as NpntPermissionInput['flightPurpose'],
    payloadWeightKg: gramsToKg(legacy.payloadWeight),
    payloadDetails: `${legacy.payloadType}: ${legacy.payloadMake} ${legacy.payloadModel}`,
    droneCategory: legacy.droneCategory as NpntPermissionInput['droneCategory'],
    flightStartTime: legacy.flightStartTime,
    flightEndTime: legacy.flightEndTime,
    maxAltitudeFeetAGL: metersToFeet(legacy.maxAltitudeMeters),
    flyArea: legacy.flyArea,
  };
}
