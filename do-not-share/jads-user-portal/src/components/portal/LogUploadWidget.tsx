import React, { useState } from 'react';
import { T } from '../../theme';
import { detectLogFormat } from '../../services/djiLogParser';
import type { FlightLogFormat } from '../../types/npnt';

const FORMAT_INFO: Record<FlightLogFormat, { label: string; color: string; note: string }> = {
  NPNT_JSON: { label: 'NPNT JSON', color: '#22c55e', note: 'Event-based — NEVER resample' },
  DJI_CSV: { label: 'DJI CSV', color: T.primary, note: 'Continuous GPS — can resample' },
  DJI_BINARY: { label: 'DJI Binary', color: T.amber, note: 'Server-side decode required' },
};

/**
 * Compact log upload widget for embedding in other views.
 * Detects format and passes file content to parent.
 */
export function LogUploadWidget({
  onUpload,
}: {
  onUpload?: (content: string, format: FlightLogFormat, fileName: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [detected, setDetected] = useState<FlightLogFormat | null>(null);
  const [fileName, setFileName] = useState('');

  const processFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const format = detectLogFormat(text);
      setDetected(format);
      onUpload?.(text, format, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `1px dashed ${dragging ? T.primary : T.border}`,
        borderRadius: '4px', padding: '0.8rem', textAlign: 'center',
        background: dragging ? T.primary + '08' : T.surface,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <label style={{ cursor: 'pointer', display: 'block' }}>
        {fileName ? (
          <span style={{ color: T.textBright, fontSize: '0.7rem' }}>{fileName}</span>
        ) : (
          <span style={{ color: T.muted, fontSize: '0.7rem' }}>Drop log file or click to browse</span>
        )}
        <input
          type="file"
          accept=".json,.csv,.txt"
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
          style={{ display: 'none' }}
        />
      </label>
      {detected && (
        <div style={{ marginTop: '0.4rem' }}>
          <span style={{
            padding: '2px 6px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 600,
            background: FORMAT_INFO[detected].color + '20', color: FORMAT_INFO[detected].color,
          }}>
            {FORMAT_INFO[detected].label}
          </span>
          <span style={{ color: T.muted, fontSize: '0.55rem', marginLeft: '0.4rem' }}>
            {FORMAT_INFO[detected].note}
          </span>
        </div>
      )}
    </div>
  );
}
