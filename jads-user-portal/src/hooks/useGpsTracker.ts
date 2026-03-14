// GPS Track Recorder hook — uses browser Geolocation API (works in Capacitor too).
// Records lat/lon/alt at configurable interval (default 1s).
// Returns array of GPS points for upload as a track log.

import { useState, useRef, useCallback } from 'react'

export interface GpsPoint {
  lat: number
  lon: number
  alt: number
  timestampMs: number
  accuracy: number
  speed: number | null
}

export interface GpsTrackerState {
  isTracking:  boolean
  points:      GpsPoint[]
  elapsed:     number     // seconds
  lastPoint:   GpsPoint | null
  error:       string | null
  maxAltitude: number
  distance:    number     // meters (cumulative)
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function useGpsTracker(intervalMs = 1000) {
  const [state, setState] = useState<GpsTrackerState>({
    isTracking: false, points: [], elapsed: 0,
    lastPoint: null, error: null, maxAltitude: 0, distance: 0,
  })

  const watchIdRef   = useRef<number | null>(null)
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const pointsRef    = useRef<GpsPoint[]>([])
  const lastRef      = useRef<GpsPoint | null>(null)
  const distRef      = useRef<number>(0)
  const maxAltRef    = useRef<number>(0)

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation not supported by this browser' }))
      return
    }

    pointsRef.current = []
    lastRef.current    = null
    distRef.current    = 0
    maxAltRef.current  = 0
    startTimeRef.current = Date.now()

    setState({
      isTracking: true, points: [], elapsed: 0,
      lastPoint: null, error: null, maxAltitude: 0, distance: 0,
    })

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const pt: GpsPoint = {
          lat:         pos.coords.latitude,
          lon:         pos.coords.longitude,
          alt:         pos.coords.altitude ?? 0,
          timestampMs: pos.timestamp,
          accuracy:    pos.coords.accuracy,
          speed:       pos.coords.speed,
        }

        // Skip if accuracy is too poor (>50m)
        if (pt.accuracy > 50) return

        // Compute distance from last point
        if (lastRef.current) {
          distRef.current += haversineM(lastRef.current.lat, lastRef.current.lon, pt.lat, pt.lon)
        }

        if (pt.alt > maxAltRef.current) maxAltRef.current = pt.alt

        pointsRef.current.push(pt)
        lastRef.current = pt

        setState(s => ({
          ...s,
          points:      [...pointsRef.current],
          lastPoint:   pt,
          maxAltitude: maxAltRef.current,
          distance:    distRef.current,
          error:       null,
        }))
      },
      (err) => {
        setState(s => ({ ...s, error: `GPS Error: ${err.message}` }))
      },
      {
        enableHighAccuracy: true,
        maximumAge:         intervalMs,
        timeout:            10000,
      }
    )

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setState(s => ({
        ...s,
        elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000),
      }))
    }, 1000)
  }, [intervalMs])

  const stop = useCallback((): GpsPoint[] => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const finalPoints = [...pointsRef.current]

    setState(s => ({
      ...s,
      isTracking: false,
      points:     finalPoints,
    }))

    return finalPoints
  }, [])

  const reset = useCallback(() => {
    stop()
    pointsRef.current = []
    lastRef.current    = null
    distRef.current    = 0
    maxAltRef.current  = 0
    setState({
      isTracking: false, points: [], elapsed: 0,
      lastPoint: null, error: null, maxAltitude: 0, distance: 0,
    })
  }, [stop])

  return { ...state, start, stop, reset }
}
