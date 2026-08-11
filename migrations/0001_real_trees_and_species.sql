-- Migration 0001: expand trees + species_reference schema, replace placeholder
-- trees with the real Grove Collection, seed rich species_reference content.

ALTER TABLE trees ADD COLUMN nickname TEXT;
ALTER TABLE trees ADD COLUMN origin_type TEXT;
ALTER TABLE trees ADD COLUMN acquired_date TEXT;
ALTER TABLE trees ADD COLUMN estimated_age_years_low INTEGER;
ALTER TABLE trees ADD COLUMN estimated_age_years_high INTEGER;
ALTER TABLE trees ADD COLUMN development_stage TEXT;
ALTER TABLE trees ADD COLUMN notes TEXT;

ALTER TABLE species_reference ADD COLUMN common_name TEXT;
ALTER TABLE species_reference ADD COLUMN scientific_name TEXT;
ALTER TABLE species_reference ADD COLUMN hardiness_zone TEXT;
ALTER TABLE species_reference ADD COLUMN watering_notes TEXT;
ALTER TABLE species_reference ADD COLUMN fertilization_notes TEXT;
ALTER TABLE species_reference ADD COLUMN wiring_guidance TEXT;
ALTER TABLE species_reference ADD COLUMN seasonal_calendar TEXT;
ALTER TABLE species_reference ADD COLUMN ai_notes TEXT;

DELETE FROM trees WHERE id IN ('tree-1', 'tree-2', 'tree-3', 'tree-4', 'tree-5');

-- ============================================================
-- SEED DATA: species_reference (4 species — Grove Collection)
-- ============================================================
INSERT OR IGNORE INTO species_reference
  (species, common_name, scientific_name, native_range, hardiness_zone, light_needs,
   watering_notes, fertilization_notes, common_pests, wiring_guidance, styling_notes,
   seasonal_calendar, ai_notes, pnw_notes)
VALUES
(
  'Mountain Hemlock', 'Mountain Hemlock', 'Tsuga mertensiana',
  'High-elevation subalpine zones of the Pacific coast ranges and Cascades, from Alaska south through British Columbia, Washington, and Oregon to the Sierra Nevada; typically near treeline (5,000-7,500ft in the Cascades).',
  'USDA 5-7',
  'Full sun to light dappled shade; some afternoon shade helps at lower elevations since it evolved with cooler subalpine summers.',
  'Prefers consistently moist, well-drained, humus-rich soil, mimicking snowmelt-fed subalpine slopes. As recently collected yamadori, roots are especially sensitive -- keep evenly moist through establishment and avoid heat stress on the root zone.',
  'Do not fertilize a freshly collected yamadori until roots are established (typically a full growing season). Once established, feed lightly with a balanced fertilizer in spring, tapering off by late summer.',
  'Spruce spider mites, hemlock woolly adelgid (more commonly associated with eastern/western hemlock, but worth monitoring), scale insects.',
  'Wait until fully established post-collection. Branches can be brittle when stressed; wire outside of active growth flush and watch for die-back at wire pressure points.',
  'Prized for dramatic natural deadwood and trunk movement -- this tree already has both. Needle reduction is slow; favor preserving existing jin/shari over heavy new carving.',
  'Spring: resume light feeding once recovery is confirmed, watch for new candle growth as the signal. Summer: protect from prolonged heat, keep roots cool and moist. Fall: taper feeding. Winter: genuine cold dormancy is expected and beneficial for this subalpine species; protect container roots from hard freeze (a pot freezes faster than the ground would).',
  'Recovery timeline is the most important thing to track for the next several seasons -- treat "no styling until spring 2027" as a hard constraint and flag any styling-adjacent suggestion (heavy pruning, wiring) as premature before then. Weight moisture-stress signals more heavily than for established stock; this tree has less buffer.',
  'Uncommon at low elevation in the PNW lowlands -- North Bend''s summer heat is warmer than its native range, so monitor for heat stress more than a native-elevation planting would need.'
),
(
  'Alaska Yellow Cedar', 'Alaska Yellow Cedar', 'Callitropsis nootkatensis',
  'Pacific coast from south-central Alaska through British Columbia to northern California, in cool, wet coastal and montane forests, often near hemlock and fir.',
  'USDA 4-7',
  'Full sun to partial shade; naturally understory-tolerant when young. Some afternoon shade protection helps in hot climates, though North Bend''s mild summers are within its comfort range.',
  'Wants consistently moist soil -- a wet-climate species, markedly less drought-tolerant than junipers or pines. Do not let it dry out between waterings. Drainage still matters to avoid root rot, but tolerance for dry spells is low.',
  'As young trunk-development stock, feed generously through spring-summer with a nitrogen-forward fertilizer to encourage trunk thickening; ease off in early fall.',
  'Cedar/cypress leaf blight, spider mites, scale, aphids. The species has seen wild "cedar decline" linked to reduced snowpack exposing roots to freeze -- a reminder of how cold- and moisture-sensitive the roots are, though less relevant to a protected container.',
  'Responds well to wiring for trunk/branch movement. Bark is thin and marks easily -- check wire regularly during active growth to avoid scarring.',
  'Naturally forms a weeping, pendulous branch habit -- a hallmark of the species worth expressing rather than fighting. Suits informal upright and weeping/cascade-adjacent styles.',
  'Spring: resume/increase feeding, primary growth push. Summer: sustained watering vigilance -- the most drought-sensitive species in the collection. Fall: reduce feeding, allow growth to harden off. Winter: cold-hardy once established, but protect container roots from hard, prolonged freezes.',
  'Two trees in the collection share this profile but are being developed toward different styling directions -- comparative insights between them are especially useful, since consistent divergence in trunk growth or health under similar conditions is meaningful signal.',
  'Native to the region; well-suited to North Bend''s climate overall, with watering discipline being the main thing to get right.'
),
(
  'Silver Fir', 'Silver Fir', 'Abies sp. (exact species unconfirmed, likely Abies amabilis)',
  'For Abies amabilis (Pacific Silver Fir, the likely candidate given PNW sourcing): southeast Alaska through coastal and Cascade ranges of BC, Washington, and Oregon, typically mid-to-high elevation in cool, moist forests.',
  'USDA 5-7 (typical for PNW true firs)',
  'Full sun to light shade; true firs tolerate more shade than pines but ramify better with good light.',
  'Prefers consistently moist, well-drained soil. Not drought-tolerant -- will show needle browning/drop if allowed to dry out repeatedly.',
  'As an early-development tree (~3-5 years), feed regularly through the growing season with a balanced-to-nitrogen-forward fertilizer to build trunk caliper before structural styling begins.',
  'Balsam woolly adelgid (a significant pest of true firs in parts of the range), spider mites, aphids, needle cast fungal disease in overly wet/still air.',
  'Not yet applicable -- tree is in early development; structural wiring is premature until trunk and primary branch structure are established.',
  'Less common in bonsai than pines/junipers, but true firs can develop excellent formal- or informal-upright form with a strong central leader and tiered branching.',
  'Spring: main feeding and growth push. Summer: monitor moisture closely, avoid heat stress. Fall: taper feeding. Winter: dormant and cold-hardy once established; protect container roots from hard freeze.',
  'Species identification is unconfirmed -- treat published hardiness/pest specifics as directional, not definitive, and surface that uncertainty in any AI-generated guidance rather than presenting it as settled fact until confirmed.',
  'Common at mid-to-high elevation regionally; North Bend''s lowland climate is milder than its typical native habitat.'
),
(
  'Dawn Redwood', 'Dawn Redwood', 'Metasequoia glyptostroboides',
  'Native to a small relict area of central China (Hubei/Sichuan/Hunan border region); widely cultivated worldwide since its rediscovery in the 1940s after being known only from fossils.',
  'USDA 5-8 -- notably adaptable and fast-growing across a wide climate range.',
  'Full sun for best growth and form; tolerates light shade but grows more openly with less light.',
  'A streamside/wetland-margin species in the wild -- wants consistently moist soil and tolerates more water than most conifers used in bonsai. Comparatively forgiving of overwatering, but as young developing stock should not be allowed to dry out.',
  'Vigorous grower -- feed generously through the growing season to take advantage of its naturally fast trunk-thickening habit. One of the best species here for rapid "grow and chop" trunk development.',
  'Generally pest-resistant compared to true conifers; watch for spider mites in hot/dry conditions and aphids on soft new growth.',
  'Not yet applicable at this stage (2-4 years, growing freely). When development begins, wires easily on young flexible growth, but branches thicken quickly -- needs more frequent wire monitoring than slower species to avoid scarring.',
  'A deciduous conifer -- unlike the evergreens in this collection, it drops needles in fall and leafs out again in spring, so seasonal bare-tree structure is part of its character. Naturally forms a strong buttressed, fluted trunk with age -- a signature feature to encourage during development.',
  'Spring: leaf-out, main feeding and growth push begins. Summer: vigorous growth, high water demand, good season for trunk-building work. Fall: needles turn russet/bronze before dropping -- normal, not a health issue. Winter: fully deciduous and dormant; bare branches are the expected state, not a red flag.',
  'The only deciduous tree in the collection -- its normal fall needle-drop could otherwise look identical to a health alert if diagnostics aren''t species-aware. Good test case for confirming per-species logic in the daily diagnostic doesn''t false-positive on a healthy deciduous conifer behaving normally. Day length may be a more reliable dormancy trigger for this species than soil temperature alone.',
  'Not native, but performs well in cultivation across the PNW given adequate moisture.'
);

-- ============================================================
-- SEED DATA: trees (Grove Collection -- Kyle Ryan, North Bend, WA)
-- ============================================================
INSERT OR IGNORE INTO trees
  (id, name, nickname, species, pot_size_liters, origin_notes, origin_type, acquired_date,
   estimated_age_years_low, estimated_age_years_high, development_stage, notes,
   soil_moisture_threshold_low, soil_moisture_threshold_high, ec_threshold_high, dormancy_soil_temp_c)
VALUES
(
  'mountain-hemlock', 'Mountain Hemlock', 'Sentinel', 'Mountain Hemlock', NULL,
  'Yamadori, collected from Washington State, acquired summer 2026.', 'yamadori', 'Summer 2026',
  50, 80, 'recovery',
  'Flagship tree of the collection. Large aged trunk with significant natural movement and deadwood. Currently in a recovery nursery container after collection. No styling planned until spring 2027.',
  35, 75, 2.3, 5
),
(
  'yellow-cedar-1', 'Alaska Yellow Cedar #1', NULL, 'Alaska Yellow Cedar', NULL,
  'Nursery-grown.', 'nursery', NULL,
  4, 6, 'recovery',
  'Young pre-bonsai being grown for trunk development. Recovery only this season.',
  38, 78, 2.2, 6
),
(
  'yellow-cedar-2', 'Alaska Yellow Cedar #2', NULL, 'Alaska Yellow Cedar', NULL,
  'Nursery-grown.', 'nursery', NULL,
  4, 6, 'recovery',
  'Companion tree to Yellow Cedar #1 with a different future styling direction. No work planned until spring.',
  38, 78, 2.2, 6
),
(
  'silver-fir', 'Silver Fir', NULL, 'Silver Fir', NULL,
  'Nursery-grown.', 'nursery', NULL,
  3, 5, 'development',
  'Early development tree. Being established before any structural work. Exact Abies species unconfirmed.',
  33, 72, 2.4, 6
),
(
  'dawn-redwood', 'Dawn Redwood', NULL, 'Dawn Redwood', NULL,
  'Nursery-grown.', 'nursery', NULL,
  2, 4, 'development',
  'Fast-growing deciduous conifer intended for future bonsai development. Will be allowed to grow freely for now.',
  32, 80, 2.5, 7
);
