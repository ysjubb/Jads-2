export type ChartType = 'SID' | 'STAR' | 'APPROACH' | 'ENROUTE' | 'TAXI';
export type NOTAMType = 'N' | 'R' | 'C';

export interface AeroChart {
  id: string;
  icaoCode: string;
  chartType: ChartType;
  name: string;
  airacCycle: string;
  effectiveDate: string;
  url?: string;
}

export interface NOTAM {
  id: string;
  icaoLocation: string;
  type: NOTAMType;
  startTime: string;
  endTime: string;
  text: string;
  qCode: string;
  radius?: number;
  coordinates?: { lat: number; lng: number };
}
