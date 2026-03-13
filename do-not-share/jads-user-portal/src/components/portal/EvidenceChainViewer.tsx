import React, { useState } from 'react';
import { T } from '../../theme';
import { getEvidenceChain, verifyChainIntegrity, getDocumentTypeLabel } from '../../services/evidenceChainService';
import type { EvidenceRecord } from '../../services/evidenceChainService';

/**
 * Evidence chain viewer — displays the cryptographic evidence chain
 * for a mission. Verifies hash chain integrity.
 */
export function EvidenceChainViewer() {
  const [missionId, setMissionId] = useState('');
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [integrity, setIntegrity] = useState<{ intact: boolean; brokenAt?: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoad = async () => {
    if (!missionId.trim()) return;
    setLoading(true);
    try {
      const chain = await getEvidenceChain(missionId.trim());
      setRecords(chain);
      setIntegrity(verifyChainIntegrity(chain));
    } catch {
      setRecords([]);
      setIntegrity(null);
    }
    setLoading(false);
  };

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Evidence Chain</h2>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          style={{
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
            color: T.textBright, padding: '0.4rem 0.7rem', fontSize: '0.75rem', flex: 1,
          }}
          value={missionId}
          onChange={e => setMissionId(e.target.value)}
          placeholder="Mission ID"
        />
        <button
          onClick={handleLoad}
          disabled={loading}
          style={{
            background: T.primary + '20', border: `1px solid ${T.primary}40`, borderRadius: '4px',
            color: T.primary, padding: '0.4rem 0.8rem', fontSize: '0.7rem', cursor: 'pointer',
          }}
        >
          {loading ? 'Loading...' : 'Load Chain'}
        </button>
      </div>

      {/* Integrity status */}
      {integrity && (
        <div style={{
          padding: '0.4rem 0.6rem', borderRadius: '4px', marginBottom: '0.8rem',
          background: integrity.intact ? '#22c55e15' : '#ef444415',
          border: `1px solid ${integrity.intact ? '#22c55e40' : '#ef444440'}`,
          color: integrity.intact ? '#22c55e' : T.red, fontSize: '0.75rem', fontWeight: 600,
        }}>
          {integrity.intact ? 'Chain integrity verified' : `Chain broken at record #${integrity.brokenAt}`}
        </div>
      )}

      {/* Chain records */}
      {records.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {records.map((r, i) => (
            <div key={r.id} style={{
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: '4px',
              padding: '0.6rem', position: 'relative',
            }}>
              {/* Connector line */}
              {i > 0 && (
                <div style={{
                  position: 'absolute', top: -12, left: 20, width: 1, height: 12,
                  background: integrity?.brokenAt === i ? T.red : T.border,
                }} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ color: T.textBright, fontSize: '0.7rem', fontWeight: 600 }}>
                  #{i + 1} — {getDocumentTypeLabel(r.documentType)}
                </span>
                <span style={{
                  fontSize: '0.55rem', padding: '1px 5px', borderRadius: '2px',
                  background: r.verified ? '#22c55e20' : T.red + '20',
                  color: r.verified ? '#22c55e' : T.red,
                }}>
                  {r.verified ? 'VERIFIED' : 'UNVERIFIED'}
                </span>
              </div>
              <div style={{ color: T.muted, fontSize: '0.6rem', fontFamily: 'monospace' }}>
                Hash: {r.hash.slice(0, 16)}...
              </div>
              <div style={{ color: T.muted, fontSize: '0.6rem' }}>
                {r.signingEntity} | {new Date(r.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {records.length === 0 && !loading && missionId && (
        <div style={{ color: T.muted, fontSize: '0.75rem', textAlign: 'center', padding: '2rem' }}>
          No evidence records found for this mission
        </div>
      )}
    </div>
  );
}
