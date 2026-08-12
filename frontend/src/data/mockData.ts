import type { Conditions, DailyReading, Forecast, Insight, Milestone, SpeciesReference, Status, Tree } from './types';

// Grove Collection — Kyle Ryan, North Bend, WA. Mirrors migrations/0001_real_trees_and_species.sql.
export const trees: Tree[] = [
  {
    id: 'mountain-hemlock',
    name: 'Mountain Hemlock',
    nickname: 'Sentinel',
    species: 'Mountain Hemlock',
    potSizeLiters: null,
    originNotes: 'Yamadori, collected from Washington State, acquired summer 2026.',
    originType: 'yamadori',
    acquiredDate: 'Summer 2026',
    estimatedAgeYearsLow: 50,
    estimatedAgeYearsHigh: 80,
    developmentStage: 'recovery',
    notes:
      'Flagship tree of the collection. Large aged trunk with significant natural movement and deadwood. Currently in a recovery nursery container after collection. No styling planned until spring 2027.',
    soilMoistureThresholdLow: 35,
    soilMoistureThresholdHigh: 75,
    ecThresholdHigh: 2.3,
    dormancySoilTempC: 5,
  },
  {
    id: 'yellow-cedar-1',
    name: 'Alaska Yellow Cedar #1',
    nickname: null,
    species: 'Alaska Yellow Cedar',
    potSizeLiters: null,
    originNotes: 'Nursery-grown.',
    originType: 'nursery',
    acquiredDate: null,
    estimatedAgeYearsLow: 4,
    estimatedAgeYearsHigh: 6,
    developmentStage: 'recovery',
    notes: 'Young pre-bonsai being grown for trunk development. Recovery only this season.',
    soilMoistureThresholdLow: 38,
    soilMoistureThresholdHigh: 78,
    ecThresholdHigh: 2.2,
    dormancySoilTempC: 6,
  },
  {
    id: 'yellow-cedar-2',
    name: 'Alaska Yellow Cedar #2',
    nickname: null,
    species: 'Alaska Yellow Cedar',
    potSizeLiters: null,
    originNotes: 'Nursery-grown.',
    originType: 'nursery',
    acquiredDate: null,
    estimatedAgeYearsLow: 4,
    estimatedAgeYearsHigh: 6,
    developmentStage: 'recovery',
    notes: 'Companion tree to Yellow Cedar #1 with a different future styling direction. No work planned until spring.',
    soilMoistureThresholdLow: 38,
    soilMoistureThresholdHigh: 78,
    ecThresholdHigh: 2.2,
    dormancySoilTempC: 6,
  },
  {
    id: 'silver-fir',
    name: 'Silver Fir',
    nickname: 'Tipsoo',
    species: 'Silver Fir',
    potSizeLiters: null,
    originNotes: 'Nursery-grown.',
    originType: 'nursery',
    acquiredDate: null,
    estimatedAgeYearsLow: 3,
    estimatedAgeYearsHigh: 5,
    developmentStage: 'development',
    notes: 'Early development tree. Being established before any structural work. Exact Abies species unconfirmed.',
    soilMoistureThresholdLow: 33,
    soilMoistureThresholdHigh: 72,
    ecThresholdHigh: 2.4,
    dormancySoilTempC: 6,
  },
  {
    id: 'dawn-redwood',
    name: 'Dawn Redwood',
    nickname: null,
    species: 'Dawn Redwood',
    potSizeLiters: null,
    originNotes: 'Nursery-grown.',
    originType: 'nursery',
    acquiredDate: null,
    estimatedAgeYearsLow: 2,
    estimatedAgeYearsHigh: 4,
    developmentStage: 'development',
    notes: 'Fast-growing deciduous conifer intended for future bonsai development. Will be allowed to grow freely for now.',
    soilMoistureThresholdLow: 32,
    soilMoistureThresholdHigh: 80,
    ecThresholdHigh: 2.5,
    dormancySoilTempC: 7,
  },
];

export const speciesReference: SpeciesReference[] = [
  {
    species: 'Mountain Hemlock',
    commonName: 'Mountain Hemlock',
    scientificName: 'Tsuga mertensiana',
    nativeRange:
      'High-elevation subalpine zones of the Pacific coast ranges and Cascades, from Alaska south through British Columbia, Washington, and Oregon to the Sierra Nevada; typically near treeline (5,000-7,500ft in the Cascades).',
    hardinessZone: 'USDA 5-7',
    lightNeeds: 'Full sun to light dappled shade; some afternoon shade helps at lower elevations since it evolved with cooler subalpine summers.',
    wateringNotes:
      'Prefers consistently moist, well-drained, humus-rich soil, mimicking snowmelt-fed subalpine slopes. As recently collected yamadori, roots are especially sensitive — keep evenly moist through establishment and avoid heat stress on the root zone.',
    fertilizationNotes:
      'Do not fertilize a freshly collected yamadori until roots are established (typically a full growing season). Once established, feed lightly with a balanced fertilizer in spring, tapering off by late summer.',
    commonPests: 'Spruce spider mites, hemlock woolly adelgid (more commonly associated with eastern/western hemlock, but worth monitoring), scale insects.',
    wiringGuidance: 'Wait until fully established post-collection. Branches can be brittle when stressed; wire outside of active growth flush and watch for die-back at wire pressure points.',
    stylingNotes: 'Prized for dramatic natural deadwood and trunk movement — this tree already has both. Needle reduction is slow; favor preserving existing jin/shari over heavy new carving.',
    seasonalCalendar:
      'Spring: resume light feeding once recovery is confirmed, watch for new candle growth as the signal. Summer: protect from prolonged heat, keep roots cool and moist. Fall: taper feeding. Winter: genuine cold dormancy is expected and beneficial for this subalpine species; protect container roots from hard freeze.',
    aiNotes:
      'Recovery timeline is the most important thing to track for the next several seasons — treat "no styling until spring 2027" as a hard constraint. Weight moisture-stress signals more heavily than for established stock; this tree has less buffer.',
    pnwNotes: "Uncommon at low elevation in the PNW lowlands — North Bend's summer heat is warmer than its native range, so monitor for heat stress.",
  },
  {
    species: 'Alaska Yellow Cedar',
    commonName: 'Alaska Yellow Cedar',
    scientificName: 'Callitropsis nootkatensis',
    nativeRange: 'Pacific coast from south-central Alaska through British Columbia to northern California, in cool, wet coastal and montane forests, often near hemlock and fir.',
    hardinessZone: 'USDA 4-7',
    lightNeeds: "Full sun to partial shade; naturally understory-tolerant when young. North Bend's mild summers are within its comfort range.",
    wateringNotes:
      'Wants consistently moist soil — a wet-climate species, markedly less drought-tolerant than junipers or pines. Do not let it dry out between waterings.',
    fertilizationNotes: 'As young trunk-development stock, feed generously through spring-summer with a nitrogen-forward fertilizer to encourage trunk thickening; ease off in early fall.',
    commonPests: 'Cedar/cypress leaf blight, spider mites, scale, aphids.',
    wiringGuidance: 'Responds well to wiring for trunk/branch movement. Bark is thin and marks easily — check wire regularly during active growth to avoid scarring.',
    stylingNotes: 'Naturally forms a weeping, pendulous branch habit — a hallmark of the species worth expressing rather than fighting.',
    seasonalCalendar:
      'Spring: resume/increase feeding, primary growth push. Summer: sustained watering vigilance — the most drought-sensitive species in the collection. Fall: reduce feeding. Winter: cold-hardy once established, protect container roots from hard freezes.',
    aiNotes:
      'Two trees in the collection share this profile but are being developed toward different styling directions — comparative insights between them are especially useful.',
    pnwNotes: "Native to the region; well-suited to North Bend's climate overall, with watering discipline being the main thing to get right.",
  },
  {
    species: 'Silver Fir',
    commonName: 'Silver Fir',
    scientificName: 'Abies sp. (exact species unconfirmed, likely Abies amabilis)',
    nativeRange:
      'For Abies amabilis (Pacific Silver Fir, the likely candidate given PNW sourcing): southeast Alaska through coastal and Cascade ranges of BC, Washington, and Oregon, typically mid-to-high elevation.',
    hardinessZone: 'USDA 5-7 (typical for PNW true firs)',
    lightNeeds: 'Full sun to light shade; true firs tolerate more shade than pines but ramify better with good light.',
    wateringNotes: 'Prefers consistently moist, well-drained soil. Not drought-tolerant — will show needle browning/drop if allowed to dry out repeatedly.',
    fertilizationNotes: 'As an early-development tree (~3-5 years), feed regularly through the growing season to build trunk caliper before structural styling begins.',
    commonPests: 'Balsam woolly adelgid, spider mites, aphids, needle cast fungal disease in overly wet/still air.',
    wiringGuidance: 'Not yet applicable — tree is in early development; structural wiring is premature until trunk and primary branch structure are established.',
    stylingNotes: 'Less common in bonsai than pines/junipers, but true firs can develop excellent formal- or informal-upright form with a strong central leader.',
    seasonalCalendar: 'Spring: main feeding and growth push. Summer: monitor moisture closely. Fall: taper feeding. Winter: dormant and cold-hardy once established.',
    aiNotes:
      'Species identification is unconfirmed — treat published hardiness/pest specifics as directional, not definitive, and surface that uncertainty rather than presenting it as settled fact.',
    pnwNotes: "Common at mid-to-high elevation regionally; North Bend's lowland climate is milder than its typical native habitat.",
  },
  {
    species: 'Dawn Redwood',
    commonName: 'Dawn Redwood',
    scientificName: 'Metasequoia glyptostroboides',
    nativeRange: 'Native to a small relict area of central China (Hubei/Sichuan/Hunan border region); widely cultivated worldwide since its rediscovery in the 1940s.',
    hardinessZone: 'USDA 5-8 — notably adaptable and fast-growing across a wide climate range.',
    lightNeeds: 'Full sun for best growth and form; tolerates light shade but grows more openly with less light.',
    wateringNotes:
      'A streamside/wetland-margin species in the wild — wants consistently moist soil and tolerates more water than most conifers used in bonsai.',
    fertilizationNotes: 'Vigorous grower — feed generously through the growing season. One of the best species here for rapid "grow and chop" trunk development.',
    commonPests: 'Generally pest-resistant compared to true conifers; watch for spider mites in hot/dry conditions and aphids on soft new growth.',
    wiringGuidance: 'Not yet applicable at this stage. When development begins, wires easily on young flexible growth, but branches thicken quickly.',
    stylingNotes:
      'A deciduous conifer — unlike the evergreens in this collection, it drops needles in fall and leafs out again in spring. Naturally forms a strong buttressed, fluted trunk with age.',
    seasonalCalendar:
      'Spring: leaf-out, main feeding begins. Summer: vigorous growth, high water demand. Fall: needles turn russet/bronze before dropping — normal, not a health issue. Winter: fully deciduous and dormant.',
    aiNotes:
      "The only deciduous tree in the collection — its normal fall needle-drop could otherwise look identical to a health alert if diagnostics aren't species-aware. Day length may be a more reliable dormancy trigger than soil temperature for this species.",
    pnwNotes: 'Not native, but performs well in cultivation across the PNW given adequate moisture.',
  },
];

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function seedFromString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

// Hash a (seed, dayIndex) pair to a stable 0..1 value. Anchoring noise to the
// calendar day (not loop position) means any requested window length agrees
// on the value for a given date — required for cross-screen consistency.
function dayNoise(seed: number, dayIndex: number): number {
  let h = (seed ^ dayIndex) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function dailyReadingsFor(treeId: string, days = 30): DailyReading[] {
  const seed = seedFromString(treeId);
  const readings: DailyReading[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayIndex = Math.floor(date.getTime() / 86400000);

    const moisture = Math.max(20, Math.min(80, 55 + Math.sin(dayIndex / 9 + seed) * 10 + (dayNoise(seed, dayIndex) - 0.5) * 8));
    const spread = 3 + dayNoise(seed + 1, dayIndex) * 4;
    const soilTemp = 16 + dayNoise(seed + 2, dayIndex) * 6;
    const soilEc = 1.2 + dayNoise(seed + 3, dayIndex) * 0.8;

    readings.push({
      date: date.toISOString().slice(0, 10),
      soilMoistureAvg: Math.round(moisture * 10) / 10,
      soilMoistureMin: Math.round((moisture - spread) * 10) / 10,
      soilMoistureMax: Math.round((moisture + spread) * 10) / 10,
      soilTempAvg: Math.round(soilTemp * 10) / 10,
      soilEcAvg: Math.round(soilEc * 100) / 100,
    });
  }
  return readings;
}

export function statusFor(treeId: string): Status {
  const rand = seededRandom(seedFromString(treeId + 'status'));
  const roll = rand();
  if (roll < 0.15) return 'urgent';
  if (roll < 0.4) return 'watch';
  return 'ok';
}

const likelyCauses: Record<Status, string[]> = {
  ok: ['Stable weather and consistent watering cadence.'],
  watch: [
    'Higher temperatures and wind likely contributed.',
    'Longer stretch between waterings than usual.',
    'Rising EC suggests it may be due for a flush.',
  ],
  urgent: ['A warm, dry stretch combined with a missed watering.', 'Faster-than-expected drainage after the last watering.'],
};

const actions: Record<Status, string | undefined> = {
  ok: undefined,
  watch: 'Plan to water within the next day or two.',
  urgent: 'Water today and recheck this evening.',
};

export function insightFor(treeId: string): Insight {
  const status = statusFor(treeId);
  const readings = dailyReadingsFor(treeId, 15);
  const latest = readings[readings.length - 1];
  const previous = readings[readings.length - 2];
  const baselineAvg = readings.slice(0, 14).reduce((sum, r) => sum + r.soilMoistureAvg, 0) / 14;
  const overnightDeltaPct = Math.round(((latest.soilMoistureAvg - previous.soilMoistureAvg) / previous.soilMoistureAvg) * 1000) / 10;
  const baselineDeltaPct = Math.round(((latest.soilMoistureAvg - baselineAvg) / baselineAvg) * 1000) / 10;
  const rand = seededRandom(seedFromString(treeId + 'insight'));

  const titles: Record<Status, string> = {
    ok: 'GroveIQ: conditions are stable.',
    watch: 'GroveIQ detected faster-than-usual drying.',
    urgent: 'GroveIQ detected unusual drying overnight.',
  };

  const evidence =
    status === 'ok'
      ? `Soil moisture at ${latest.soilMoistureAvg}%, within ${Math.abs(baselineDeltaPct)}% of its 14-day baseline.`
      : `Soil moisture fell ${Math.abs(overnightDeltaPct)}% overnight to ${latest.soilMoistureAvg}%.`;

  const comparison =
    status === 'ok'
      ? undefined
      : `${Math.abs(baselineDeltaPct / (overnightDeltaPct || 1)).toFixed(1)}x faster than its 14-day baseline rate.`;

  const causeOptions = likelyCauses[status];
  const likelyCause = status === 'ok' ? undefined : causeOptions[Math.floor(rand() * causeOptions.length)];

  const hoursToThreshold = Math.max(2, Math.round(12 + rand() * 10));
  const thresholdTime = new Date();
  thresholdTime.setHours(thresholdTime.getHours() + hoursToThreshold);
  const implication =
    status === 'urgent'
      ? `May reach its moisture threshold around ${thresholdTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} if untreated.`
      : status === 'watch'
        ? 'Likely to cross its low threshold within 2-3 days at the current rate.'
        : undefined;

  return {
    id: `${treeId}-insight`,
    treeId,
    status,
    title: titles[status],
    evidence,
    comparison,
    likelyCause,
    implication,
    action: actions[status],
    ts: new Date().toISOString(),
  };
}

export function allInsights(): Insight[] {
  return trees.map((t) => insightFor(t.id)).sort((a, b) => {
    const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };
    return rank[a.status] - rank[b.status];
  });
}

export function lastWateredFor(treeId: string): string {
  const rand = seededRandom(seedFromString(treeId + 'watered'));
  const hoursAgo = Math.floor(6 + rand() * 60);
  const days = Math.floor(hoursAgo / 24);
  const hours = hoursAgo % 24;
  return days > 0 ? `${days}d ${hours}h ago` : `${hours}h ago`;
}

export function milestonesFor(treeId: string): Milestone[] {
  const rand = seededRandom(seedFromString(treeId + 'milestones'));
  const labels = ['collected', 'repotted', 'buds swelling', 'strong flush', 'wired'];
  const count = 2 + Math.floor(rand() * 3);
  const milestones: Milestone[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(rand() * 200);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    milestones.push({
      id: i,
      treeId,
      date: date.toISOString().slice(0, 10),
      label: labels[Math.floor(rand() * labels.length)],
      source: rand() > 0.5 ? 'ai' : 'manual',
    });
  }
  return milestones.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const currentConditions: Conditions = {
  outdoorTempC: 22,
  humidityPct: 58,
  windMph: 6,
  rainIn: 0,
  blackGlobeTempC: 27,
  pm25: 8,
};

// Tetens formula: saturation vapor pressure (kPa) from temp (C); VPD = es * (1 - RH/100).
export function vpdKPa(tempC = currentConditions.outdoorTempC, humidityPct = currentConditions.humidityPct): number {
  const es = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  return Math.round(es * (1 - humidityPct / 100) * 100) / 100;
}

export type HourlyPoint = { hour: string; tempC: number; humidityPct: number; windMph: number; solarWm2: number; rainIn: number };

export function hourlyConditionsToday(): HourlyPoint[] {
  const rand = seededRandom(7);
  const points: HourlyPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const dayCurve = Math.sin(((h - 6) / 24) * Math.PI * 2) * 0.5 + 0.5;
    const tempC = 12 + dayCurve * 12 + (rand() - 0.5) * 1.5;
    const humidityPct = 80 - dayCurve * 30 + (rand() - 0.5) * 5;
    const solarWm2 = h >= 6 && h <= 20 ? Math.max(0, Math.sin(((h - 6) / 14) * Math.PI)) * (750 + rand() * 100) : 0;
    points.push({
      hour: `${h.toString().padStart(2, '0')}:00`,
      tempC: Math.round(tempC * 10) / 10,
      humidityPct: Math.round(Math.max(30, Math.min(95, humidityPct))),
      windMph: Math.round((3 + rand() * 8) * 10) / 10,
      solarWm2: Math.round(solarWm2),
      rainIn: 0,
    });
  }
  return points;
}

export function waterDemandNow(): { label: string; tone: 'ok' | 'watch' | 'urgent' } {
  const vpd = vpdKPa();
  if (vpd > 1.6) return { label: 'High', tone: 'urgent' };
  if (vpd > 0.9) return { label: 'Moderate', tone: 'watch' };
  return { label: 'Low', tone: 'ok' };
}

export function forecastNext7Days(): Forecast[] {
  const rand = seededRandom(42);
  const days: Forecast[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    days.push({
      date: date.toISOString().slice(0, 10),
      lowTempF: Math.round(48 + rand() * 10),
      highTempF: Math.round(70 + rand() * 12),
      windGustMph: Math.round(5 + rand() * 20),
      precipChancePct: Math.round(rand() * 60),
      frostRisk: false,
    });
  }
  return days;
}
