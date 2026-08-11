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
  humidityPct: number;
  windMph: number;
  rainIn: number;
  blackGlobeTempC: number;
  pm25: number;
};

export type Forecast = {
  date: string;
  lowTempF: number;
  highTempF: number;
  windGustMph: number;
  precipChancePct: number;
  frostRisk: boolean;
};
