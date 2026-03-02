// Stub implementation of IMetarAdapter.
// Returns deterministic METAR data for the 12 major Indian aerodromes.
// Government replaces this with live METAR source (DGCA/IMD feed).
// This stub must never make network calls.

import type { IMetarAdapter, MetarData } from '../interfaces/IMetarAdapter'

// Stable observation time for idempotency in tests
const OBS_UTC = '2024-01-15T06:00:00Z'

const STUB_METARS: Record<string, MetarData> = {
  VIDP: {
    icaoCode: 'VIDP', rawText: 'METAR VIDP 150600Z 27008KT 5000 HZ SCT030 25/12 Q1013 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 270, windSpeedKt: 8, windGustKt: null,
    visibilityM: 5000, tempC: 25, dewPointC: 12, altimeterHpa: 1013, isSpeci: false,
  },
  VABB: {
    icaoCode: 'VABB', rawText: 'METAR VABB 150600Z 23015KT 8000 FEW020 29/24 Q1010 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 230, windSpeedKt: 15, windGustKt: null,
    visibilityM: 8000, tempC: 29, dewPointC: 24, altimeterHpa: 1010, isSpeci: false,
  },
  VOMM: {
    icaoCode: 'VOMM', rawText: 'METAR VOMM 150600Z 20010KT 9999 SCT018 31/23 Q1008 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 200, windSpeedKt: 10, windGustKt: null,
    visibilityM: 9999, tempC: 31, dewPointC: 23, altimeterHpa: 1008, isSpeci: false,
  },
  VECC: {
    icaoCode: 'VECC', rawText: 'METAR VECC 150600Z 18012KT 7000 SCT025 28/22 Q1011 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 180, windSpeedKt: 12, windGustKt: null,
    visibilityM: 7000, tempC: 28, dewPointC: 22, altimeterHpa: 1011, isSpeci: false,
  },
  VOBL: {
    icaoCode: 'VOBL', rawText: 'METAR VOBL 150600Z 25008KT 9999 FEW040 27/16 Q1014 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 250, windSpeedKt: 8, windGustKt: null,
    visibilityM: 9999, tempC: 27, dewPointC: 16, altimeterHpa: 1014, isSpeci: false,
  },
  VOHB: {
    icaoCode: 'VOHB', rawText: 'METAR VOHB 150600Z 28005KT 9999 SKC 32/18 Q1013 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 280, windSpeedKt: 5, windGustKt: null,
    visibilityM: 9999, tempC: 32, dewPointC: 18, altimeterHpa: 1013, isSpeci: false,
  },
  VAAH: {
    icaoCode: 'VAAH', rawText: 'METAR VAAH 150600Z 30012KT 9999 FEW015 33/20 Q1011 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 300, windSpeedKt: 12, windGustKt: null,
    visibilityM: 9999, tempC: 33, dewPointC: 20, altimeterHpa: 1011, isSpeci: false,
  },
  VOGO: {
    icaoCode: 'VOGO', rawText: 'METAR VOGO 150600Z 19010KT 8000 SCT020 30/25 Q1009 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 190, windSpeedKt: 10, windGustKt: null,
    visibilityM: 8000, tempC: 30, dewPointC: 25, altimeterHpa: 1009, isSpeci: false,
  },
  VOCL: {
    icaoCode: 'VOCL', rawText: 'METAR VOCL 150600Z 21012KT 9999 FEW025 30/24 Q1009 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 210, windSpeedKt: 12, windGustKt: null,
    visibilityM: 9999, tempC: 30, dewPointC: 24, altimeterHpa: 1009, isSpeci: false,
  },
  VIBN: {
    icaoCode: 'VIBN', rawText: 'METAR VIBN 150600Z 26008KT 6000 HZ FEW035 28/14 Q1012 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 260, windSpeedKt: 8, windGustKt: null,
    visibilityM: 6000, tempC: 28, dewPointC: 14, altimeterHpa: 1012, isSpeci: false,
  },
  VORY: {
    icaoCode: 'VORY', rawText: 'METAR VORY 150600Z 24010KT 9999 FEW020 29/22 Q1010 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 240, windSpeedKt: 10, windGustKt: null,
    visibilityM: 9999, tempC: 29, dewPointC: 22, altimeterHpa: 1010, isSpeci: false,
  },
  VIPT: {
    icaoCode: 'VIPT', rawText: 'METAR VIPT 150600Z 28006KT 9999 SKC 24/10 Q1015 NOSIG',
    observationUtc: OBS_UTC, windDirDeg: 280, windSpeedKt: 6, windGustKt: null,
    visibilityM: 9999, tempC: 24, dewPointC: 10, altimeterHpa: 1015, isSpeci: false,
  },
}

export class MetarAdapterStub implements IMetarAdapter {
  async getLatestMetar(icaoCode: string): Promise<MetarData | null> {
    return STUB_METARS[icaoCode] ?? null
  }

  async getMetarHistory(icaoCode: string, _hoursBack: number): Promise<MetarData[]> {
    const m = STUB_METARS[icaoCode]
    return m ? [m] : []
  }
}
