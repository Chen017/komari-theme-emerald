export type RiskCategory = 'Low' | 'Medium' | 'High' | 'Critical' | 'Unknown';
export type NodeIpqaStatus =
  | 'ok'
  | 'not_installed'
  | 'no_archive'
  | 'stale'
  | 'collection_error'
  | 'fresh'
  | 'pending_today'
  | 'sync_error'
  | 'future_date';

export interface NodeFreshness {
  status: NodeIpqaStatus;
  latestDate: string | null;
  expectedDate: string;
  lastSyncAttemptAt?: string | null;
  lastSyncSuccessAt?: string | null;
  reason?: string | null;
}

export interface IpqaCapabilities {
  schema_version: number;
  plugin_version: string;
  archive_api: boolean;
  change_api: boolean;
  ipv4: boolean;
  ipv6: boolean;
}

export interface ClassifiedRiskScore {
  provider: string;
  rawValue: string | number | boolean | null;
  numericValue: number | null;
  unit: 'percent' | 'score' | 'category' | 'unknown';
  available: boolean;
  categoryKey: RiskCategory;
  categoryLabel: string | null;
  rank: number | null;
  alertSeverity: 'INFO' | 'WARNING' | 'CRITICAL' | null;
}

export interface IpqaNodeProtocolSummary {
  date?: string | null;
  risk?: {
    category: RiskCategory;
    source: string;
  };
  scores: Record<string, string | number | boolean | null>;
  classifiedScores?: Record<string, ClassifiedRiskScore>;
  media: Record<string, { status?: string; region?: string; unlocked?: boolean; [key: string]: unknown }>;
  ai: Record<string, { status?: string; region?: string; unlocked?: boolean; [key: string]: unknown }>;
}

export interface IpqaNodeOverview {
  uuid: string;
  name: string;
  status: NodeIpqaStatus;
  freshness?: NodeFreshness;
  latest_date: string | null;
  has_ipv4: boolean;
  has_ipv6: boolean;
  highest_risk: {
    category: RiskCategory;
    source: string;
  };
  media_summary: Record<string, { unlocked: boolean; region?: string }>;
  ai_summary: Record<string, { unlocked: boolean; region?: string }>;
  changes_today: number;
  v4?: IpqaNodeProtocolSummary;
  v6?: IpqaNodeProtocolSummary;
}

export interface IpqaFleetOverview {
  schema_version: number;
  updated_at: string;
  total_nodes: number;
  ipqa_nodes: number;
  nodes_with_risk: number;
  nodes_with_changes_today: number;
  latest_archive_date: string | null;
  nodes: IpqaNodeOverview[];
}

export interface IpqaSemanticChange {
  date: string;
  nodeUuid: string;
  ipVersion: 'IPv4' | 'IPv6';
  category: 'identity' | 'score' | 'type' | 'factor' | 'media' | 'mail' | 'dnsbl' | 'other';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  field: string;
  before: unknown;
  after: unknown;
  beforeCategory?: string;
  afterCategory?: string;
  beforeRank?: number;
  afterRank?: number;
  description: string;
}

export interface IpqaNormalizedReport {
  schemaVersion: number;
  ipVersion: 'IPv4' | 'IPv6';
  archiveId: string;
  date: string;
  timestamp: string;
  info: {
    ip?: string;
    country?: string;
    region?: string;
    city?: string;
    asn?: string | number;
    isp?: string;
    organization?: string;
    type?: string;
    [key: string]: unknown;
  };
  scores: Record<string, string | number | boolean | null>;
  classifiedScores?: Record<string, ClassifiedRiskScore>;
  type: {
    usage: Record<string, unknown>;
    company: Record<string, unknown>;
    raw?: unknown;
  };
  factors: Record<string, Record<string, boolean | string | number | null>>;
  media: Record<string, { status?: string; region?: string; [key: string]: unknown }>;
  mail: Record<string, unknown>;
  extra: Record<string, unknown>;
}

export interface IpqaDailyPairedReport {
  schemaVersion: number;
  nodeUuid: string;
  date: string;
  updatedAt: string;
  v4: IpqaNormalizedReport | null;
  v6: IpqaNormalizedReport | null;
  summary: {
    hasV4: boolean;
    hasV6: boolean;
    highestRiskCategory: RiskCategory;
    highestRiskSource: string;
    mediaSummary: Record<string, { unlocked: boolean; region?: string }>;
    aiSummary: Record<string, { unlocked: boolean; region?: string }>;
  };
  changesFromPrevious?: IpqaSemanticChange[];
}

export interface IpqaScoreHistoryPoint {
  date: string;
  v4: Record<string, string | number | boolean | null> | null;
  v6: Record<string, string | number | boolean | null> | null;
  highestRisk: RiskCategory;
}

export interface IpqaMediaHistoryPoint {
  date: string;
  mediaSummary: Record<string, { unlocked: boolean; region?: string }>;
  aiSummary: Record<string, { unlocked: boolean; region?: string }>;
}
