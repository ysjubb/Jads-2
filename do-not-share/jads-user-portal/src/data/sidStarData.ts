export interface SidStarProcedure {
  airport: string
  type: 'SID' | 'STAR'
  name: string
  runways: string[]
  initialFix: string
  fixes: string[]
}

export const SID_STAR_DATA: SidStarProcedure[] = [
  // VIDP (Delhi IGI)
  { airport: 'VIDP', type: 'SID', name: 'DOVAN1D', runways: ['28L', '28R'], initialFix: 'DOVAN', fixes: ['DOVAN', 'TULNA'] },
  { airport: 'VIDP', type: 'SID', name: 'PALAM1D', runways: ['28L', '28R'], initialFix: 'PALAM', fixes: ['PALAM', 'DPN'] },
  { airport: 'VIDP', type: 'SID', name: 'AGERA1D', runways: ['28L', '28R'], initialFix: 'AGERA', fixes: ['AGERA', 'VNS'] },
  { airport: 'VIDP', type: 'STAR', name: 'DOVAN1A', runways: ['28L', '28R', '10L', '10R'], initialFix: 'DOVAN', fixes: ['DOVAN', 'PALAM'] },
  { airport: 'VIDP', type: 'STAR', name: 'ATKOL1A', runways: ['28L', '28R'], initialFix: 'ATKOL', fixes: ['ATKOL', 'NAGLI'] },
  // VABB (Mumbai CSIA)
  { airport: 'VABB', type: 'SID', name: 'PEPUK2A', runways: ['27', '09'], initialFix: 'PEPUK', fixes: ['PEPUK', 'NATKA'] },
  { airport: 'VABB', type: 'SID', name: 'BOLUR1A', runways: ['27'], initialFix: 'BOLUR', fixes: ['BOLUR'] },
  { airport: 'VABB', type: 'STAR', name: 'NATKA1B', runways: ['27', '09'], initialFix: 'NATKA', fixes: ['NATKA', 'PEPUK'] },
  { airport: 'VABB', type: 'STAR', name: 'BUSOL1B', runways: ['27'], initialFix: 'BUSOL', fixes: ['BUSOL', 'PEPUK'] },
  // VOMM (Chennai)
  { airport: 'VOMM', type: 'SID', name: 'SEBLO1A', runways: ['07', '25'], initialFix: 'SEBLO', fixes: ['SEBLO'] },
  { airport: 'VOMM', type: 'STAR', name: 'SEBLO1B', runways: ['07', '25'], initialFix: 'SEBLO', fixes: ['SEBLO'] },
  // VECC (Kolkata)
  { airport: 'VECC', type: 'SID', name: 'GGC1A', runways: ['19L', '19R'], initialFix: 'GGC', fixes: ['GGC', 'ANKUR'] },
  { airport: 'VECC', type: 'STAR', name: 'GGC1B', runways: ['19L', '19R', '01L', '01R'], initialFix: 'GGC', fixes: ['GGC'] },
  // VOBL (Bengaluru KIA)
  { airport: 'VOBL', type: 'SID', name: 'ANIRO1A', runways: ['09L', '09R'], initialFix: 'ANIRO', fixes: ['ANIRO'] },
  { airport: 'VOBL', type: 'STAR', name: 'ANIRO1B', runways: ['09L', '09R', '27L', '27R'], initialFix: 'ANIRO', fixes: ['ANIRO'] },
  // VAAH (Ahmedabad)
  { airport: 'VAAH', type: 'SID', name: 'BPL1A', runways: ['23', '05'], initialFix: 'BPL', fixes: ['BPL'] },
  // VOHY (Hyderabad)
  { airport: 'VOHY', type: 'SID', name: 'POXOD1A', runways: ['09L', '09R'], initialFix: 'POXOD', fixes: ['POXOD'] },
  { airport: 'VOHY', type: 'STAR', name: 'POXOD1B', runways: ['27L', '27R'], initialFix: 'POXOD', fixes: ['POXOD'] },
]

export function getSIDsForAirport(icao: string): SidStarProcedure[] {
  return SID_STAR_DATA.filter(p => p.airport === icao.toUpperCase() && p.type === 'SID')
}

export function getSTARsForAirport(icao: string): SidStarProcedure[] {
  return SID_STAR_DATA.filter(p => p.airport === icao.toUpperCase() && p.type === 'STAR')
}
