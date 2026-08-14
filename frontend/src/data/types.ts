export type Status = 'ok' | 'watch' | 'urgent';

export type DevelopmentStage = 'recovery' | 'development' | 'styling' | 'refinement';
export type OriginType = 'yamadori' | 'nursery' | 'cutting' | 'other';

export type Tree = {
  id: string;
  name: string;
  nickname: string | null;
  species: string;
  potSizeLiters: number | null;
  originNotes: string | null;
  originType: OriginType;
  acquiredDate: string | null;
  estimatedAgeYearsLow: number | null;
  estimatedAgeYearsHigh: number | null;
  developmentStage: DevelopmentStage;
  notes: string | null;
  soilMoistureThresholdLow: number;
  soilMoistureThresholdHigh: number;
  ecThresholdHigh: number;
  dormancySoilTempC: number;
};

export type SpeciesReference = {
  species: string;
  commonName: string;
  scientificName: string;
  nativeRange: string;
  hardinessZone: string;
  lightNeeds: string;
  wateringNotes: string;
  fertilizationNotes: string;
  commonPests: string;
  wiringGuidance: string;
  stylingNotes: string;
  seasonalCalendar: string;
  aiNotes: string;
  pnwNotes: string;
};

export type DailyReading = {
  date: string;
  soilMoistureAvg: number;
  soilMoistureMin: number;
  soilMoistureMax: number;
  soilTempAvg: number;
  soilEcAvg: number;
};

export type Analysis = {
  id: number;
  treeId: string;
  kind: 'sensor' | 'vision' | 'comparative' | 'retrospective';
  source?: 'manual' | 'scheduled';
  status: Status;
  summary: string;
  detail: string;
  ts: string;
};

export type Milestone = {
  id: number;
  treeId: string;
  date: string;
  label: string;
  source: 'manual' | 'ai';
  note?: string;
};

export type Conditions = {
  outdoorTempC: number;
  outdoorTempHighC: number;
  outdoorTempLowC: number;
  humidityPct: number;
  windMph: number;
  windDirDeg: number;
  rainIn: number;
  pressureHpa: number;
  blackGlobeTempC: number;
  wbgtC: number;
  pm25: number;
};

export type ConfidenceLevel = 'low' | 'medium' | 'high';

// One point in an evidence chart's timeline. A given date carries `observed`
// while it's a real past reading, `projected` once it's a forward-looking
// estimate; the day they hand off carries both so the two lines meet instead
// of leaving a gap (see mockData.ts's insightFor for how it's built).
export type EvidencePoint = {
  date: string;
  observed?: number;
  projected?: number;
};

// Structured facts behind an Insight, so panels can read fields directly
// instead of parsing them back out of the prose strings below (spec:
// GROVEIQ_COMMAND_SPATIAL_REDESIGN_SPEC.md section 8.1). The prose fields
// (title/evidence/comparison/likelyCause/implication/action) remain the
// source of truth for existing consumers (TreeCard, Insights, Timeline);
// these are additive.
export type Insight = {
  id: string;
  treeId: string | null;
  status: Status;
  title: string;
  evidence: string;
  comparison?: string;
  likelyCause?: string;
  implication?: string;
  action?: string;
  ts: string;

  headline?: string;
  detection?: {
    metric: string;
    currentValue: number;
    unit: string;
    changeWindow?: string;
  };
  driver?: {
    label: string;
    relationship: 'correlated' | 'likely' | 'confirmed';
  };
  confidence?: {
    level: ConfidenceLevel;
    rationale: string;
  };
  daysToThreshold?: number | null;
  thresholdValue?: number;
  thresholdLabel?: string;
  evidenceSeries?: EvidencePoint[];
};
