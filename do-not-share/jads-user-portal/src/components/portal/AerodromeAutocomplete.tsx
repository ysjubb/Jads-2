import React, { useState, useRef, useEffect } from 'react'
import { userApi } from '../../api/client'
import { T } from '../../theme'

interface AerodromeLookup {
  icao: string
  name: string
  lat: number
  lon: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  label: string
}

export function AerodromeAutocomplete({ value, onChange, placeholder, required, label }: Props) {
  const [suggestions, setSuggestions] = useState<AerodromeLookup[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [warning, setWarning] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase()
    onChange(raw)
    setWarning(null)

    if (raw.length >= 1) {
      try {
        const { data } = await userApi().get(`/lookup/aerodromes/search?q=${encodeURIComponent(raw)}`)
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

  const handleSelect = (ad: AerodromeLookup) => {
    onChange(ad.icao)
    setShowDropdown(false)
    setWarning(null)
    setSuggestions([])
  }

  const handleBlur = async () => {
    setTimeout(async () => {
      setShowDropdown(false)
      const v = value.trim().toUpperCase()
      if (v.length === 4 && v !== 'ZZZZ') {
        try {
          const { data } = await userApi().get(`/lookup/aerodromes/validate?icao=${encodeURIComponent(v)}`)
          if (!data.valid) {
            setWarning(`"${v}" not found in Indian AIP. Verify code or use ZZZZ for unlisted.`)
          } else {
            setWarning(null)
          }
        } catch {
          setWarning(null)
        }
      } else {
        setWarning(null)
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

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <label style={{ fontSize: '0.65rem', color: T.muted, marginBottom: '2px', display: 'block' }}>{label}</label>
      <input
        value={value}
        onChange={handleInput}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        style={{
          width: '100%', padding: '0.5rem', background: T.bg, color: T.textBright,
          border: `1px solid ${warning ? T.amber : T.border}`, borderRadius: '4px', fontSize: '0.75rem',
        }}
      />
      {warning && (
        <div style={{ fontSize: '0.6rem', color: T.amber, marginTop: '2px' }}>{warning}</div>
      )}
      {showDropdown && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px',
          maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {suggestions.map((ad, i) => (
            <div
              key={ad.icao}
              onMouseDown={() => handleSelect(ad)}
              style={{
                padding: '0.4rem 0.6rem', cursor: 'pointer', fontSize: '0.7rem',
                background: i === highlightIdx ? T.primary + '25' : 'transparent',
                color: T.textBright, borderBottom: `1px solid ${T.border}15`,
              }}
            >
              <strong style={{ color: T.primary }}>{ad.icao}</strong>
              <span style={{ color: T.muted, marginLeft: '0.5rem' }}>{ad.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
