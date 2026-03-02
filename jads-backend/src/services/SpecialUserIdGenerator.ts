import { ENTITY_CODES, EntityCode } from '../constants'

export class SpecialUserIdGenerator {

  // Generate JADS-[ENTITY_CODE]-[6_DIGIT_SEQ]-[2_CHAR_CHECKSUM]
  generate(entityCode: EntityCode, sequence: number): string {
    if (!ENTITY_CODES.includes(entityCode)) {
      throw new Error(`Invalid entity code: ${entityCode}`)
    }
    if (sequence < 1 || sequence > 999999) {
      throw new Error(`Sequence must be 1-999999, got ${sequence}`)
    }
    const seqPadded = sequence.toString().padStart(6, '0')
    const base      = `JADS-${entityCode}-${seqPadded}`
    const checksum  = this.computeChecksum(base)
    return `${base}-${checksum}`
  }

  validate(specialUserId: string): boolean {
    const match = specialUserId.match(/^JADS-([A-Z_]+)-(\d{6})-([A-Z]{2})$/)
    if (!match) return false
    const [, entityCode, , checksum] = match
    if (!ENTITY_CODES.includes(entityCode as EntityCode)) return false
    const base = specialUserId.substring(0, specialUserId.lastIndexOf('-'))
    return checksum === this.computeChecksum(base)
  }

  // Weighted sum of char codes mod 676, encoded as 2 uppercase letters
  private computeChecksum(base: string): string {
    let sum = 0
    for (let i = 0; i < base.length; i++) {
      sum = (sum + base.charCodeAt(i) * (i + 1)) % 676
    }
    return String.fromCharCode(65 + Math.floor(sum / 26)) +
           String.fromCharCode(65 + (sum % 26))
  }
}
