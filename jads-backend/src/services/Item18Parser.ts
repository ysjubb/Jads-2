// ICAO Item 18 (Other Information) semantic parser.
// Item 18 is a free-text field that carries structured key/value pairs.
// Format: KEYWORD/VALUE KEYWORD/VALUE ...
// This parser extracts all known keywords and preserves unknown tokens
// so the validation service can warn about them.

export interface Item18Parsed {
  dof:      string | null           // DOF/YYMMDD — date of flight
  reg:      string | null           // REG/VT-ABC — aircraft registration
  pbnCodes: string[]                // PBN/B4D3S1 → ['B4','D3','S1']
  opr:      string | null           // OPR/INDIGO
  sts:      string | null           // STS/HOSP or STS/MEDEVAC
  dep:      string | null           // DEP/ coordinates or aerodrome name (for ZZZZ)
  dest:     string | null           // DEST/ coordinates or aerodrome name (for ZZZZ)
  selcal:   string | null           // SEL/ABCD
  rmk:      string | null           // RMK/ free text
  unknown:  string[]                // unrecognised tokens — trigger validation warning
  raw:      string                  // original unparsed string
}

// Maps PBN codes to the equipment codes they require in Item 10
const PBN_REQUIRED_EQUIPMENT: Record<string, string[]> = {
  'A1': ['O', 'D'],        // RNAV 10 requires DME/DME or GPS
  'B1': ['D', 'G'],        // RNAV 5 all sensors
  'B2': ['D'],             // RNAV 5 VOR/DME
  'B3': ['I'],             // RNAV 5 DME/DME
  'B4': ['G'],             // RNAV 5 GNSS
  'B5': ['L'],             // RNAV 5 LoRan
  'C1': ['D', 'G'],        // RNAV 2 all sensors
  'C2': ['D'],             // RNAV 2 VOR/DME
  'C3': ['I'],             // RNAV 2 DME/DME
  'C4': ['G'],             // RNAV 2 GNSS
  'D1': ['D', 'G'],        // RNAV 1 all sensors
  'D2': ['D'],             // RNAV 1 VOR/DME
  'D3': ['I'],             // RNAV 1 DME/DME
  'D4': ['G'],             // RNAV 1 GNSS
  'L1': ['R'],             // RNP 4
  'O1': ['R'],             // Basic RNP 1 all sensors
  'O2': ['R'],             // Basic RNP 1 GNSS
  'O3': ['R'],             // Basic RNP 1 DME
  'P1': ['R'],             // RNP APCH
  'S1': ['G'],             // RNP APCH with BARO-VNAV (GNSS)
  'S2': ['G'],             // RNP APCH with RF (GNSS)
  'T1': ['G'],             // RNP AR APCH RF
}

// Two-character PBN code pattern
const PBN_CODE_RE = /[A-Z][0-9]/g

export class Item18Parser {
  parse(raw: string | null | undefined): Item18Parsed {
    const result: Item18Parsed = {
      dof: null, reg: null, pbnCodes: [], opr: null, sts: null,
      dep: null, dest: null, selcal: null, rmk: null, unknown: [], raw: raw ?? ''
    }

    if (!raw || raw.trim() === '' || raw.trim() === '0') return result

    // Split by known ICAO Item 18 keyword pattern: WORD/ ... next WORD/
    // We tokenize by finding keyword/value pairs
    const KEYWORDS = ['DOF', 'REG', 'PBN', 'OPR', 'STS', 'DEP', 'DEST', 'SEL', 'RMK',
                      'EET', 'DLE', 'TBE', 'SOURCE', 'CODE', 'DAT', 'NAV', 'COM', 'DAT',
                      'RIF', 'PER', 'ALTRV', 'ORGN', 'TYPE', 'ACTYPE', 'PCIS']

    const keywordPattern = new RegExp(
      `(${KEYWORDS.join('|')})\\/([^\\s${KEYWORDS.map(k => k[0]).join('')}]*)`, 'g'
    )

    // More robust: split by keyword/ boundaries
    const pairs = this.splitIntoPairs(raw)

    for (const { key, value } of pairs) {
      const v = value.trim()
      switch (key) {
        case 'DOF':  result.dof  = v; break
        case 'REG':  result.reg  = v; break
        case 'OPR':  result.opr  = v; break
        case 'STS':  result.sts  = v; break
        case 'DEP':  result.dep  = v; break
        case 'DEST': result.dest = v; break
        case 'SEL':  result.selcal = v; break
        case 'RMK':  result.rmk  = v; break
        case 'PBN':
          result.pbnCodes = this.parsePbnCodes(v)
          break
        case 'EET':
        case 'DLE':
        case 'TBE':
        case 'RIF':
        case 'PER':
        case 'CODE':
        case 'DAT':
        case 'NAV':
        case 'COM':
        case 'ORGN':
        case 'ALTRV':
          // Known but not currently processed — silently accepted
          break
        default:
          if (key) result.unknown.push(`${key}/${v}`)
      }
    }

    return result
  }

  // Split "DOF/240115 PBN/B4D3 OPR/INDIGO" into pairs
  private splitIntoPairs(raw: string): Array<{ key: string; value: string }> {
    const pairs: Array<{ key: string; value: string }> = []
    // Match KEYWORD/ followed by value (up to next KEYWORD/ or end)
    const re = /([A-Z]{2,6})\/(.*?)(?=\s+[A-Z]{2,6}\/|$)/gs
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      pairs.push({ key: m[1], value: m[2].trim() })
    }
    return pairs
  }

  // Parse PBN code string like "B4D3S1" into ["B4", "D3", "S1"]
  parsePbnCodes(pbnString: string): string[] {
    const codes: string[] = []
    let i = 0
    const s = pbnString.toUpperCase().replace(/\s+/g, '')
    while (i < s.length - 1) {
      const code = s.substring(i, i + 2)
      if (/^[A-Z][0-9]$/.test(code)) {
        codes.push(code)
        i += 2
      } else {
        i++
      }
    }
    return codes
  }

  // Returns the Item 10 equipment codes required for a given PBN code
  getRequiredEquipmentForPbn(pbnCode: string): string[] {
    return PBN_REQUIRED_EQUIPMENT[pbnCode] ?? []
  }

  // Validate DOF format YYMMDD — month 01-12, day 01-31
  validateDof(dof: string): boolean {
    if (!/^\d{6}$/.test(dof)) return false
    const month = parseInt(dof.substring(2, 4))
    const day   = parseInt(dof.substring(4, 6))
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
  }
}
