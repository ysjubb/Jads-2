export type RuleCategory = 'DRONE' | 'AIRCRAFT';
export type RuleSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export type ComplianceStatus = 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';
export type OverallStatus = 'COMPLIANT' | 'NON_COMPLIANT' | 'WARNINGS';

export interface ComplianceRule {
  id: string;
  name: string;
  category: RuleCategory;
  severity: RuleSeverity;
  /** DGCA/ICAO regulation reference */
  regulation: string;
  description: string;
}

export interface ComplianceResult {
  ruleId: string;
  status: ComplianceStatus;
  message: string;
  details?: string;
}

export interface ComplianceReport {
  missionId: string;
  timestamp: Date;
  results: ComplianceResult[];
  overallStatus: OverallStatus;
}
