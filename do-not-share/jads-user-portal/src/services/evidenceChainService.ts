import { userApi } from '../api/client';

export type DocumentType = 'NPNT_PA' | 'FLIGHT_LOG' | 'ICAO_FPL' | 'NOTAM_ACK' | 'JEPPESEN_CHART_ACCESS';

export interface EvidenceRecord {
  id: string;
  missionId: string;
  documentType: DocumentType;
  hash: string;
  previousHash: string;
  timestamp: string;
  signingEntity: string;
  verified: boolean;
  metadata?: Record<string, string>;
}

export async function getEvidenceChain(missionId: string): Promise<EvidenceRecord[]> {
  try {
    const { data } = await userApi().get<EvidenceRecord[]>(`/api/evidence/${missionId}`);
    return data;
  } catch {
    return [];
  }
}

export function verifyChainIntegrity(records: EvidenceRecord[]): { intact: boolean; brokenAt?: number } {
  if (records.length <= 1) return { intact: true };

  for (let i = 1; i < records.length; i++) {
    if (!records[i].previousHash || records[i].previousHash !== records[i - 1].hash) {
      return { intact: false, brokenAt: i };
    }
  }

  return { intact: true };
}

export function getDocumentTypes(): DocumentType[] {
  return ['NPNT_PA', 'FLIGHT_LOG', 'ICAO_FPL', 'NOTAM_ACK', 'JEPPESEN_CHART_ACCESS'];
}

export function getDocumentTypeLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    NPNT_PA: 'NPNT Permission Artefact',
    FLIGHT_LOG: 'Flight Log',
    ICAO_FPL: 'ICAO Flight Plan',
    NOTAM_ACK: 'NOTAM Acknowledgement',
    JEPPESEN_CHART_ACCESS: 'Jeppesen Chart Access',
  };
  return labels[type];
}
