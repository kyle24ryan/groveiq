import type { Analysis, Conditions, DailyReading, Forecast, Milestone, SpeciesReference, Status, Tree } from './types';

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
    nickname: null,
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

export function dailyReadingsFor(treeId: string, days = 30): DailyReading[] {
  const rand = seededRandom(seedFromString(treeId));
  const readings: DailyReading[] = [];
  let moisture = 55 + rand() * 10;
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    moisture += (rand() - 0.55) * 4;
    moisture = Math.max(20, Math.min(80, moisture));
    const spread = 3 + rand() * 4;

    readings.push({
      date: date.toISOString().slice(0, 10),
      soilMoistureAvg: Math.round(moisture * 10) / 10,
      soilMoistureMin: Math.round((moisture - spread) * 10) / 10,
      soilMoistureMax: Math.round((moisture + spread) * 10) / 10,
      soilTempAvg: Math.round((16 + rand() * 6) * 10) / 10,
      soilEcAvg: Math.round((1.2 + rand() * 0.8) * 100) / 100,
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

const summaries: Record<Status, string[]> = {
  ok: [
    'Moisture steady, no action needed today.',
    'Conditions look comfortable — nothing to do.',
    'Holding well since the last watering.',
  ],
  watch: [
    'Worth watering before the weekend.',
    'Drying a bit faster than usual this week.',
    'EC trending up slightly — keep an eye on it.',
  ],
  urgent: [
    'Soil moisture below threshold — water today.',
    'Sharp drop overnight, check on this one soon.',
  ],
};

export function latestAnalysisFor(treeId: string): Analysis {
  const status = statusFor(treeId);
  const rand = seededRandom(seedFromString(treeId + 'analysis'));
  const options = summaries[status];
  const summary = options[Math.floor(rand() * options.length)];
  return {
    id: seedFromString(treeId) % 100000,
    treeId,
    kind: 'sensor',
    status,
    summary,
    detail: `${summary} Based on the last 7 days of soil moisture, temperature, and EC readings compared against this tree's species thresholds.`,
    ts: new Date().toISOString(),
  };
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
