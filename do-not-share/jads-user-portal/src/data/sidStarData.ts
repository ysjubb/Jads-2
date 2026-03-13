export interface SidStarEntry {
  name: string;
  type: 'SID' | 'STAR';
  runway?: string;
  transition?: string;
}

export interface AirportProcedures {
  icao: string;
  name: string;
  procedures: SidStarEntry[];
}

export const SID_STAR_DATA: Record<string, AirportProcedures> = {
  VIDP: {
    icao: 'VIDP',
    name: 'Indira Gandhi International, Delhi',
    procedures: [
      { name: 'UXENI 1A', type: 'SID', runway: '29' },
      { name: 'PALAM 1B', type: 'SID', runway: '29' },
      { name: 'TULSI 2A', type: 'SID', runway: '11' },
      { name: 'UXENI 1C', type: 'STAR', runway: '29' },
      { name: 'ATKIL 1A', type: 'STAR', runway: '29' },
      { name: 'GUDUM 1A', type: 'STAR', runway: '11' },
    ],
  },
  VABB: {
    icao: 'VABB',
    name: 'Chhatrapati Shivaji Maharaj International, Mumbai',
    procedures: [
      { name: 'ANDHERI 7A', type: 'SID', runway: '27' },
      { name: 'MAROL 2B', type: 'SID', runway: '14' },
      { name: 'SUMAR 1A', type: 'STAR', runway: '27' },
      { name: 'TEKAL 3A', type: 'STAR', runway: '27' },
    ],
  },
  VOMM: {
    icao: 'VOMM',
    name: 'Chennai International',
    procedures: [
      { name: 'ELGAR 1A', type: 'SID', runway: '07' },
      { name: 'PALNA 2A', type: 'SID', runway: '25' },
      { name: 'GUDUM 2B', type: 'STAR', runway: '07' },
      { name: 'ELGAR 1B', type: 'STAR', runway: '25' },
    ],
  },
  VECC: {
    icao: 'VECC',
    name: 'Netaji Subhas Chandra Bose International, Kolkata',
    procedures: [
      { name: 'BUBNU 1A', type: 'SID', runway: '19R' },
      { name: 'LUNKA 2A', type: 'SID', runway: '01L' },
      { name: 'BUBNU 1B', type: 'STAR', runway: '19R' },
      { name: 'RAVTI 1A', type: 'STAR', runway: '01L' },
    ],
  },
  VOBL: {
    icao: 'VOBL',
    name: 'Kempegowda International, Bangalore',
    procedures: [
      { name: 'AKTIM 4A', type: 'SID', runway: '09L' },
      { name: 'TUKLI 2A', type: 'SID', runway: '27R' },
      { name: 'GUBBI 3A', type: 'STAR', runway: '09L' },
      { name: 'AKTIM 2B', type: 'STAR', runway: '27R' },
    ],
  },
  VAAH: {
    icao: 'VAAH',
    name: 'Sardar Vallabhbhai Patel International, Ahmedabad',
    procedures: [
      { name: 'IKAVA 1A', type: 'SID', runway: '23' },
      { name: 'RONOL 2A', type: 'SID', runway: '05' },
      { name: 'IKAVA 1B', type: 'STAR', runway: '23' },
      { name: 'RONOL 1A', type: 'STAR', runway: '05' },
    ],
  },
  VOCI: {
    icao: 'VOCI',
    name: 'Cochin International',
    procedures: [
      { name: 'KOKUP 1A', type: 'SID', runway: '27' },
      { name: 'PARAV 2A', type: 'SID', runway: '09' },
      { name: 'KOKUP 1B', type: 'STAR', runway: '27' },
      { name: 'PARAV 1A', type: 'STAR', runway: '09' },
    ],
  },
  VIAR: {
    icao: 'VIAR',
    name: 'Sri Guru Ram Dass Jee International, Amritsar',
    procedures: [
      { name: 'MITAL 1A', type: 'SID', runway: '34' },
      { name: 'GANDA 2A', type: 'SID', runway: '16' },
      { name: 'MITAL 1B', type: 'STAR', runway: '34' },
      { name: 'GANDA 1A', type: 'STAR', runway: '16' },
    ],
  },
  VIJP: {
    icao: 'VIJP',
    name: 'Jaipur International',
    procedures: [
      { name: 'RIDLA 1A', type: 'SID', runway: '27' },
      { name: 'AMLOD 2A', type: 'SID', runway: '09' },
      { name: 'RIDLA 1B', type: 'STAR', runway: '27' },
      { name: 'AMLOD 1A', type: 'STAR', runway: '09' },
    ],
  },
  VOHY: {
    icao: 'VOHY',
    name: 'Rajiv Gandhi International, Hyderabad',
    procedures: [
      { name: 'UKASO 4A', type: 'SID', runway: '09R' },
      { name: 'PALNA 3A', type: 'SID', runway: '27L' },
      { name: 'UKASO 2B', type: 'STAR', runway: '09R' },
      { name: 'PALNA 2A', type: 'STAR', runway: '27L' },
    ],
  },
};

export function getSidStarForAirport(icao: string): AirportProcedures | undefined {
  return SID_STAR_DATA[icao.toUpperCase()];
}
