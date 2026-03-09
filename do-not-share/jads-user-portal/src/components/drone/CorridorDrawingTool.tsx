import React, { useState, useRef, useCallback, useEffect } from 'react'
import * as turf from '@turf/turf'
import { kml } from '@tmcw/togeojson'
import { T } from '../../App'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CorridorResult {
  waypoints: Array<{ lat: number; lng: number }>
  bufferWidthM: number
  bufferedGeoJson: any
  locked: boolean
}

export interface FlightTemplate {
  id: string
  name: string
  description: string
  zone: 'GREEN' | 'YELLOW' | 'RED'
  areaSqKm: number
  geometry: any
  waypoints: Array<{ lat: number; lng: number }>
  bufferWidthM: number
  shared: boolean
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

interface CorridorDrawingToolProps {
  mapRef: React.MutableRefObject<any>
  drawnItemsRef: React.MutableRefObject<any>
  onCorridorComplete: (result: CorridorResult) => void
  onCancel: () => void
  /** If provided, pre-fill corridor from a template */
  initialTemplate?: FlightTemplate | null
}

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

const btnBase: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  border: `1px solid ${T.border}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.68rem',
  fontWeight: 600,
  transition: 'all 0.15s',
}

// ── Component ────────────────────────────────────────────────────────────────

export function CorridorDrawingTool({
  mapRef,
  drawnItemsRef,
  onCorridorComplete,
  onCancel,
  initialTemplate,
}: CorridorDrawingToolProps) {
  const [waypoints, setWaypoints] = useState<Array<{ lat: number; lng: number }>>([])
  const [bufferWidthM, setBufferWidthM] = useState(100)
  const [locked, setLocked] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDesc, setTemplateDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)
  const [templates, setTemplates] = useState<FlightTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  const kmlInputRef = useRef<HTMLInputElement>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const bufferLayerRef = useRef<any>(null)
  const clickHandlerRef = useRef<((e: any) => void) | null>(null)

  // ── Generate buffered GeoJSON from waypoints using Turf.js ─────────────
  const generateBuffer = useCallback((pts: Array<{ lat: number; lng: number }>, width: number) => {
    if (pts.length < 2) return null

    const lineCoords = pts.map(p => [p.lng, p.lat])
    const line = turf.lineString(lineCoords)
    const buffered = turf.buffer(line, width / 1000, { units: 'kilometers' })

    return buffered
  }, [])

  // ── Update map visuals ─────────────────────────────────────────────────
  const updateMapVisuals = useCallback((pts: Array<{ lat: number; lng: number }>, width: number) => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    // Update polyline
    if (polylineRef.current) {
      try { mapRef.current.removeLayer(polylineRef.current) } catch { /* ignore */ }
    }
    if (pts.length >= 2) {
      const coords = pts.map(p => [p.lat, p.lng])
      polylineRef.current = L.polyline(coords, {
        color: T.primary,
        weight: 2,
        dashArray: '6,4',
      }).addTo(mapRef.current)
    }

    // Update buffer polygon
    if (bufferLayerRef.current) {
      try { mapRef.current.removeLayer(bufferLayerRef.current) } catch { /* ignore */ }
      bufferLayerRef.current = null
    }

    const buffered = generateBuffer(pts, width)
    if (buffered && buffered.geometry) {
      const coords = buffered.geometry.coordinates[0].map(
        (c: number[]) => [c[1], c[0]] as [number, number]
      )
      bufferLayerRef.current = L.polygon(coords, {
        color: '#EAB308',
        fillColor: '#EAB308',
        fillOpacity: 0.2,
        weight: 1.5,
      }).addTo(mapRef.current)
    }
  }, [mapRef, generateBuffer])

  // ── Set up click handler for adding waypoints ──────────────────────────
  useEffect(() => {
    const L = (window as any).L
    if (!L || !mapRef.current || locked) return

    const onClick = (e: any) => {
      const pt = { lat: e.latlng.lat, lng: e.latlng.lng }

      setWaypoints(prev => {
        const updated = [...prev, pt]

        // Add marker
        const marker = L.circleMarker([pt.lat, pt.lng], {
          radius: 6,
          color: T.primary,
          fillColor: T.primary,
          fillOpacity: 1,
          weight: 1,
        }).addTo(mapRef.current)
        marker.bindTooltip(`WP ${updated.length}`, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: '',
        })
        markersRef.current.push(marker)

        updateMapVisuals(updated, bufferWidthM)
        return updated
      })
    }

    clickHandlerRef.current = onClick
    mapRef.current.on('click', onClick)

    return () => {
      if (mapRef.current && clickHandlerRef.current) {
        mapRef.current.off('click', clickHandlerRef.current)
        clickHandlerRef.current = null
      }
    }
  }, [mapRef, locked, bufferWidthM, updateMapVisuals])

  // ── Update buffer when slider changes ──────────────────────────────────
  useEffect(() => {
    if (waypoints.length >= 2) {
      updateMapVisuals(waypoints, bufferWidthM)
    }
  }, [bufferWidthM, waypoints, updateMapVisuals])

  // ── Load initial template if provided ──────────────────────────────────
  useEffect(() => {
    if (!initialTemplate) return
    const L = (window as any).L
    if (!L || !mapRef.current) return

    if (initialTemplate.waypoints && initialTemplate.waypoints.length >= 2) {
      setWaypoints(initialTemplate.waypoints)
      setBufferWidthM(initialTemplate.bufferWidthM || 100)

      // Add markers for template waypoints
      initialTemplate.waypoints.forEach((pt, i) => {
        const marker = L.circleMarker([pt.lat, pt.lng], {
          radius: 6,
          color: T.primary,
          fillColor: T.primary,
          fillOpacity: 1,
          weight: 1,
        }).addTo(mapRef.current)
        marker.bindTooltip(`WP ${i + 1}`, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: '',
        })
        markersRef.current.push(marker)
      })

      updateMapVisuals(initialTemplate.waypoints, initialTemplate.bufferWidthM || 100)

      // Fit map to waypoints
      const bounds = L.latLngBounds(initialTemplate.waypoints.map(
        (p: { lat: number; lng: number }) => [p.lat, p.lng]
      ))
      mapRef.current.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [initialTemplate, mapRef, updateMapVisuals])

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const map = mapRef.current
      if (!map) return

      // Remove markers
      markersRef.current.forEach(m => {
        try { map.removeLayer(m) } catch { /* ignore */ }
      })
      markersRef.current = []

      // Remove polyline
      if (polylineRef.current) {
        try { map.removeLayer(polylineRef.current) } catch { /* ignore */ }
        polylineRef.current = null
      }

      // Remove buffer layer
      if (bufferLayerRef.current) {
        try { map.removeLayer(bufferLayerRef.current) } catch { /* ignore */ }
        bufferLayerRef.current = null
      }

      // Remove click handler
      if (clickHandlerRef.current) {
        map.off('click', clickHandlerRef.current)
        clickHandlerRef.current = null
      }
    }
  }, [mapRef])

  // ── Undo last waypoint ─────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (locked || waypoints.length === 0) return

    const lastMarker = markersRef.current.pop()
    if (lastMarker && mapRef.current) {
      try { mapRef.current.removeLayer(lastMarker) } catch { /* ignore */ }
    }

    setWaypoints(prev => {
      const updated = prev.slice(0, -1)
      updateMapVisuals(updated, bufferWidthM)
      return updated
    })
  }, [locked, waypoints, mapRef, bufferWidthM, updateMapVisuals])

  // ── Lock corridor ──────────────────────────────────────────────────────
  const handleLock = useCallback(() => {
    if (waypoints.length < 2) return

    const buffered = generateBuffer(waypoints, bufferWidthM)
    if (!buffered) return

    setLocked(true)

    // Remove click handler
    if (mapRef.current && clickHandlerRef.current) {
      mapRef.current.off('click', clickHandlerRef.current)
      clickHandlerRef.current = null
    }

    // Add the buffer polygon to drawnItems
    const L = (window as any).L
    if (L && drawnItemsRef.current && buffered.geometry) {
      const coords = buffered.geometry.coordinates[0].map(
        (c: number[]) => [c[1], c[0]] as [number, number]
      )
      const polygon = L.polygon(coords, {
        color: '#EAB308',
        fillColor: '#EAB308',
        fillOpacity: 0.25,
        weight: 2,
      })
      drawnItemsRef.current.addLayer(polygon)
    }

    onCorridorComplete({
      waypoints,
      bufferWidthM,
      bufferedGeoJson: buffered,
      locked: true,
    })
  }, [waypoints, bufferWidthM, generateBuffer, mapRef, drawnItemsRef, onCorridorComplete])

  // ── KML Import ─────────────────────────────────────────────────────────
  const handleKmlImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const L = (window as any).L
    if (!L || !mapRef.current) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return

      try {
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(text, 'text/xml')
        const geoJson = kml(xmlDoc)

        if (!geoJson || !geoJson.features || geoJson.features.length === 0) {
          alert('No valid features found in the KML file.')
          return
        }

        // Extract coordinates from first LineString or Polygon
        let extractedPoints: Array<{ lat: number; lng: number }> = []

        for (const feature of geoJson.features) {
          const geom = feature.geometry
          if (!geom) continue

          if (geom.type === 'LineString') {
            extractedPoints = (geom.coordinates as number[][]).map(c => ({
              lat: c[1],
              lng: c[0],
            }))
            break
          } else if (geom.type === 'Polygon') {
            // Use outer ring as corridor path
            extractedPoints = (geom.coordinates[0] as number[][]).map(c => ({
              lat: c[1],
              lng: c[0],
            }))
            break
          } else if (geom.type === 'MultiLineString') {
            // Use first line
            extractedPoints = (geom.coordinates[0] as number[][]).map(c => ({
              lat: c[1],
              lng: c[0],
            }))
            break
          }
        }

        if (extractedPoints.length < 2) {
          alert('KML file must contain at least 2 coordinate points (LineString or Polygon).')
          return
        }

        // Clear existing waypoints
        markersRef.current.forEach(m => {
          try { mapRef.current.removeLayer(m) } catch { /* ignore */ }
        })
        markersRef.current = []

        // Add new markers
        extractedPoints.forEach((pt, i) => {
          const marker = L.circleMarker([pt.lat, pt.lng], {
            radius: 6,
            color: T.primary,
            fillColor: T.primary,
            fillOpacity: 1,
            weight: 1,
          }).addTo(mapRef.current)
          marker.bindTooltip(`WP ${i + 1}`, {
            permanent: true,
            direction: 'top',
            offset: [0, -8],
            className: '',
          })
          markersRef.current.push(marker)
        })

        setWaypoints(extractedPoints)
        updateMapVisuals(extractedPoints, bufferWidthM)

        // Fit map bounds
        const bounds = L.latLngBounds(extractedPoints.map(p => [p.lat, p.lng]))
        mapRef.current.fitBounds(bounds, { padding: [50, 50] })
      } catch (err) {
        alert('Failed to parse KML file. Ensure it is a valid KML document.')
      }
    }
    reader.readAsText(file)

    // Reset file input
    if (kmlInputRef.current) kmlInputRef.current.value = ''
  }, [mapRef, bufferWidthM, updateMapVisuals])

  // ── Save as Template ───────────────────────────────────────────────────
  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim()) return
    if (waypoints.length < 2) return

    setSaving(true)
    try {
      const buffered = generateBuffer(waypoints, bufferWidthM)
      const areaSqKm = buffered
        ? turf.area(buffered) / 1_000_000
        : 0

      await userApi().post('/drone/flight-templates', {
        name: templateName.trim(),
        description: templateDesc.trim(),
        geometry: buffered,
        waypoints,
        bufferWidthM,
        areaSqKm,
      })

      setSaveDialogOpen(false)
      setTemplateName('')
      setTemplateDesc('')
    } catch {
      alert('Failed to save template. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [templateName, templateDesc, waypoints, bufferWidthM, generateBuffer])

  // ── Load Templates ─────────────────────────────────────────────────────
  const handleLoadTemplates = useCallback(async () => {
    setLoadDialogOpen(true)
    setLoadingTemplates(true)
    try {
      const { data } = await userApi().get('/drone/flight-templates')
      setTemplates(data.templates || [])
    } catch {
      setTemplates([])
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  const handleSelectTemplate = useCallback((tmpl: FlightTemplate) => {
    const L = (window as any).L
    if (!L || !mapRef.current) return

    // Clear existing
    markersRef.current.forEach(m => {
      try { mapRef.current.removeLayer(m) } catch { /* ignore */ }
    })
    markersRef.current = []

    if (tmpl.waypoints && tmpl.waypoints.length >= 2) {
      // Add markers
      tmpl.waypoints.forEach((pt, i) => {
        const marker = L.circleMarker([pt.lat, pt.lng], {
          radius: 6,
          color: T.primary,
          fillColor: T.primary,
          fillOpacity: 1,
          weight: 1,
        }).addTo(mapRef.current)
        marker.bindTooltip(`WP ${i + 1}`, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: '',
        })
        markersRef.current.push(marker)
      })

      setWaypoints(tmpl.waypoints)
      setBufferWidthM(tmpl.bufferWidthM || 100)
      updateMapVisuals(tmpl.waypoints, tmpl.bufferWidthM || 100)

      // Fit map
      const bounds = L.latLngBounds(tmpl.waypoints.map(p => [p.lat, p.lng]))
      mapRef.current.fitBounds(bounds, { padding: [50, 50] })
    }

    setLoadDialogOpen(false)
    setLocked(false)
  }, [mapRef, updateMapVisuals])

  // ── Compute corridor area ──────────────────────────────────────────────
  const corridorArea = waypoints.length >= 2
    ? (() => {
        const buffered = generateBuffer(waypoints, bufferWidthM)
        if (!buffered) return 0
        return turf.area(buffered) / 1_000_000
      })()
    : 0

  // Corridor length
  const corridorLength = waypoints.length >= 2
    ? (() => {
        const lineCoords = waypoints.map(p => [p.lng, p.lat])
        const line = turf.lineString(lineCoords)
        return turf.length(line, { units: 'kilometers' })
      })()
    : 0

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.2rem',
      }}>
        <h3 style={{
          color: '#EAB308',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}>CORRIDOR DRAWING</h3>
        <button
          onClick={onCancel}
          style={{
            ...btnBase,
            padding: '0.2rem 0.5rem',
            fontSize: '0.58rem',
            background: 'transparent',
            color: T.red,
          }}
        >
          Cancel
        </button>
      </div>

      {/* Instructions */}
      {!locked && (
        <div style={{
          background: T.primary + '10',
          border: `1px solid ${T.primary}30`,
          borderRadius: '4px',
          padding: '0.4rem',
          fontSize: '0.58rem',
          color: T.primary,
        }}>
          Click on the map to add waypoints. Minimum 2 points required.
          {waypoints.length > 0 && ` (${waypoints.length} point${waypoints.length !== 1 ? 's' : ''} placed)`}
        </div>
      )}

      {/* Buffer Width Slider */}
      <div style={cardStyle}>
        <label style={{ ...labelStyle, marginBottom: '0.4rem' }}>BUFFER WIDTH</label>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={bufferWidthM}
            onChange={(e) => setBufferWidthM(parseInt(e.target.value, 10))}
            disabled={locked}
            style={{
              flex: 1,
              accentColor: '#EAB308',
              cursor: locked ? 'not-allowed' : 'pointer',
            }}
          />
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#EAB308',
            minWidth: '55px',
            textAlign: 'right',
          }}>
            {bufferWidthM}m
          </span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.48rem',
          color: T.muted,
          padding: '0 2px',
          marginTop: '0.15rem',
        }}>
          {[10, 50, 100, 200, 300, 500].map(v => (
            <span
              key={v}
              onClick={() => !locked && setBufferWidthM(v)}
              style={{
                cursor: locked ? 'default' : 'pointer',
                color: bufferWidthM === v ? '#EAB308' : T.muted,
                fontWeight: bufferWidthM === v ? 700 : 400,
              }}
            >
              {v}
            </span>
          ))}
        </div>
      </div>

      {/* Corridor Stats */}
      {waypoints.length >= 2 && (
        <div style={{
          ...cardStyle,
          background: T.bg,
          fontSize: '0.6rem',
        }}>
          <div style={{ ...labelStyle, marginBottom: '0.3rem' }}>CORRIDOR STATS</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr',
            gap: '0.15rem 0.5rem',
            color: T.text,
          }}>
            <span style={{ color: T.muted }}>Waypoints:</span>
            <span>{waypoints.length}</span>
            <span style={{ color: T.muted }}>Length:</span>
            <span>{corridorLength.toFixed(2)} km</span>
            <span style={{ color: T.muted }}>Width:</span>
            <span style={{ color: '#EAB308' }}>{bufferWidthM}m</span>
            <span style={{ color: T.muted }}>Area:</span>
            <span>{corridorArea.toFixed(4)} sq km</span>
            <span style={{ color: T.muted }}>Status:</span>
            <span style={{ color: locked ? '#22C55E' : '#EAB308' }}>
              {locked ? 'LOCKED' : 'DRAWING'}
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!locked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {/* Lock Corridor */}
          <button
            onClick={handleLock}
            disabled={waypoints.length < 2}
            style={{
              ...btnBase,
              width: '100%',
              textAlign: 'center',
              background: waypoints.length >= 2 ? '#22C55E20' : 'transparent',
              color: waypoints.length >= 2 ? '#22C55E' : T.muted,
              borderColor: waypoints.length >= 2 ? '#22C55E40' : T.border,
              cursor: waypoints.length >= 2 ? 'pointer' : 'not-allowed',
            }}
          >
            Lock Corridor
          </button>

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={waypoints.length === 0}
            style={{
              ...btnBase,
              width: '100%',
              textAlign: 'center',
              background: 'transparent',
              color: waypoints.length > 0 ? T.amber : T.muted,
              borderColor: T.border,
              cursor: waypoints.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            Undo Last Point
          </button>
        </div>
      )}

      {/* Separator */}
      <div style={{ borderTop: `1px solid ${T.border}`, margin: '0.2rem 0' }} />

      {/* KML Import */}
      <input
        ref={kmlInputRef}
        type="file"
        accept=".kml"
        onChange={handleKmlImport}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => kmlInputRef.current?.click()}
        disabled={locked}
        style={{
          ...btnBase,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          color: locked ? T.muted : T.text,
          cursor: locked ? 'not-allowed' : 'pointer',
        }}
      >
        KML Import
      </button>

      {/* Save as Template */}
      <button
        onClick={() => setSaveDialogOpen(true)}
        disabled={waypoints.length < 2}
        style={{
          ...btnBase,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          color: waypoints.length >= 2 ? T.primary : T.muted,
          cursor: waypoints.length >= 2 ? 'pointer' : 'not-allowed',
        }}
      >
        Save as Template
      </button>

      {/* Load Template */}
      <button
        onClick={handleLoadTemplates}
        disabled={locked}
        style={{
          ...btnBase,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          color: locked ? T.muted : T.text,
          cursor: locked ? 'not-allowed' : 'pointer',
        }}
      >
        Load Template
      </button>

      {/* ── Save Template Dialog ──────────────────────────────────────── */}
      {saveDialogOpen && (
        <div style={{
          ...cardStyle,
          background: T.bg,
          border: `1px solid ${T.primary}40`,
        }}>
          <div style={{ ...labelStyle, marginBottom: '0.4rem', color: T.primary }}>
            SAVE AS TEMPLATE
          </div>
          <div style={{ marginBottom: '0.4rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.55rem' }}>Name</label>
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Mumbai Coastal Survey"
              style={{
                width: '100%',
                padding: '0.4rem 0.5rem',
                background: T.surface,
                color: T.textBright,
                border: `1px solid ${T.border}`,
                borderRadius: '4px',
                fontSize: '0.68rem',
              }}
            />
          </div>
          <div style={{ marginBottom: '0.4rem' }}>
            <label style={{ ...labelStyle, fontSize: '0.55rem' }}>Description</label>
            <textarea
              value={templateDesc}
              onChange={(e) => setTemplateDesc(e.target.value)}
              placeholder="Brief description of the flight corridor..."
              rows={2}
              style={{
                width: '100%',
                padding: '0.4rem 0.5rem',
                background: T.surface,
                color: T.textBright,
                border: `1px solid ${T.border}`,
                borderRadius: '4px',
                fontSize: '0.68rem',
                resize: 'vertical',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              onClick={handleSaveTemplate}
              disabled={saving || !templateName.trim()}
              style={{
                ...btnBase,
                flex: 1,
                textAlign: 'center',
                background: '#22C55E20',
                color: '#22C55E',
                borderColor: '#22C55E40',
                cursor: saving || !templateName.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setSaveDialogOpen(false)
                setTemplateName('')
                setTemplateDesc('')
              }}
              style={{
                ...btnBase,
                flex: 1,
                textAlign: 'center',
                background: 'transparent',
                color: T.muted,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Load Template Dialog ──────────────────────────────────────── */}
      {loadDialogOpen && (
        <div style={{
          ...cardStyle,
          background: T.bg,
          border: `1px solid ${T.primary}40`,
          maxHeight: '250px',
          overflow: 'auto',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.4rem',
          }}>
            <span style={{ ...labelStyle, color: T.primary, marginBottom: 0 }}>
              LOAD TEMPLATE
            </span>
            <button
              onClick={() => setLoadDialogOpen(false)}
              style={{
                ...btnBase,
                padding: '0.15rem 0.4rem',
                fontSize: '0.55rem',
                background: 'transparent',
                color: T.muted,
              }}
            >
              Close
            </button>
          </div>

          {loadingTemplates && (
            <div style={{ fontSize: '0.6rem', color: T.muted, textAlign: 'center', padding: '0.5rem' }}>
              Loading templates...
            </div>
          )}

          {!loadingTemplates && templates.length === 0 && (
            <div style={{ fontSize: '0.6rem', color: T.muted, textAlign: 'center', padding: '0.5rem' }}>
              No saved templates found.
            </div>
          )}

          {!loadingTemplates && templates.map(tmpl => (
            <div
              key={tmpl.id}
              onClick={() => handleSelectTemplate(tmpl)}
              style={{
                padding: '0.4rem',
                borderBottom: `1px solid ${T.border}`,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.primary + '10')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: T.textBright,
                marginBottom: '0.1rem',
              }}>
                {tmpl.name}
              </div>
              <div style={{ fontSize: '0.55rem', color: T.muted }}>
                {tmpl.description || 'No description'}
                {' -- '}
                {tmpl.areaSqKm?.toFixed(3)} sq km
                {tmpl.zone && (
                  <span style={{
                    marginLeft: '0.3rem',
                    padding: '0.05rem 0.3rem',
                    borderRadius: '3px',
                    fontSize: '0.5rem',
                    fontWeight: 700,
                    background: tmpl.zone === 'GREEN' ? '#22C55E20'
                      : tmpl.zone === 'YELLOW' ? '#EAB30820'
                      : '#EF444420',
                    color: tmpl.zone === 'GREEN' ? '#22C55E'
                      : tmpl.zone === 'YELLOW' ? '#EAB308'
                      : '#EF4444',
                  }}>
                    {tmpl.zone}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Locked state indicator */}
      {locked && (
        <div style={{
          background: '#22C55E10',
          border: '1px solid #22C55E30',
          borderRadius: '4px',
          padding: '0.5rem',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            color: '#22C55E',
            marginBottom: '0.2rem',
          }}>
            CORRIDOR LOCKED
          </div>
          <div style={{ fontSize: '0.55rem', color: T.muted }}>
            {waypoints.length} waypoints | {bufferWidthM}m buffer | {corridorArea.toFixed(3)} sq km
          </div>
        </div>
      )}
    </div>
  )
}
