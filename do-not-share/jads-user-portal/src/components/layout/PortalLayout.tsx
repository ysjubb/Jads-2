import React from 'react';
import { T } from '../../theme';
import { PortalSidebar } from './PortalSidebar';
import { SystemStatusBar } from '../portal/SystemStatusBar';
import { AIRACBanner } from '../portal/AIRACBanner';

/**
 * Main portal layout — sidebar + status bar + content area.
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', height: '100vh', background: T.bg, color: T.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <PortalSidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <SystemStatusBar />
        <div style={{ padding: '0.6rem 1rem 0' }}>
          <AIRACBanner />
        </div>
        <main style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
