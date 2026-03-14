import React, { useState } from 'react';
import { T } from '../../theme';
import { getEvidenceChain, getDocumentTypes, getDocumentTypeLabel } from '../../services/evidenceChainService';
import type { DocumentType, EvidenceRecord } from '../../services/evidenceChainService';

/**
 * Panel for exporting evidence chain records.
 * Allows filtering by document type and exporting as JSON.
 */
export function EvidenceExportPanel() {
  const [missionId, setMissionId] = useState('');
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [filterType, setFilterType] = useState<DocumentType | ''>('');
  const [exported, setExported] = useState(false);

  const handleLoad = async () => {
    if (!missionId.trim()) return;
    const chain = await getEvidenceChain(missionId.trim());
    setRecords(chain);
    setExported(false);
  };

  const filtered = filterType
    ? records.filter(r => r.documentType === filterType)
    : records;

  const handleExport = () => {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-${missionId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
  };

  const selectStyle: React.CSSProperties = {
    background: T.bg, border: `1px solid ${T.border}`, borderRadius: '4px',
    color: T.textBright, padding: '0.4rem 0.6rem', fontSize: '0.7rem',
  };

  return (
    <div>
      <h2 style={{ color: T.textBright, fontSize: '0.9rem', marginBottom: '0.8rem' }}>Evidence Export</h2>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
        <input
          style={{ ...selectStyle, flex: 1 }}
          value={missionId}
          onChange={e => setMissionId(e.target.value)}
          placeholder="Mission ID"
        />
        <select style={selectStyle} value={filterType} onChange={e => setFilterType(e.target.value as DocumentType | '')}>
          <option value="">All types</option>
          {getDocumentTypes().map(dt => (
            <option key={dt} value={dt}>{getDocumentTypeLabel(dt)}</option>
          ))}
        </select>
        <button onClick={handleLoad} style={{
          background: T.primary + '20', border: `1px solid ${T.primary}40`, borderRadius: '4px',
          color: T.primary, padding: '0.4rem 0.8rem', fontSize: '0.7rem', cursor: 'pointer',
        }}>
          Load
        </button>
      </div>

      {records.length > 0 && (
        <>
          <div style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '0.5rem' }}>
            {filtered.length} of {records.length} records
          </div>
          <button onClick={handleExport} style={{
            background: exported ? '#22c55e20' : T.amber + '20',
            border: `1px solid ${exported ? '#22c55e40' : T.amber + '40'}`,
            borderRadius: '4px', color: exported ? '#22c55e' : T.amber,
            padding: '0.4rem 0.8rem', fontSize: '0.7rem', cursor: 'pointer',
          }}>
            {exported ? 'Exported' : 'Export JSON'}
          </button>
        </>
      )}
    </div>
  );
}
