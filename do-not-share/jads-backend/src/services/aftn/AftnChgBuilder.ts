/**
 * FP04 — CHG (Change) and DEP (Departure) AFTN Message Builders
 *
 * Implements the remaining ICAO Doc 4444 FPL-related message types
 * not already covered by existing builders.
 */

// ── CHG (Change/Modification) ──────────────────────────────────────────

export interface ChgInput {
  callsign: string;       // Item 7: aircraft identification
  adep: string;           // Item 13: departure aerodrome
  eobt: string;           // Item 13: HHMM original EOBT
  ades: string;           // Item 16: destination aerodrome
  /** The fields being changed, as ICAO amendment field references */
  amendments: string;     // e.g. '-15/N0460F370 W3 IGOLU W46 GOA'
  dof?: string;           // DOF/YYMMDD
}

export class AftnChgBuilder {
  /**
   * Build an ICAO Doc 4444 CHG (Modification) message.
   *
   * Format: (CHG-CALLSIGN-ADEPEOBT-ADES-AMENDMENTS[-DOF/YYMMDD])
   */
  build(input: ChgInput): string {
    this.validate(input);

    let msg = `(CHG-${input.callsign}-${input.adep}${input.eobt}-${input.ades}`;
    msg += `-${input.amendments}`;
    if (input.dof) {
      msg += `-DOF/${input.dof}`;
    }
    msg += ')';

    return msg;
  }

  private validate(input: ChgInput): void {
    if (!input.callsign || !/^[A-Z0-9]{2,7}$/.test(input.callsign)) {
      throw new Error(`Invalid callsign: '${input.callsign}'`);
    }
    if (!input.adep || !/^[A-Z]{4}$/.test(input.adep)) {
      throw new Error(`Invalid ADEP: '${input.adep}'`);
    }
    if (!input.eobt || !/^\d{4}$/.test(input.eobt)) {
      throw new Error(`Invalid EOBT: '${input.eobt}' (must be HHMM)`);
    }
    if (!input.ades || !/^[A-Z]{4}$/.test(input.ades)) {
      throw new Error(`Invalid ADES: '${input.ades}'`);
    }
    if (!input.amendments || input.amendments.trim().length === 0) {
      throw new Error('CHG message requires at least one amendment');
    }
  }
}

// ── DEP (Departure) ───────────────────────────────────────────────────

export interface DepInput {
  callsign: string;       // Item 7
  adep: string;           // Item 13: departure aerodrome
  eobt: string;           // Item 13: HHMM
  ades: string;           // Item 16: destination
  atd: string;            // Actual time of departure HHMM
  dof?: string;           // DOF/YYMMDD
}

export class AftnDepBuilder {
  /**
   * Build an ICAO Doc 4444 DEP (Departure) message.
   *
   * Format: (DEP-CALLSIGN-ADEPEOBT-ADES-ATD[-DOF/YYMMDD])
   */
  build(input: DepInput): string {
    this.validate(input);

    let msg = `(DEP-${input.callsign}-${input.adep}${input.eobt}-${input.ades}`;
    msg += `-${input.atd}`;
    if (input.dof) {
      msg += `-DOF/${input.dof}`;
    }
    msg += ')';

    return msg;
  }

  private validate(input: DepInput): void {
    if (!input.callsign || !/^[A-Z0-9]{2,7}$/.test(input.callsign)) {
      throw new Error(`Invalid callsign: '${input.callsign}'`);
    }
    if (!input.adep || !/^[A-Z]{4}$/.test(input.adep)) {
      throw new Error(`Invalid ADEP: '${input.adep}'`);
    }
    if (!input.eobt || !/^\d{4}$/.test(input.eobt)) {
      throw new Error(`Invalid EOBT: '${input.eobt}'`);
    }
    if (!input.ades || !/^[A-Z]{4}$/.test(input.ades)) {
      throw new Error(`Invalid ADES: '${input.ades}'`);
    }
    if (!input.atd || !/^\d{4}$/.test(input.atd)) {
      throw new Error(`Invalid ATD: '${input.atd}' (must be HHMM)`);
    }
  }
}
