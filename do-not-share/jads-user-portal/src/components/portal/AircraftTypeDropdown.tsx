import React, { useState, useRef, useEffect } from 'react'
import { userApi } from '../../api/client'
import { T } from '../../theme'

interface AircraftTypeEntry {
  icao: string
  name: string
  category: string
  wake: string
}

interface Props {
  value: string
  onChange: (icao: string, wake: string) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  COMMERCIAL: 'Commercial',
  GA: 'General Aviation',
  HELICOPTER: 'Helicopter',
  MILITARY_FIGHTER: 'Military Fighter',
  MILITARY_TRANSPORT: 'Military Transport',
  MILITARY_TRAINER: 'Military Trainer',
  DRONE: 'Drone/UAV',
}

export function AircraftTypeDropdown({ value, onChange }: Props) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<AircraftTypeEntry[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [customMode, setCustomMode] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase()
    setQuery(raw)
    setCustomMode(false)

    if (raw.length >= 1) {
      try {
        const { data } = await userApi().get(`/lookup/aircraft-types/search?q=${encodeURIComponent(raw)}`)
        if (data.success && data.results) {
          setSuggestions(data.results)
          setShowDropdown(data.results.length > 0)
          setHighlightIdx(-1)
        }
      } catch {
        setSuggestions([])
        setShowDropdown(false)
      }
    } else {
      setSuggestions([])
      setShowDropdown(false)
    }
  }

  const handleSelect = (entry: AircraftTypeEntry) => {
    if (entry.icao === 'ZZZZ') {
      setCustomMode(true)
      setQuery('')
      setShowDropdown(false)
      onChange('ZZZZ', 'L')
      return
    }
    setQuery(entry.icao)
    onChange(entry.icao, entry.wake)
    setShowDropdown(false)
    setSuggestions([])
  }

  const handleCustomInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase()
    setQuery(raw)
    onChange(raw, 'L')
  }

  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false)
      if (!customMode && query) {
        onChange(query, 'L')
      }
    }, 150)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[highlightIdx])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Group suggestions by category
  const grouped = new Map<string, AircraftTypeEntry[]>()
  for (const s of suggestions) {
    if (!grouped.has(s.category)) grouped.set(s.category, [])
    grouped.get(s.category)!.push(s)
  }
  let flatIdx = 0

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem', background: T.bg, color: T.textBright,
    border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '0.75rem',
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <label style={{ fontSize: '0.65rem', color: T.muted, marginBottom: '2px', display: 'block' }}>Type</label>
      {customMode ? (
        <div>
          <div style={{ fontSize: '0.6rem', color: T.amber, marginBottom: '2px' }}>
            Custom type (ZZZZ) — enter ICAO designator
            <button
              type="button"
              onClick={() => { setCustomMode(false); setQuery(''); onChange('', 'L') }}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: T.primary, cursor: 'pointer', fontSize: '0.6rem', textDecoration: 'underline' }}
            >
              back to list
            </button>
          </div>
          <input value={query} onChange={handleCustomInput} placeholder="Enter any ICAO type" autoFocus style={inputStyle} />
        </div>
      ) : (
        <input
          value={query}
          onChange={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search by name or ICAO..."
          required
          autoComplete="off"
          style={inputStyle}
        />
      )}
      {showDropdown && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px',
          maxHeight: '260px', overflowY: 'auto', marginTop: '2px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {Array.from(grouped.entries()).map(([cat, entries]) => (
            <div key={cat}>
              <div style={{
                padding: '0.3rem 0.6rem', fontSize: '0.6rem', color: T.muted,
                background: T.bg, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {CATEGORY_LABELS[cat] ?? cat}
              </div>
              {entries.map((entry) => {
                const idx = flatIdx++
                return (
                  <div
                    key={entry.icao}
                    onMouseDown={() => handleSelect(entry)}
                    style={{
                      padding: '0.35rem 0.6rem 0.35rem 1rem', cursor: 'pointer', fontSize: '0.7rem',
                      background: idx === highlightIdx ? T.primary + '25' : 'transparent',
                      color: T.textBright, borderBottom: `1px solid ${T.border}10`,
                    }}
                  >
                    <strong style={{ color: T.primary }}>{entry.icao}</strong>
                    <span style={{ color: T.text, marginLeft: '0.5rem' }}>{entry.name}</span>
                    <span style={{ color: T.muted, marginLeft: '0.4rem', fontSize: '0.6rem' }}>({entry.wake})</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
