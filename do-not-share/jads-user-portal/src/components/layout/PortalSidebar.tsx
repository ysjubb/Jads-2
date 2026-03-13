import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { T } from '../../theme';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: 'D' },
  { label: 'Flight Plans', path: '/flight-plans', icon: 'F' },
  { label: 'Drone Ops', path: '/drone-ops', icon: 'U' },
  { label: 'Airspace Map', path: '/airspace', icon: 'M' },
  { label: 'NOTAMs', path: '/notams', icon: 'N' },
  { label: 'Compliance', path: '/compliance', icon: 'C' },
  { label: 'Evidence', path: '/evidence', icon: 'E' },
  { label: 'Fleet', path: '/fleet', icon: 'A' },
  { label: 'Fuel & W/B', path: '/planning', icon: 'P' },
  { label: 'Settings', path: '/settings', icon: 'S' },
];

/**
 * Portal sidebar navigation.
 */
export function PortalSidebar() {
  const location = useLocation();

  return (
    <nav style={{
      width: '200px', background: T.surface, borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column', padding: '0.5rem 0',
      height: '100%', flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '0.8rem 1rem', marginBottom: '0.5rem' }}>
        <div style={{ color: T.primary, fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.1em' }}>JADS</div>
        <div style={{ color: T.muted, fontSize: '0.55rem' }}>Aviation Safety Platform</div>
      </div>

      {/* Nav links */}
      {NAV_ITEMS.map(item => {
        const active = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.5rem 1rem', textDecoration: 'none',
              color: active ? T.primary : T.text,
              background: active ? T.primary + '12' : 'transparent',
              borderRight: active ? `2px solid ${T.primary}` : '2px solid transparent',
              fontSize: '0.75rem', transition: 'all 0.1s',
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: '4px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem',
              fontWeight: 700, background: active ? T.primary + '20' : T.bg,
              color: active ? T.primary : T.muted,
            }}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
