// Adapter interface for AFMLU (Air Force Major Line Unit) data providers.
// Provides ADC (Airspace Design Cell) records — drone airspace zone definitions.

export interface AdcArea {
  type:        'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

export interface AdcVerticalLimits {
  lowerFt:  number
  lowerRef: string  // AGL, AMSL, FL
  upperFt:  number
  upperRef: string
}

export interface AdcRecord {
  afmluId:          number
  adcNumber:        string
  adcType:          string   // PROHIBITED, RESTRICTED, DANGER, CONTROLLED, etc.
  area:             AdcArea
  verticalLimits:   AdcVerticalLimits
  effectiveFrom:    string
  effectiveTo:      string | null
  activitySchedule: string | null
  contactFrequency: string | null
  remarks:          string | null
  fetchedAtUtc:     string
}

export interface AdcPullResult {
  records:  AdcRecord[]
  asOfUtc:  string
}

export interface AdcUpdateResult {
  newRecords:          AdcRecord[]
  withdrawnAdcNumbers: string[]
  asOfUtc:             string
}

export interface IAfmluAdapter {
  // Pull all current ADC records from an AFMLU.
  pullAdcRecords(afmluId: number): Promise<AdcPullResult>

  // Pull only ADC records changed since a given timestamp.
  pullAdcUpdates(afmluId: number, sinceUtc: string): Promise<AdcUpdateResult>
}
