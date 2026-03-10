import { userApi } from '../api/client'

export interface AIRACCycle {
  cycleNumber: string
  effectiveDate: Date
  expiryDate: Date
}

export interface ChartData {
  id: string
  name: string
  type: 'SID' | 'STAR' | 'IAP' | 'AIRPORT' | 'ENROUTE'
  airport: string
  runway?: string
  effectiveDate: string
  amendmentNumber: number
  pdfUrl?: string
}

// AIRAC 2026 reference dates (28-day cycle)
const AIRAC_CYCLES_2026: AIRACCycle[] = [
  { cycleNumber: '2601', effectiveDate: new Date('2026-01-23'), expiryDate: new Date('2026-02-19') },
  { cycleNumber: '2602', effectiveDate: new Date('2026-02-20'), expiryDate: new Date('2026-03-19') },
  { cycleNumber: '2603', effectiveDate: new Date('2026-03-20'), expiryDate: new Date('2026-04-16') },
  { cycleNumber: '2604', effectiveDate: new Date('2026-04-17'), expiryDate: new Date('2026-05-14') },
  { cycleNumber: '2605', effectiveDate: new Date('2026-05-15'), expiryDate: new Date('2026-06-11') },
  { cycleNumber: '2606', effectiveDate: new Date('2026-06-12'), expiryDate: new Date('2026-07-09') },
  { cycleNumber: '2607', effectiveDate: new Date('2026-07-10'), expiryDate: new Date('2026-08-06') },
  { cycleNumber: '2608', effectiveDate: new Date('2026-08-07'), expiryDate: new Date('2026-09-03') },
  { cycleNumber: '2609', effectiveDate: new Date('2026-09-04'), expiryDate: new Date('2026-10-01') },
  { cycleNumber: '2610', effectiveDate: new Date('2026-10-02'), expiryDate: new Date('2026-10-29') },
  { cycleNumber: '2611', effectiveDate: new Date('2026-10-30'), expiryDate: new Date('2026-11-26') },
  { cycleNumber: '2612', effectiveDate: new Date('2026-11-27'), expiryDate: new Date('2026-12-24') },
  { cycleNumber: '2613', effectiveDate: new Date('2026-12-25'), expiryDate: new Date('2027-01-21') },
]

export function getCurrentAIRACCycle(): AIRACCycle {
  const now = new Date()
  const current = AIRAC_CYCLES_2026.find(c => now >= c.effectiveDate && now <= c.expiryDate)
  return current ?? AIRAC_CYCLES_2026[0]
}

export function getNextAIRACCycle(): AIRACCycle {
  const current = getCurrentAIRACCycle()
  const idx = AIRAC_CYCLES_2026.findIndex(c => c.cycleNumber === current.cycleNumber)
  return AIRAC_CYCLES_2026[idx + 1] ?? AIRAC_CYCLES_2026[AIRAC_CYCLES_2026.length - 1]
}

export function isChartCurrent(effectiveDate: Date): boolean {
  const cycle = getCurrentAIRACCycle()
  return effectiveDate >= cycle.effectiveDate
}

export function daysUntilExpiry(): number {
  const cycle = getCurrentAIRACCycle()
  return Math.ceil((cycle.expiryDate.getTime() - Date.now()) / 86400000)
}

export async function fetchJeppesenChart(airport: string, chartId: string): Promise<ChartData | null> {
  try {
    const { data } = await userApi().get(`/charts/jeppesen/${airport}/${chartId}`)
    return data
  } catch {
    return null
  }
}

export async function fetchAAIEAIPChart(airport: string, procedure: string): Promise<string> {
  // Returns PDF URL from AAI eAIP
  return `https://aim-india.aai.aero/eaip-v2-02-2026/${airport}/${procedure}.pdf`
}
