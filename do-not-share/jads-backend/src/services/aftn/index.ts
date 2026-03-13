/**
 * AFTN Services — Barrel Export
 *
 * FP01-FP10 implementation of ICAO Doc 4444 AFTN message format parity.
 */

// FP05: IA-5 Character Set
export {
  isIa5, isIa5Char, sanitiseToIa5,
  validateAftnCharset, wrapToAftnLines,
  AftnCharsetError, AftnMessageTooLongError,
  AFTN_LINE_MAX, AFTN_MESSAGE_TEXT_MAX, AFTN_TOTAL_MAX,
} from './AftnCharSet';
export type { AftnCharsetValidationResult } from './AftnCharSet';

// FP07: Field 10a Equipment Codes
export {
  FIELD10A_CODES, parseField10a, validateField10a,
  getEquipmentDescription, getRequiredField18Indicators,
} from './Field10aEquipment';
export type { EquipmentCodeDef } from './Field10aEquipment';

// FP08: Field 10b Surveillance Codes
export {
  FIELD10B_CODES, parseField10b, validateField10b,
  getTransponderLevel,
} from './Field10bSurveillance';
export type { SurveillanceCodeDef } from './Field10bSurveillance';

// FP02: AFTN Address Table
export {
  AFTN_ADDRESS_TABLE, INDIAN_FIRS,
  getAddressesForAerodrome, getAddressesForFir,
  getAroAddress, getAccAddress, getTowerAddress, getApproachAddress,
  getNofAddress, getFirForAerodrome, buildFplAddressees, isValidAftnAddress,
} from './AftnAddressTable';
export type { AftnAddress, IndianFir, AftnUnitType } from './AftnAddressTable';

// FP01: AFTN Envelope Builder
export {
  buildAftnEnvelope, parseAftnMessage, resetSequence,
} from './AftnEnvelopeBuilder';
export type { AftnEnvelopeInput, AftnEnvelopeResult, AftnPriority, ParsedAftnMessage } from './AftnEnvelopeBuilder';

// FP10: Field 18 Builder
export {
  STS_CODES, VALID_STS_CODES,
  buildField18, validateField18, buildField19, validateField19,
  parseField18String,
} from './Field18Builder';
export type { Field18, Field19 } from './Field18Builder';

// FP09: Field 10 ↔ 18 Cross-Validator
export {
  PBN_DEPENDENCY_MATRIX, parsePbnCodes,
  validatePbnEquipmentConsistency, validateField10F18,
} from './Field10F18CrossValidator';
export type { PbnValidationResult, CrossValidationResult } from './Field10F18CrossValidator';

// FP06: AFTN Validator
export { validateAftnMessage } from './AftnValidator';
export type { AftnValidationResult } from './AftnValidator';

// FP04: CHG and DEP Builders
export { AftnChgBuilder, AftnDepBuilder } from './AftnChgBuilder';
export type { ChgInput, DepInput } from './AftnChgBuilder';

// FP16: India AIP Transitions
export {
  getTransitionDataFull, isAboveTransitionAltitude,
  formatAltitudeForField15, getFirTransitionDefaults, isInTransitionLayer,
} from './IndiaAIPTransitions';
export type { AIPTransitionData } from './IndiaAIPTransitions';
