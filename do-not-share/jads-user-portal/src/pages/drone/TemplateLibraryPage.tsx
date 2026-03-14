import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { T } from '../../theme'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface FlightTemplate {
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
  createdBy?: string
}

type ZoneFilter = 'ALL' | 'GREEN' | 'YELLOW' | 'RED'

// ── Constants ────────────────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  GREEN: '#22C55E',
  YELLOW: '#EAB308',
  RED: '#EF4444',
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

// ── Tiny Map Thumbnail Component ─────────────────────────────────────────────

function MapThumbnail({ geometry, waypoints }: { geometry: any; waypoints?: Array<{ lat: number; lng: number }> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    const L = (window as any).L
    if (!L || !containerRef.current) return

    // Cleanup previous instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    })
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    // Add geometry if available
    if (geometry && geometry.geometry) {
      try {
        const geoLayer = L.geoJSON(geometry, {
          style: {
            color: '#EAB308',
            fillColor: '#EAB308',
            fillOpacity: 0.25,
            weight: 1.5,
          },
        }).addTo(map)
        map.fitBounds(geoLayer.getBounds(), { padding: [5, 5] })
      } catch {
        // Fallback: use waypoints to set bounds
        if (waypoints && waypoints.length >= 2) {
          const bounds = L.latLngBounds(waypoints.map(p => [p.lat, p.lng]))
          map.fitBounds(bounds, { padding: [5, 5] })
        } else {
          map.setView([20.5937, 78.9629], 5)
        }
      }
    } else if (waypoints && waypoints.length >= 2) {
      // Draw waypoint polyline
      const coords = waypoints.map(p => [p.lat, p.lng])
      L.polyline(coords, { color: T.primary, weight: 2 }).addTo(map)
      const bounds = L.latLngBounds(coords)
      map.fitBounds(bounds, { padding: [5, 5] })
    } else {
      map.setView([20.5937, 78.9629], 5)
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [geometry, waypoints])

  return (
    <div
      ref={containerRef}
      style={{
        width: '200px',
        height: '120px',
        borderRadius: '4px',
        overflow: 'hidden',
        border: `1px solid ${T.border}`,
        background: '#0a0a0a',
      }}
    />
  )
}

// ── Edit Dialog Component ────────────────────────────────────────────────────

function EditDialog({
  template,
  onSave,
  onClose,
}: {
  template: FlightTemplate
  onSave: (id: string, name: string, description: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(template.name)
  const [desc, setDesc] = useState(template.description)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave(template.id, name.trim(), desc.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: '8px',
        padding: '1.2rem',
        width: '380px',
        maxWidth: '90vw',
      }}>
        <h3 style={{
          color: T.primary,
          fontSize: '0.8rem',
          fontWeight: 700,
          marginBottom: '0.8rem',
          letterSpacing: '0.04em',
        }}>EDIT TEMPLATE</h3>

        <div style={{ marginBottom: '0.6rem' }}>
          <label style={labelStyle}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '0.8rem' }}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              ...btnBase,
              flex: 1,
              textAlign: 'center',
              background: T.primary + '20',
              color: T.primary,
              borderColor: T.primary + '40',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
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
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function TemplateLibraryPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<FlightTemplate[]>([])
  const [sharedTemplates, setSharedTemplates] = useState<FlightTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('ALL')
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<FlightTemplate | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showShared, setShowShared] = useState(false)

  // ── Load templates ─────────────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await userApi().get('/drone/flight-templates')
      const all = data.templates || []
      setTemplates(all.filter((t: FlightTemplate) => !t.shared))
      setSharedTemplates(all.filter((t: FlightTemplate) => t.shared))
    } catch {
      setTemplates([])
      setSharedTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // ── Filter logic ───────────────────────────────────────────────────────
  const filterTemplates = (list: FlightTemplate[]): FlightTemplate[] => {
    return list.filter(t => {
      // Search by name
      if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        // Also search description
        if (!t.description?.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false
        }
      }

      // Zone filter
      if (zoneFilter !== 'ALL' && t.zone !== zoneFilter) return false

      // Area filter
      if (areaMin) {
        const min = parseFloat(areaMin)
        if (!isNaN(min) && t.areaSqKm < min) return false
      }
      if (areaMax) {
        const max = parseFloat(areaMax)
        if (!isNaN(max) && t.areaSqKm > max) return false
      }

      return true
    })
  }

  const filteredMy = filterTemplates(templates)
  const filteredShared = filterTemplates(sharedTemplates)

  // ── Use Template ───────────────────────────────────────────────────────
  const handleUseTemplate = useCallback((template: FlightTemplate) => {
    // Navigate to flight planner with template data via URL state
    navigate('/flight-planner', { state: { template } })
  }, [navigate])

  // ── Edit Template ──────────────────────────────────────────────────────
  const handleEditSave = useCallback(async (id: string, name: string, description: string) => {
    try {
      await userApi().put(`/drone/flight-templates/${id}`, { name, description })
      setEditingTemplate(null)
      loadTemplates()
    } catch {
      alert('Failed to update template.')
    }
  }, [loadTemplates])

  // ── Delete Template ────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    try {
      await userApi().delete(`/drone/flight-templates/${id}`)
      setDeleteConfirmId(null)
      loadTemplates()
    } catch {
      alert('Failed to delete template.')
    }
  }, [loadTemplates])

  // ── Render Template Card ───────────────────────────────────────────────
  const renderCard = (tmpl: FlightTemplate) => {
    const zoneColor = ZONE_COLORS[tmpl.zone] || T.muted

    return (
      <div
        key={tmpl.id}
        style={{
          ...cardStyle,
          display: 'flex',
          gap: '0.8rem',
          alignItems: 'flex-start',
          marginBottom: '0.5rem',
        }}
      >
        {/* Map Thumbnail */}
        <MapThumbnail geometry={tmpl.geometry} waypoints={tmpl.waypoints} />

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            marginBottom: '0.3rem',
          }}>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: T.textBright,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {tmpl.name}
            </span>
            <span style={{
              padding: '0.1rem 0.4rem',
              borderRadius: '3px',
              fontSize: '0.5rem',
              fontWeight: 700,
              background: zoneColor + '20',
              color: zoneColor,
              flexShrink: 0,
            }}>
              {tmpl.zone}
            </span>
            {tmpl.shared && (
              <span style={{
                padding: '0.1rem 0.4rem',
                borderRadius: '3px',
                fontSize: '0.5rem',
                fontWeight: 700,
                background: T.primary + '20',
                color: T.primary,
                flexShrink: 0,
              }}>
                SHARED
              </span>
            )}
          </div>

          <div style={{
            fontSize: '0.6rem',
            color: T.text,
            marginBottom: '0.4rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {tmpl.description || 'No description'}
          </div>

          <div style={{
            display: 'flex',
            gap: '0.8rem',
            fontSize: '0.55rem',
            color: T.muted,
            marginBottom: '0.5rem',
          }}>
            <span>Area: <strong style={{ color: T.text }}>{tmpl.areaSqKm?.toFixed(3)} sq km</strong></span>
            <span>Buffer: <strong style={{ color: T.text }}>{tmpl.bufferWidthM || '--'}m</strong></span>
            {tmpl.lastUsedAt && (
              <span>Last used: <strong style={{ color: T.text }}>
                {new Date(tmpl.lastUsedAt).toLocaleDateString()}
              </strong></span>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              onClick={() => handleUseTemplate(tmpl)}
              style={{
                ...btnBase,
                padding: '0.25rem 0.6rem',
                fontSize: '0.6rem',
                background: T.primary + '20',
                color: T.primary,
                borderColor: T.primary + '40',
              }}
            >
              Use Template
            </button>
            {!tmpl.shared && (
              <>
                <button
                  onClick={() => setEditingTemplate(tmpl)}
                  style={{
                    ...btnBase,
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.6rem',
                    background: 'transparent',
                    color: T.amber,
                    borderColor: T.border,
                  }}
                >
                  Edit
                </button>
                {deleteConfirmId === tmpl.id ? (
                  <div style={{ display: 'flex', gap: '0.2rem' }}>
                    <button
                      onClick={() => handleDelete(tmpl.id)}
                      style={{
                        ...btnBase,
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.6rem',
                        background: T.red + '20',
                        color: T.red,
                        borderColor: T.red + '40',
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      style={{
                        ...btnBase,
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.6rem',
                        background: 'transparent',
                        color: T.muted,
                      }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(tmpl.id)}
                    style={{
                      ...btnBase,
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.6rem',
                      background: 'transparent',
                      color: T.red,
                      borderColor: T.border,
                    }}
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      padding: '1.2rem',
      maxWidth: '1200px',
      margin: '0 auto',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
      }}>
        <div>
          <h1 style={{
            color: T.primary,
            fontSize: '1rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            marginBottom: '0.2rem',
          }}>FLIGHT PLAN TEMPLATES</h1>
          <p style={{ fontSize: '0.65rem', color: T.muted }}>
            Save, manage, and reuse flight corridor templates
          </p>
        </div>
        <button
          onClick={() => navigate('/flight-planner')}
          style={{
            ...btnBase,
            background: T.primary + '20',
            color: T.primary,
            borderColor: T.primary + '40',
          }}
        >
          New Flight Plan
        </button>
      </div>

      {/* Filters */}
      <div style={{
        ...cardStyle,
        display: 'flex',
        gap: '0.6rem',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Search</label>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or description..."
            style={inputStyle}
          />
        </div>

        {/* Zone Filter */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>Zone</label>
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            {(['ALL', 'GREEN', 'YELLOW', 'RED'] as const).map(z => (
              <button
                key={z}
                onClick={() => setZoneFilter(z)}
                style={{
                  ...btnBase,
                  padding: '0.3rem 0.5rem',
                  fontSize: '0.58rem',
                  background: zoneFilter === z
                    ? (z === 'ALL' ? T.primary + '20' : ZONE_COLORS[z] + '20')
                    : 'transparent',
                  color: zoneFilter === z
                    ? (z === 'ALL' ? T.primary : ZONE_COLORS[z])
                    : T.muted,
                  borderColor: zoneFilter === z
                    ? (z === 'ALL' ? T.primary + '40' : ZONE_COLORS[z] + '40')
                    : T.border,
                }}
              >
                {z}
              </button>
            ))}
          </div>
        </div>

        {/* Area Range */}
        <div style={{ flex: '0 0 auto' }}>
          <label style={labelStyle}>Area (sq km)</label>
          <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <input
              value={areaMin}
              onChange={(e) => setAreaMin(e.target.value)}
              placeholder="Min"
              type="number"
              step="0.001"
              style={{ ...inputStyle, width: '70px' }}
            />
            <span style={{ fontSize: '0.55rem', color: T.muted }}>to</span>
            <input
              value={areaMax}
              onChange={(e) => setAreaMax(e.target.value)}
              placeholder="Max"
              type="number"
              step="0.001"
              style={{ ...inputStyle, width: '70px' }}
            />
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: T.muted,
          fontSize: '0.7rem',
        }}>
          Loading templates...
        </div>
      )}

      {/* My Templates Section */}
      {!loading && (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem',
            marginTop: '0.5rem',
          }}>
            <h2 style={{
              color: T.textBright,
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}>MY TEMPLATES</h2>
            <span style={{
              fontSize: '0.55rem',
              color: T.muted,
              background: T.bg,
              padding: '0.1rem 0.4rem',
              borderRadius: '3px',
            }}>
              {filteredMy.length} template{filteredMy.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filteredMy.length === 0 && (
            <div style={{
              ...cardStyle,
              borderStyle: 'dashed',
              textAlign: 'center',
              padding: '1.5rem',
            }}>
              <p style={{ fontSize: '0.65rem', color: T.muted, marginBottom: '0.4rem' }}>
                {searchQuery || zoneFilter !== 'ALL' || areaMin || areaMax
                  ? 'No templates match your filters.'
                  : 'No templates yet. Create one from the Flight Planner.'}
              </p>
              {!searchQuery && zoneFilter === 'ALL' && !areaMin && !areaMax && (
                <button
                  onClick={() => navigate('/flight-planner')}
                  style={{
                    ...btnBase,
                    background: T.primary + '20',
                    color: T.primary,
                    borderColor: T.primary + '40',
                  }}
                >
                  Open Flight Planner
                </button>
              )}
            </div>
          )}

          {/* Template Cards Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {filteredMy.map(renderCard)}
          </div>

          {/* Shared Templates Section */}
          <div style={{
            borderTop: `1px solid ${T.border}`,
            marginTop: '1rem',
            paddingTop: '0.8rem',
          }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                cursor: 'pointer',
              }}
              onClick={() => setShowShared(s => !s)}
            >
              <h2 style={{
                color: T.textBright,
                fontSize: '0.78rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}>SHARED TEMPLATES</h2>
              <span style={{
                fontSize: '0.55rem',
                color: T.muted,
                background: T.bg,
                padding: '0.1rem 0.4rem',
                borderRadius: '3px',
              }}>
                {filteredShared.length} template{filteredShared.length !== 1 ? 's' : ''}
              </span>
              <span style={{
                fontSize: '0.6rem',
                color: T.muted,
                transition: 'transform 0.2s',
                transform: showShared ? 'rotate(90deg)' : 'rotate(0deg)',
              }}>
                {'\u25B6'}
              </span>
            </div>

            {showShared && (
              <>
                {filteredShared.length === 0 && (
                  <div style={{
                    ...cardStyle,
                    borderStyle: 'dashed',
                    textAlign: 'center',
                    padding: '1rem',
                  }}>
                    <p style={{ fontSize: '0.65rem', color: T.muted }}>
                      No shared templates available.
                    </p>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {filteredShared.map(renderCard)}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Edit Dialog */}
      {editingTemplate && (
        <EditDialog
          template={editingTemplate}
          onSave={handleEditSave}
          onClose={() => setEditingTemplate(null)}
        />
      )}
    </div>
  )
}
