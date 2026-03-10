export interface AirwaySegment {
  designator: string
  upperFL: number
  lowerFL: number
  direction: 'BOTH' | 'N' | 'S' | 'E' | 'W'
  fixes: string[]
  oceanic: boolean
  cdr: boolean
  adsb_required: boolean
}

export const INDIAN_AIRWAYS: AirwaySegment[] = [
  // DOMESTIC LOWER AIRWAYS (below FL245)
  { designator: 'W33', upperFL: 245, lowerFL: 0, direction: 'BOTH', fixes: ['DPN', 'AGG', 'BILAN', 'POSIG', 'BPL', 'KKJ'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'W10N', upperFL: 245, lowerFL: 0, direction: 'N', fixes: ['TULNA', 'DOVAN', 'AGERA', 'PALAM'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'W10S', upperFL: 245, lowerFL: 0, direction: 'S', fixes: ['PALAM', 'AGERA', 'DOVAN', 'TULNA'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'W19', upperFL: 245, lowerFL: 0, direction: 'BOTH', fixes: ['DPN', 'NATKA', 'PEPUK', 'BPL'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'W20', upperFL: 245, lowerFL: 0, direction: 'BOTH', fixes: ['DOVAN', 'NAGLI', 'BUSOL', 'GUDUM'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'W53', upperFL: 245, lowerFL: 0, direction: 'BOTH', fixes: ['GGC', 'ANKUR', 'GUWAH'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'W55', upperFL: 245, lowerFL: 0, direction: 'BOTH', fixes: ['GUWAH', 'DIBRU'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'W68', upperFL: 245, lowerFL: 0, direction: 'BOTH', fixes: ['DOVAN', 'ARWIL', 'BUSOL'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'W137', upperFL: 245, lowerFL: 0, direction: 'BOTH', fixes: ['VECC', 'SILCH', 'IMPHL'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'A461', upperFL: 460, lowerFL: 0, direction: 'BOTH', fixes: ['LKN', 'VNS', 'GGC'], oceanic: false, cdr: false, adsb_required: true },
  { designator: 'G452', upperFL: 460, lowerFL: 0, direction: 'BOTH', fixes: ['VABB', 'GOA', 'VOBL', 'VOMM'], oceanic: false, cdr: false, adsb_required: true },
  { designator: 'R460', upperFL: 460, lowerFL: 0, direction: 'BOTH', fixes: ['VOMM', 'VOCL', 'VCBI'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'L301', upperFL: 460, lowerFL: 0, direction: 'BOTH', fixes: ['VIDP', 'VIAR', 'VNKT'], oceanic: false, cdr: false, adsb_required: true },
  { designator: 'M635', upperFL: 460, lowerFL: 0, direction: 'W', fixes: ['VABB', 'BOLUR', 'OMDB'], oceanic: true, cdr: false, adsb_required: true },
  { designator: 'L507', upperFL: 460, lowerFL: 0, direction: 'E', fixes: ['VECC', 'VGHS', 'VTBD'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'J7', upperFL: 245, lowerFL: 0, direction: 'BOTH', fixes: ['GUWAH', 'DIMAPUR'], oceanic: false, cdr: true, adsb_required: false },
  // OCEANIC (RNAV 10 required)
  { designator: 'Q1', upperFL: 460, lowerFL: 280, direction: 'BOTH', fixes: ['VOMM', 'SEBLO', 'NODOL'], oceanic: true, cdr: false, adsb_required: true },
  { designator: 'Q3', upperFL: 460, lowerFL: 280, direction: 'BOTH', fixes: ['VECC', 'POXOD', 'NOKID'], oceanic: true, cdr: false, adsb_required: true },
  { designator: 'Q13', upperFL: 460, lowerFL: 280, direction: 'W', fixes: ['VABB', 'KITAL', 'BIBGO'], oceanic: true, cdr: false, adsb_required: true },
  { designator: 'L894', upperFL: 460, lowerFL: 280, direction: 'W', fixes: ['VABB', 'BIBGO', 'OMDB'], oceanic: true, cdr: false, adsb_required: true },
  // INTERNATIONAL
  { designator: 'P570', upperFL: 460, lowerFL: 0, direction: 'W', fixes: ['VIDP', 'OSDI', 'OMDB'], oceanic: false, cdr: false, adsb_required: true },
  { designator: 'N571', upperFL: 460, lowerFL: 0, direction: 'W', fixes: ['VIDP', 'OPRN', 'OEJN'], oceanic: false, cdr: false, adsb_required: true },
  { designator: 'G463', upperFL: 460, lowerFL: 0, direction: 'E', fixes: ['VECC', 'VYYY', 'VTBS'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'B463', upperFL: 460, lowerFL: 0, direction: 'BOTH', fixes: ['TULNA', 'NATKA', 'PEPUK'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'A464', upperFL: 460, lowerFL: 0, direction: 'BOTH', fixes: ['DOVAN', 'TULNA'], oceanic: false, cdr: false, adsb_required: false },
  { designator: 'M557', upperFL: 460, lowerFL: 0, direction: 'BOTH', fixes: ['NATKA', 'PEPUK'], oceanic: false, cdr: false, adsb_required: false },
]

export function findAirway(designator: string): AirwaySegment | undefined {
  return INDIAN_AIRWAYS.find(a => a.designator === designator.toUpperCase())
}

export function getAirwayFixes(designator: string): string[] {
  return findAirway(designator)?.fixes ?? []
}
