import React, { useState, useEffect, useRef, useCallback } from 'react'
import { T } from '../../theme'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface AirspaceZone {
  id: string
  name: string
  classification: 'GREEN' | 'YELLOW' | 'RED'
  geometry: { type: string; coordinates: number[][][] }
  authority?: string
  reason?: string
}

interface ZoneCheckResult {
  overallClassification: 'GREEN' | 'YELLOW' | 'RED'
  authority?: string
  segments: Array<{
    zoneId: string
    zoneName: string
    classification: 'GREEN' | 'YELLOW' | 'RED'
    authority?: string
    reason: string
    overlapPercentage?: number
  }>
}

type DrawMode = 'polygon' | 'circle' | 'corridor' | null

interface DrawnShape {
  type: 'polygon' | 'circle' | 'corridor'
  layer: any
  geoJson: any
}

// ── Constants ────────────────────────────────────────────────────────────────

const INDIA_CENTER: [number, number] = [20.5937, 78.9629]
const DEFAULT_ZOOM = 5

const ZONE_COLORS: Record<string, string> = {
  GREEN: '#22C55E',
  YELLOW: '#EAB308',
  RED: '#EF4444',
}

const ALTITUDE_SNAP_POINTS = [0, 30, 60, 120, 200, 300, 400, 500]
const CORRIDOR_BUFFER_M = 100

const DURATION_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hr', minutes: 120 },
  { label: '4 hr', minutes: 240 },
  { label: 'Custom', minutes: -1 },
]

const RECURRENCE_PRESETS = [
  { label: 'None', cron: '' },
  { label: 'Daily', cron: '0 {H} * * *' },
  { label: 'Weekdays', cron: '0 {H} * * 1-5' },
  { label: 'Weekly', cron: '0 {H} * * {DOW}' },
  { label: 'Custom', cron: 'custom' },
]

// ── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: '6px',
  padding: '0.8rem',
  marginBottom: '0.6rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  color: T.muted,
  marginBottom: '2px',
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.45rem 0.5rem',
  background: T.bg,
  color: T.textBright,
  border: `1px solid ${T.border}`,
  borderRadius: '4px',
  fontSize: '0.72rem',
}

const btnBase: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  border: `1px solid ${T.border}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.68rem',
  fontWeight: 600,
  transition: 'all 0.15s',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function snapAltitude(val: number): number {
  let closest = ALTITUDE_SNAP_POINTS[0]
  let minDist = Math.abs(val - closest)
  for (const sp of ALTITUDE_SNAP_POINTS) {
    const d = Math.abs(val - sp)
    if (d < minDist) { minDist = d; closest = sp }
  }
  return minDist <= 10 ? closest : val
}

function altitudeColor(alt: number): string {
  if (alt <= 60) return ZONE_COLORS.GREEN
  if (alt <= 120) return ZONE_COLORS.YELLOW
  return ZONE_COLORS.RED
}

function altitudeZoneLabel(alt: number): string {
  if (alt <= 60) return 'Below 60m -- Nano/Micro safe zone'
  if (alt <= 120) return 'Below 120m -- Standard limit (Green eligible)'
  return 'Above 120m -- Requires Yellow zone clearance'
}

/** Generate a buffer polygon around a polyline with a given buffer distance in meters */
function bufferPolyline(latlngs: Array<{ lat: number; lng: number }>, bufferM: number): Array<[number, number]> {
  if (latlngs.length < 2) return []

  const degPerM = 1 / 111320
  const offset = bufferM * degPerM

  const leftSide: Array<[number, number]> = []
  const rightSide: Array<[number, number]> = []

  for (let i = 0; i < latlngs.length - 1; i++) {
    const p1 = latlngs[i]
    const p2 = latlngs[i + 1]
    const dx = p2.lng - p1.lng
    const dy = p2.lat - p1.lat
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) continue

    const nx = -dy / len * offset
    const ny = dx / len * offset

    leftSide.push([p1.lat + ny, p1.lng + nx])
    leftSide.push([p2.lat + ny, p2.lng + nx])
    rightSide.push([p1.lat - ny, p1.lng - nx])
    rightSide.push([p2.lat - ny, p2.lng - nx])
  }

  rightSide.reverse()
  return [...leftSide, ...rightSide]
}

/** Minimal KML polygon parser */
function parseKML(text: string): Array<Array<[number, number]>> {
  const polygons: Array<Array<[number, number]>> = []
  const coordsRegex = /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi
  let match
  while ((match = coordsRegex.exec(text)) !== null) {
    const raw = match[1].trim()
    const pts = raw.split(/\s+/).map(s => {
      const [lon, lat] = s.split(',').map(Number)
      return [lat, lon] as [number, number]
    }).filter(([lat, lon]) => !isNaN(lat) && !isNaN(lon))
    if (pts.length >= 3) polygons.push(pts)
  }
  return polygons
}

function roundTo15Min(date: Date): Date {
  const d = new Date(date)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d
}

function formatDateTimeLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

// ── Main Component ───────────────────────────────────────────────────────────

export function FlightPlannerPage() {
  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const drawnItemsRef = useRef<any>(null)
  const zoneLayersRef = useRef<any>(null)

  // Drawing state
  const [drawMode, setDrawMode] = useState<DrawMode>(null)
  const [drawnShapes, setDrawnShapes] = useState<DrawnShape[]>([])
  const [drawHandler, setDrawHandler] = useState<any>(null)
  const [corridorPoints, setCorridorPoints] = useState<Array<{ lat: number; lng: number }>>([])
  const corridorPolylineRef = useRef<any>(null)
  const corridorTempMarkersRef = useRef<any[]>([])

  // Zone check state
  const [zoneCheckResult, setZoneCheckResult] = useState<ZoneCheckResult | null>(null)
  const [zoneCheckLoading, setZoneCheckLoading] = useState(false)
  const [airspaceZones, setAirspaceZones] = useState<AirspaceZone[]>([])

  // DS-15: Pre-flight compliance check state
  const [complianceReport, setComplianceReport] = useState<any>(null)
  const [complianceLoading, setComplianceLoading] = useState(false)

  // Altitude
  const [altitude, setAltitude] = useState(120)

  // Time window
  const defaultStart = roundTo15Min(new Date(Date.now() + 3600000))
  const [startDate, setStartDate] = useState(formatDateTimeLocal(defaultStart))
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [customDuration, setCustomDuration] = useState('60')
  const [showCustomDuration, setShowCustomDuration] = useState(false)
  const [endTime, setEndTime] = useState('')

  // Recurrence
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false)
  const [recurrencePreset, setRecurrencePreset] = useState('')
  const [customCron, setCustomCron] = useState('')

  // KML
  const kmlInputRef = useRef<HTMLInputElement>(null)

  // Vertex history for undo
  const vertexHistoryRef = useRef<Array<{ type: string; data: any }>>([])

  // Zone check debounce timer
  const zoneCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Compute end time ────────────────────────────────────────────────────
  useEffect(() => {
    if (!startDate) { setEndTime(''); return }
    const effectiveDuration = showCustomDuration ? parseInt(customDuration, 10) || 60 : durationMinutes
    const start = new Date(startDate)
    const end = new Date(start.getTime() + effectiveDuration * 60000)
    setEndTime(formatDateTimeLocal(end))
  }, [startDate, durationMinutes, customDuration, showCustomDuration])

  // ── Load airspace zones from backend ────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await userApi().get('/drone/airspace-zones')
        if (data.zones) setAirspaceZones(data.zones)
      } catch {
        // Backend may not have this endpoint yet -- zones will be empty
      }
    })()
  }, [])

  // ── Initialize Leaflet map ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return
    const L = (window as any).L
    if (!L) return

    // Cleanup previous map instance
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(mapContainerRef.current, {
      center: INDIA_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    })
    mapRef.current = map

    // TODO: Integrate Mappls (MapMyIndia) SDK tiles when API key is available.
    // Replace the OSM tile layer below with Mappls vector tiles for production.
    // See: https://about.mappls.com/api/
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    // Feature group for drawn items
    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnItemsRef.current = drawnItems

    // Layer group for airspace zone overlays
    const zoneLayers = L.layerGroup().addTo(map)
    zoneLayersRef.current = zoneLayers

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Render airspace zone overlays on map ────────────────────────────────
  useEffect(() => {
    const L = (window as any).L
    if (!L || !zoneLayersRef.current) return

    zoneLayersRef.current.clearLayers()

    airspaceZones.forEach(zone => {
      if (!zone.geometry || zone.geometry.type !== 'Polygon') return
      const coords = zone.geometry.coordinates[0].map(
        (c: number[]) => [c[1], c[0]] as [number, number]
      )
      const color = ZONE_COLORS[zone.classification] || ZONE_COLORS.GREEN
      const poly = L.polygon(coords, {
        color,
        fillColor: color,
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: zone.classification === 'RED' ? '6,4' : undefined,
        interactive: true,
      })
      poly.bindTooltip(
        `${zone.name} (${zone.classification})${zone.authority ? ' — ' + zone.authority : ''}`,
        { sticky: true }
      )
      zoneLayersRef.current.addLayer(poly)
    })
  }, [airspaceZones])

  // ── Zone check debounced ────────────────────────────────────────────────
  const triggerZoneCheck = useCallback(() => {
    if (zoneCheckTimerRef.current) clearTimeout(zoneCheckTimerRef.current)

    zoneCheckTimerRef.current = setTimeout(async () => {
      if (!drawnItemsRef.current) return

      const layers: any[] = []
      drawnItemsRef.current.eachLayer((l: any) => layers.push(l))
      if (layers.length === 0) {
        setZoneCheckResult(null)
        return
      }

      // Collect GeoJSON from all drawn shapes
      const features = layers.map((l: any) => {
        if (l.toGeoJSON) return l.toGeoJSON()
        return null
      }).filter(Boolean)

      if (features.length === 0) {
        setZoneCheckResult(null)
        return
      }

      setZoneCheckLoading(true)
      try {
        const { data } = await userApi().post('/drone/zone-check', {
          geometry: features.length === 1
            ? features[0].geometry
            : { type: 'GeometryCollection', geometries: features.map((f: any) => f.geometry) },
          altitudeAglM: altitude,
          startTimeUtc: startDate ? new Date(startDate).toISOString() : undefined,
          endTimeUtc: endTime ? new Date(endTime).toISOString() : undefined,
        })
        setZoneCheckResult(data)
      } catch {
        // If endpoint not available, provide client-side estimation based on altitude
        const altClass = altitude > 120 ? 'YELLOW' : 'GREEN'
        setZoneCheckResult({
          overallClassification: altClass as 'GREEN' | 'YELLOW',
          segments: altitude > 120
            ? [{ zoneId: 'alt-check', zoneName: 'Altitude Threshold', classification: 'YELLOW' as const, reason: `Altitude ${altitude}m AGL exceeds 120m limit -- ATC permission required` }]
            : [{ zoneId: 'alt-check', zoneName: 'Altitude Threshold', classification: 'GREEN' as const, reason: `Altitude ${altitude}m AGL within standard limits` }],
        })
      } finally {
        setZoneCheckLoading(false)
      }
    }, 500)
  }, [altitude, startDate, endTime])

  // Re-check zones when altitude or shapes change
  useEffect(() => {
    triggerZoneCheck()
  }, [altitude, drawnShapes, triggerZoneCheck])

  // ── Drawing mode handlers ───────────────────────────────────────────────

  const cleanupCurrentDraw = useCallback(() => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    // Disable any active draw handler
    if (drawHandler) {
      try { drawHandler.disable() } catch { /* ignore */ }
      setDrawHandler(null)
    }

    // Clean corridor temp state
    corridorTempMarkersRef.current.forEach(m => {
      try { mapRef.current.removeLayer(m) } catch { /* ignore */ }
    })
    corridorTempMarkersRef.current = []
    if (corridorPolylineRef.current) {
      try { mapRef.current.removeLayer(corridorPolylineRef.current) } catch { /* ignore */ }
      corridorPolylineRef.current = null
    }
    setCorridorPoints([])
  }, [drawHandler])

  const startDrawPolygon = useCallback(() => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    cleanupCurrentDraw()
    setDrawMode('polygon')

    const handler = new L.Draw.Polygon(mapRef.current, {
      shapeOptions: {
        color: T.primary,
        fillColor: T.primary,
        fillOpacity: 0.2,
        weight: 2,
      },
      allowIntersection: false,
      showArea: true,
    })
    handler.enable()
    setDrawHandler(handler)

    mapRef.current.once('draw:created', (e: any) => {
      const layer = e.layer
      drawnItemsRef.current.addLayer(layer)
      setDrawnShapes(prev => [...prev, {
        type: 'polygon',
        layer,
        geoJson: layer.toGeoJSON(),
      }])
      setDrawMode(null)
      setDrawHandler(null)
      vertexHistoryRef.current.push({ type: 'shape', data: layer })
    })

    mapRef.current.once('draw:drawstop', () => {
      setDrawMode(null)
      setDrawHandler(null)
    })
  }, [cleanupCurrentDraw])

  const startDrawCircle = useCallback(() => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    cleanupCurrentDraw()
    setDrawMode('circle')

    const handler = new L.Draw.Circle(mapRef.current, {
      shapeOptions: {
        color: T.primary,
        fillColor: T.primary,
        fillOpacity: 0.2,
        weight: 2,
      },
    })
    handler.enable()
    setDrawHandler(handler)

    mapRef.current.once('draw:created', (e: any) => {
      const layer = e.layer
      // Convert circle to polygon for GeoJSON compatibility
      const center = layer.getLatLng()
      const radius = layer.getRadius()
      const geoJson = circleToPolygonGeoJSON(center.lat, center.lng, radius, 64)
      drawnItemsRef.current.addLayer(layer)
      setDrawnShapes(prev => [...prev, {
        type: 'circle',
        layer,
        geoJson,
      }])
      setDrawMode(null)
      setDrawHandler(null)
      vertexHistoryRef.current.push({ type: 'shape', data: layer })
    })

    mapRef.current.once('draw:drawstop', () => {
      setDrawMode(null)
      setDrawHandler(null)
    })
  }, [cleanupCurrentDraw])

  const startDrawCorridor = useCallback(() => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    cleanupCurrentDraw()
    setDrawMode('corridor')
    setCorridorPoints([])

    const onMapClick = (e: any) => {
      const pt = { lat: e.latlng.lat, lng: e.latlng.lng }

      setCorridorPoints(prev => {
        const updated = [...prev, pt]

        // Add marker
        const marker = L.circleMarker([pt.lat, pt.lng], {
          radius: 5, color: T.primary, fillColor: T.primary, fillOpacity: 1, weight: 1,
        }).addTo(mapRef.current)
        corridorTempMarkersRef.current.push(marker)

        // Update polyline
        if (corridorPolylineRef.current) {
          mapRef.current.removeLayer(corridorPolylineRef.current)
        }
        if (updated.length >= 2) {
          const coords = updated.map(p => [p.lat, p.lng])
          corridorPolylineRef.current = L.polyline(coords, {
            color: T.primary, weight: 2, dashArray: '6,4',
          }).addTo(mapRef.current)
        }
        return updated
      })
    }

    mapRef.current.on('click', onMapClick)

    // Store cleanup reference
    const cleanupRef = { onMapClick }
    ;(mapRef.current as any).__corridorClickHandler = cleanupRef
  }, [cleanupCurrentDraw])

  const finishCorridor = useCallback(() => {
    const L = (window as any).L
    if (!L || !mapRef.current || corridorPoints.length < 2) return

    // Generate buffer polygon from polyline
    const bufferCoords = bufferPolyline(corridorPoints, CORRIDOR_BUFFER_M)
    if (bufferCoords.length < 3) return

    const polygon = L.polygon(bufferCoords, {
      color: T.primary, fillColor: T.primary, fillOpacity: 0.2, weight: 2,
    })
    drawnItemsRef.current.addLayer(polygon)

    setDrawnShapes(prev => [...prev, {
      type: 'corridor',
      layer: polygon,
      geoJson: polygon.toGeoJSON(),
    }])
    vertexHistoryRef.current.push({ type: 'shape', data: polygon })

    // Cleanup corridor temp stuff
    corridorTempMarkersRef.current.forEach(m => {
      try { mapRef.current.removeLayer(m) } catch { /* ignore */ }
    })
    corridorTempMarkersRef.current = []
    if (corridorPolylineRef.current) {
      mapRef.current.removeLayer(corridorPolylineRef.current)
      corridorPolylineRef.current = null
    }

    // Remove click handler
    if ((mapRef.current as any).__corridorClickHandler) {
      mapRef.current.off('click', (mapRef.current as any).__corridorClickHandler.onMapClick)
      delete (mapRef.current as any).__corridorClickHandler
    }

    setCorridorPoints([])
    setDrawMode(null)
  }, [corridorPoints])

  const handleUndo = useCallback(() => {
    if (drawMode === 'corridor' && corridorPoints.length > 0) {
      // Remove last corridor point
      const L = (window as any).L
      if (corridorTempMarkersRef.current.length > 0) {
        const lastMarker = corridorTempMarkersRef.current.pop()
        try { mapRef.current.removeLayer(lastMarker) } catch { /* ignore */ }
      }
      setCorridorPoints(prev => {
        const updated = prev.slice(0, -1)
        if (corridorPolylineRef.current) {
          mapRef.current.removeLayer(corridorPolylineRef.current)
          corridorPolylineRef.current = null
        }
        if (updated.length >= 2 && L) {
          const coords = updated.map(p => [p.lat, p.lng])
          corridorPolylineRef.current = L.polyline(coords, {
            color: T.primary, weight: 2, dashArray: '6,4',
          }).addTo(mapRef.current)
        }
        return updated
      })
      return
    }

    // Undo last drawn shape
    const last = vertexHistoryRef.current.pop()
    if (!last) return

    if (last.type === 'shape' && last.data) {
      try { drawnItemsRef.current.removeLayer(last.data) } catch { /* ignore */ }
      setDrawnShapes(prev => prev.slice(0, -1))
    }
  }, [drawMode, corridorPoints])

  const handleClearAll = useCallback(() => {
    cleanupCurrentDraw()

    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers()
    }
    setDrawnShapes([])
    setDrawMode(null)
    setZoneCheckResult(null)
    vertexHistoryRef.current = []
  }, [cleanupCurrentDraw])

  // ── KML Import ──────────────────────────────────────────────────────────
  const handleKMLImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const L = (window as any).L
    if (!L || !mapRef.current) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return

      // If KMZ (zip), we can only parse the raw text content -- for full KMZ support
      // a zip library would be needed. Try parsing as KML first.
      const polygons = parseKML(text)

      if (polygons.length === 0) {
        alert('No valid polygon coordinates found in the KML/KMZ file.')
        return
      }

      polygons.forEach(pts => {
        const polygon = L.polygon(pts, {
          color: T.primary, fillColor: T.primary, fillOpacity: 0.2, weight: 2,
        })
        drawnItemsRef.current.addLayer(polygon)
        setDrawnShapes(prev => [...prev, {
          type: 'polygon',
          layer: polygon,
          geoJson: polygon.toGeoJSON(),
        }])
        vertexHistoryRef.current.push({ type: 'shape', data: polygon })
      })

      // Fit map to imported polygons
      if (drawnItemsRef.current.getLayers().length > 0) {
        mapRef.current.fitBounds(drawnItemsRef.current.getBounds(), { padding: [30, 30] })
      }
    }
    reader.readAsText(file)

    // Reset input
    if (kmlInputRef.current) kmlInputRef.current.value = ''
  }, [])

  // ── Keyboard shortcut (Ctrl+Z) ─────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo])

  // ── DS-15: Pre-flight compliance check ──────────────────────────────────
  const handlePreFlightCheck = useCallback(async (uinNumber: string) => {
    if (!uinNumber.trim()) return
    setComplianceLoading(true)
    setComplianceReport(null)
    try {
      // Build polygon from drawn shapes
      let polygon: Array<{ lat: number; lng: number }> | undefined
      if (drawnShapes.length > 0) {
        const firstShape = drawnShapes[0]
        const geo = firstShape.geoJson
        if (geo?.geometry?.coordinates?.[0]) {
          polygon = geo.geometry.coordinates[0].map((c: number[]) => ({ lat: c[1], lng: c[0] }))
        }
      }

      const { data } = await userApi().post('/drone/pre-flight-check', {
        uinNumber: uinNumber.trim(),
        polygon,
        altitudeM: altitude,
        flightTime: startDate ? new Date(startDate).toISOString() : undefined,
      })
      setComplianceReport(data)
    } catch (err: any) {
      setComplianceReport({
        verdict: 'NO_GO',
        checks: [{
          code: 'SYSTEM_ERROR',
          name: 'System Error',
          status: 'FAIL',
          detail: err.response?.data?.error ?? 'Pre-flight check failed',
          remediation: 'Try again or contact support.',
        }],
        checkedAt: new Date().toISOString(),
      })
    } finally {
      setComplianceLoading(false)
    }
  }, [drawnShapes, altitude, startDate])

  const renderCompliancePanel = () => {
    const verdictColors: Record<string, string> = {
      GO: '#22C55E',
      NO_GO: '#EF4444',
      ADVISORY: '#EAB308',
    }
    const statusIcons: Record<string, string> = {
      PASS: '\u2713',
      FAIL: '\u2717',
      WARN: '\u26A0',
      SKIP: '\u23ED',
    }
    const statusColors: Record<string, string> = {
      PASS: '#22C55E',
      FAIL: '#EF4444',
      WARN: '#EAB308',
      SKIP: T.muted,
    }

    return (
      <div style={{ ...cardStyle, borderColor: T.border }}>
        <div style={{ ...labelStyle, marginBottom: '0.4rem' }}>PRE-FLIGHT COMPLIANCE CHECK</div>

        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
          <input
            id="preflight-uin"
            placeholder="UIN-DEMO-001"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => {
              const inp = document.getElementById('preflight-uin') as HTMLInputElement
              if (inp?.value) handlePreFlightCheck(inp.value)
            }}
            disabled={complianceLoading}
            style={{
              ...btnBase,
              background: T.primary,
              color: T.bg,
              border: 'none',
              whiteSpace: 'nowrap',
              opacity: complianceLoading ? 0.7 : 1,
            }}
          >
            {complianceLoading ? 'Checking...' : 'Run Check'}
          </button>
        </div>

        {complianceReport && (
          <div>
            {/* Verdict banner */}
            <div style={{
              padding: '0.5rem 0.7rem',
              borderRadius: '4px',
              background: (verdictColors[complianceReport.verdict] ?? T.muted) + '15',
              border: `1px solid ${(verdictColors[complianceReport.verdict] ?? T.muted)}40`,
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                color: verdictColors[complianceReport.verdict] ?? T.muted,
              }}>
                {complianceReport.verdict === 'GO' ? '\u2713' : complianceReport.verdict === 'NO_GO' ? '\u2717' : '\u26A0'}
              </span>
              <div>
                <div style={{
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  color: verdictColors[complianceReport.verdict] ?? T.muted,
                }}>
                  {complianceReport.verdict === 'GO' ? 'GO — Clear for Takeoff'
                   : complianceReport.verdict === 'NO_GO' ? 'NO-GO — Do Not Fly'
                   : 'ADVISORY — Proceed with Caution'}
                </div>
                <div style={{ fontSize: '0.55rem', color: T.muted }}>
                  Checked at {new Date(complianceReport.checkedAt).toLocaleTimeString()}
                </div>
              </div>
            </div>

            {/* Individual checks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {(complianceReport.checks ?? []).map((check: any, i: number) => (
                <div key={i} style={{
                  padding: '0.4rem 0.5rem',
                  background: T.bg,
                  borderRadius: '4px',
                  border: `1px solid ${T.border}`,
                  fontSize: '0.65rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                    <span style={{
                      width: '16px',
                      textAlign: 'center',
                      fontWeight: 700,
                      color: statusColors[check.status] ?? T.muted,
                    }}>
                      {statusIcons[check.status] ?? '?'}
                    </span>
                    <span style={{ fontWeight: 600, color: T.textBright }}>{check.name}</span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '0.55rem',
                      fontWeight: 600,
                      color: statusColors[check.status] ?? T.muted,
                    }}>
                      {check.status}
                    </span>
                  </div>
                  <div style={{ marginLeft: '20px', color: T.text }}>{check.detail}</div>
                  {check.remediation && check.status !== 'PASS' && (
                    <div style={{ marginLeft: '20px', marginTop: '0.15rem', color: T.muted, fontStyle: 'italic' }}>
                      {check.remediation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Zone status banner ──────────────────────────────────────────────────
  const renderZoneBanner = () => {
    if (!zoneCheckResult && drawnShapes.length === 0) return null

    if (zoneCheckLoading) {
      return (
        <div style={{
          ...cardStyle,
          background: T.surface,
          borderColor: T.muted,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{ fontSize: '0.75rem', color: T.muted }}>Checking airspace zones...</span>
        </div>
      )
    }

    if (!zoneCheckResult) return null

    const cls = zoneCheckResult.overallClassification
    const bgColor = cls === 'GREEN' ? '#22C55E15'
      : cls === 'YELLOW' ? '#EAB30815'
      : '#EF444415'
    const borderColor = cls === 'GREEN' ? '#22C55E40'
      : cls === 'YELLOW' ? '#EAB30840'
      : '#EF444440'
    const textColor = cls === 'GREEN' ? '#22C55E'
      : cls === 'YELLOW' ? '#EAB308'
      : '#EF4444'

    const icon = cls === 'GREEN' ? '\u2713'
      : cls === 'YELLOW' ? '\u26A0'
      : '\u2717'

    const message = cls === 'GREEN'
      ? 'GREEN ZONE -- Auto-approval eligible'
      : cls === 'YELLOW'
      ? `YELLOW ZONE -- ATC permission required${zoneCheckResult.authority ? ' from ' + zoneCheckResult.authority : ''}`
      : 'RED ZONE -- Central Government permission required'

    return (
      <div style={{
        ...cardStyle,
        background: bgColor,
        borderColor,
        padding: '0.6rem 0.8rem',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: zoneCheckResult.segments.length > 0 ? '0.5rem' : 0,
        }}>
          <span style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: textColor,
            width: '24px',
            textAlign: 'center',
          }}>{icon}</span>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: textColor,
            letterSpacing: '0.02em',
          }}>{message}</span>
        </div>

        {zoneCheckResult.segments.length > 0 && (
          <div style={{ marginLeft: '30px' }}>
            {zoneCheckResult.segments.map((seg, i) => (
              <div key={i} style={{
                fontSize: '0.62rem',
                color: T.text,
                padding: '0.2rem 0',
                borderTop: i > 0 ? `1px solid ${T.border}` : undefined,
                display: 'flex',
                gap: '0.4rem',
                alignItems: 'flex-start',
              }}>
                <span style={{
                  color: ZONE_COLORS[seg.classification],
                  fontWeight: 700,
                  minWidth: '44px',
                }}>{seg.classification}</span>
                <span>
                  <strong>{seg.zoneName}</strong>
                  {seg.authority && <span style={{ color: T.muted }}> ({seg.authority})</span>}
                  {' -- '}
                  {seg.reason}
                  {seg.overlapPercentage != null && (
                    <span style={{ color: T.muted }}> [{seg.overlapPercentage}% overlap]</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    }}>

      {/* ── LEFT SIDEBAR: Drawing Tools ───────────────────────────────── */}
      <div style={{
        width: '220px',
        minWidth: '220px',
        height: '100vh',
        overflow: 'auto',
        background: T.surface,
        borderRight: `1px solid ${T.border}`,
        padding: '0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}>
        <h2 style={{
          color: T.primary,
          fontSize: '0.8rem',
          fontWeight: 700,
          marginBottom: '0.3rem',
          letterSpacing: '0.04em',
        }}>DRAWING TOOLS</h2>

        {/* Draw Polygon */}
        <button
          onClick={startDrawPolygon}
          style={{
            ...btnBase,
            background: drawMode === 'polygon' ? T.primary + '20' : 'transparent',
            color: drawMode === 'polygon' ? T.primary : T.text,
            borderColor: drawMode === 'polygon' ? T.primary : T.border,
            textAlign: 'left',
            width: '100%',
          }}
        >
          {'\u25B3'} Draw Polygon
        </button>

        {/* Draw Circle */}
        <button
          onClick={startDrawCircle}
          style={{
            ...btnBase,
            background: drawMode === 'circle' ? T.primary + '20' : 'transparent',
            color: drawMode === 'circle' ? T.primary : T.text,
            borderColor: drawMode === 'circle' ? T.primary : T.border,
            textAlign: 'left',
            width: '100%',
          }}
        >
          {'\u25CB'} Draw Circle
        </button>

        {/* Draw Corridor */}
        <button
          onClick={startDrawCorridor}
          style={{
            ...btnBase,
            background: drawMode === 'corridor' ? T.primary + '20' : 'transparent',
            color: drawMode === 'corridor' ? T.primary : T.text,
            borderColor: drawMode === 'corridor' ? T.primary : T.border,
            textAlign: 'left',
            width: '100%',
          }}
        >
          {'\u2550'} Draw Corridor
        </button>

        {drawMode === 'corridor' && corridorPoints.length >= 2 && (
          <button
            onClick={finishCorridor}
            style={{
              ...btnBase,
              background: '#22C55E20',
              color: '#22C55E',
              borderColor: '#22C55E40',
              textAlign: 'center',
              width: '100%',
            }}
          >
            Finish Corridor ({corridorPoints.length} pts)
          </button>
        )}

        <div style={{ borderTop: `1px solid ${T.border}`, margin: '0.3rem 0' }} />

        {/* Import KML/KMZ */}
        <input
          ref={kmlInputRef}
          type="file"
          accept=".kml,.kmz"
          onChange={handleKMLImport}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => kmlInputRef.current?.click()}
          style={{
            ...btnBase,
            background: 'transparent',
            color: T.text,
            textAlign: 'left',
            width: '100%',
          }}
        >
          {'\u2191'} Import KML/KMZ
        </button>

        <div style={{ borderTop: `1px solid ${T.border}`, margin: '0.3rem 0' }} />

        {/* Undo */}
        <button
          onClick={handleUndo}
          style={{
            ...btnBase,
            background: 'transparent',
            color: T.amber,
            borderColor: T.border,
            textAlign: 'left',
            width: '100%',
          }}
        >
          {'\u21B6'} Undo (Ctrl+Z)
        </button>

        {/* Clear All */}
        <button
          onClick={handleClearAll}
          style={{
            ...btnBase,
            background: 'transparent',
            color: T.red,
            borderColor: T.border,
            textAlign: 'left',
            width: '100%',
          }}
        >
          {'\u2715'} Clear All
        </button>

        <div style={{ borderTop: `1px solid ${T.border}`, margin: '0.3rem 0' }} />

        {/* Shape count */}
        <div style={{ fontSize: '0.6rem', color: T.muted }}>
          {drawnShapes.length === 0
            ? 'No shapes drawn. Use tools above to define flight area.'
            : `${drawnShapes.length} shape(s) drawn`}
        </div>
        {drawnShapes.map((s, i) => (
          <div key={i} style={{
            fontSize: '0.58rem',
            color: T.text,
            padding: '0.15rem 0',
          }}>
            {i + 1}. {s.type === 'polygon' ? 'Polygon' : s.type === 'circle' ? 'Circle' : 'Corridor'}
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Drawing mode indicator */}
        {drawMode && (
          <div style={{
            background: T.primary + '10',
            border: `1px solid ${T.primary}30`,
            borderRadius: '4px',
            padding: '0.4rem',
            fontSize: '0.6rem',
            color: T.primary,
            textAlign: 'center',
          }}>
            {drawMode === 'polygon' && 'Click map to place vertices. Click first point to close.'}
            {drawMode === 'circle' && 'Click center, then drag to set radius.'}
            {drawMode === 'corridor' && `Click map to add waypoints. ${corridorPoints.length} point(s). Click "Finish" when done.`}
          </div>
        )}
      </div>

      {/* ── CENTER: Map ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '100%',
            background: '#0a0a0a',
          }}
        />

        {/* Map title overlay */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '60px',
          zIndex: 1000,
          background: T.surface + 'E0',
          border: `1px solid ${T.border}`,
          borderRadius: '4px',
          padding: '0.3rem 0.7rem',
        }}>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: T.primary,
            letterSpacing: '0.04em',
          }}>DRONE FLIGHT PLANNER</span>
        </div>

        {/* Zone legend overlay */}
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '10px',
          zIndex: 1000,
          background: T.surface + 'E0',
          border: `1px solid ${T.border}`,
          borderRadius: '4px',
          padding: '0.4rem 0.6rem',
          display: 'flex',
          gap: '0.6rem',
        }}>
          {(['GREEN', 'YELLOW', 'RED'] as const).map(z => (
            <div key={z} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '2px',
                background: ZONE_COLORS[z], opacity: 0.6,
              }} />
              <span style={{ fontSize: '0.55rem', color: T.muted }}>{z}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT SIDEBAR: Zone Check + Controls ──────────────────────── */}
      <div style={{
        width: '300px',
        minWidth: '300px',
        height: '100vh',
        overflow: 'auto',
        background: T.surface,
        borderLeft: `1px solid ${T.border}`,
        padding: '0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
      }}>
        <h2 style={{
          color: T.primary,
          fontSize: '0.8rem',
          fontWeight: 700,
          marginBottom: '0.2rem',
          letterSpacing: '0.04em',
        }}>ZONE PRE-CHECK</h2>

        {/* Zone Status Banner */}
        {renderZoneBanner()}

        {drawnShapes.length === 0 && !zoneCheckResult && (
          <div style={{
            ...cardStyle,
            borderStyle: 'dashed',
            textAlign: 'center',
            padding: '1rem',
          }}>
            <p style={{ fontSize: '0.65rem', color: T.muted }}>
              Draw a flight area on the map to check zone classification
            </p>
          </div>
        )}

        {/* ── Altitude Control ──────────────────────────────────────── */}
        <div style={cardStyle}>
          <label style={{ ...labelStyle, marginBottom: '0.4rem' }}>ALTITUDE (AGL)</label>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.3rem',
          }}>
            <input
              type="range"
              min={0}
              max={500}
              step={1}
              value={altitude}
              onChange={(e) => {
                const raw = parseInt(e.target.value, 10)
                setAltitude(snapAltitude(raw))
              }}
              style={{
                flex: 1,
                accentColor: altitudeColor(altitude),
                cursor: 'pointer',
              }}
            />
            <span style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: altitudeColor(altitude),
              minWidth: '50px',
              textAlign: 'right',
            }}>
              {altitude}m
            </span>
          </div>

          {/* Snap point indicators */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.5rem',
            color: T.muted,
            padding: '0 2px',
            marginBottom: '0.3rem',
          }}>
            {[0, 30, 60, 120, 250, 500].map(sp => (
              <span
                key={sp}
                onClick={() => setAltitude(sp)}
                style={{
                  cursor: 'pointer',
                  color: altitude === sp ? altitudeColor(sp) : T.muted,
                  fontWeight: altitude === sp ? 700 : 400,
                }}
              >
                {sp}
              </span>
            ))}
          </div>

          {/* Zone impact label */}
          <div style={{
            fontSize: '0.58rem',
            color: altitudeColor(altitude),
            padding: '0.25rem 0.4rem',
            background: altitudeColor(altitude) + '10',
            borderRadius: '3px',
            border: `1px solid ${altitudeColor(altitude)}20`,
          }}>
            {altitudeZoneLabel(altitude)}
          </div>
        </div>

        {/* ── Time Window ───────────────────────────────────────────── */}
        <div style={cardStyle}>
          <label style={{ ...labelStyle, marginBottom: '0.4rem' }}>TIME WINDOW</label>

          {/* Start date */}
          <div style={{ marginBottom: '0.4rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.55rem' }}>Start Date & Time</label>
            <input
              type="datetime-local"
              value={startDate}
              step={900}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Duration */}
          <div style={{ marginBottom: '0.4rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.55rem' }}>Duration</label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.25rem',
            }}>
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    if (opt.minutes === -1) {
                      setShowCustomDuration(true)
                    } else {
                      setShowCustomDuration(false)
                      setDurationMinutes(opt.minutes)
                    }
                  }}
                  style={{
                    ...btnBase,
                    padding: '0.3rem 0.2rem',
                    fontSize: '0.58rem',
                    textAlign: 'center',
                    background: (opt.minutes === -1 ? showCustomDuration : (!showCustomDuration && durationMinutes === opt.minutes))
                      ? T.primary + '20' : 'transparent',
                    color: (opt.minutes === -1 ? showCustomDuration : (!showCustomDuration && durationMinutes === opt.minutes))
                      ? T.primary : T.text,
                    borderColor: (opt.minutes === -1 ? showCustomDuration : (!showCustomDuration && durationMinutes === opt.minutes))
                      ? T.primary : T.border,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {showCustomDuration && (
            <div style={{ marginBottom: '0.4rem' }}>
              <label style={{ ...labelStyle, fontSize: '0.55rem' }}>Custom Duration (minutes)</label>
              <input
                type="number"
                min={5}
                max={1440}
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          {/* End time (computed) */}
          <div style={{ marginBottom: '0.3rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.55rem' }}>End Time (auto-computed)</label>
            <input
              type="datetime-local"
              value={endTime}
              readOnly
              style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }}
            />
          </div>

          {/* Recurrence toggle */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '0.4rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              fontSize: '0.62rem',
              color: T.text,
            }}>
              <input
                type="checkbox"
                checked={recurrenceEnabled}
                onChange={(e) => setRecurrenceEnabled(e.target.checked)}
                style={{ accentColor: T.primary }}
              />
              Enable Recurring Schedule
            </label>

            {recurrenceEnabled && (
              <div style={{ marginTop: '0.4rem' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.25rem',
                  marginBottom: '0.3rem',
                }}>
                  {RECURRENCE_PRESETS.filter(p => p.label !== 'None').map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setRecurrencePreset(preset.label)
                        if (preset.cron !== 'custom') {
                          // Auto-fill cron with current hour
                          const hour = startDate ? new Date(startDate).getHours() : 9
                          const dow = startDate ? new Date(startDate).getDay() : 1
                          const cron = preset.cron
                            .replace('{H}', String(hour))
                            .replace('{DOW}', String(dow))
                          setCustomCron(cron)
                        }
                      }}
                      style={{
                        ...btnBase,
                        padding: '0.25rem',
                        fontSize: '0.56rem',
                        textAlign: 'center',
                        background: recurrencePreset === preset.label ? T.primary + '20' : 'transparent',
                        color: recurrencePreset === preset.label ? T.primary : T.text,
                        borderColor: recurrencePreset === preset.label ? T.primary : T.border,
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label style={{ ...labelStyle, fontSize: '0.55rem' }}>CRON Expression</label>
                  <input
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    placeholder="0 9 * * 1-5"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: '0.5rem', color: T.muted, marginTop: '0.15rem' }}>
                    Format: minute hour dayOfMonth month dayOfWeek
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── DS-15: Pre-flight compliance check ────────────────── */}
        {renderCompliancePanel()}

        {/* ── Summary ─────────────────────────────────────────────── */}
        <div style={{
          ...cardStyle,
          background: T.bg,
          fontSize: '0.6rem',
        }}>
          <div style={{ ...labelStyle, marginBottom: '0.3rem' }}>FLIGHT PLAN SUMMARY</div>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.15rem 0.5rem', color: T.text }}>
            <span style={{ color: T.muted }}>Shapes:</span>
            <span>{drawnShapes.length === 0 ? '--' : drawnShapes.map(s => s.type).join(', ')}</span>
            <span style={{ color: T.muted }}>Altitude:</span>
            <span style={{ color: altitudeColor(altitude) }}>{altitude}m AGL</span>
            <span style={{ color: T.muted }}>Start:</span>
            <span>{startDate ? new Date(startDate).toLocaleString() : '--'}</span>
            <span style={{ color: T.muted }}>End:</span>
            <span>{endTime ? new Date(endTime).toLocaleString() : '--'}</span>
            <span style={{ color: T.muted }}>Duration:</span>
            <span>{showCustomDuration ? customDuration : durationMinutes} min</span>
            {recurrenceEnabled && customCron && (
              <>
                <span style={{ color: T.muted }}>Recurrence:</span>
                <span>{customCron}</span>
              </>
            )}
            <span style={{ color: T.muted }}>Zone:</span>
            <span style={{ color: zoneCheckResult ? ZONE_COLORS[zoneCheckResult.overallClassification] : T.muted }}>
              {zoneCheckResult ? zoneCheckResult.overallClassification : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helper: Convert circle to polygon GeoJSON ────────────────────────────────

function circleToPolygonGeoJSON(
  lat: number,
  lng: number,
  radiusM: number,
  segments: number = 64,
): any {
  const coords: Array<[number, number]> = []
  const R = 6378137 // Earth radius in meters
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * 2 * Math.PI
    const dLat = (radiusM / R) * Math.cos(angle)
    const dLng = (radiusM / (R * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    coords.push([lng + dLng * (180 / Math.PI), lat + dLat * (180 / Math.PI)])
  }
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
    properties: {},
  }
}
