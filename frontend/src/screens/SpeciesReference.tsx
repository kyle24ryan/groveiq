import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { speciesReference, trees } from '../data/mockData';

const fields: { key: keyof (typeof speciesReference)[number]; label: string }[] = [
  { key: 'nativeRange', label: 'Native range' },
  { key: 'hardinessZone', label: 'Hardiness zone' },
  { key: 'lightNeeds', label: 'Light' },
  { key: 'wateringNotes', label: 'Watering' },
  { key: 'fertilizationNotes', label: 'Fertilization' },
  { key: 'commonPests', label: 'Common pests' },
  { key: 'wiringGuidance', label: 'Wiring guidance' },
  { key: 'stylingNotes', label: 'Styling notes' },
  { key: 'seasonalCalendar', label: 'Seasonal calendar' },
  { key: 'aiNotes', label: "Sensei's notes" },
  { key: 'pnwNotes', label: 'PNW notes' },
];

export function SpeciesReference() {
  const { species } = useParams<{ species: string }>();

  if (species) {
    const entry = speciesReference.find((s) => s.species === decodeURIComponent(species));
    if (!entry) {
      return (
        <div>
          <p>Species not found.</p>
          <Link to="/species">← Back to Species</Link>
        </div>
      );
    }
    const relatedTrees = trees.filter((t) => t.species === entry.species);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
        <div>
          <Link to="/species" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            ← Species
          </Link>
          <h1 style={{ fontSize: 28, marginTop: 8 }}>{entry.commonName}</h1>
          <div style={{ fontStyle: 'italic', color: 'var(--ink-soft)', fontSize: 15 }}>{entry.scientificName}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>
            Trees: {relatedTrees.map((t) => t.name).join(', ')}
          </div>
        </div>
        {fields.map(({ key, label }) => (
          <Card key={key}>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)', marginBottom: 6 }}>
              {label}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>{entry[key]}</p>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Species Reference</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>Care guides for every species in the collection.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {speciesReference.map((entry) => {
          const relatedTrees = trees.filter((t) => t.species === entry.species);
          return (
            <Link key={entry.species} to={`/species/${encodeURIComponent(entry.species)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card style={{ height: '100%' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>{entry.commonName}</div>
                <div style={{ fontStyle: 'italic', color: 'var(--ink-soft)', fontSize: 13, marginTop: 2 }}>{entry.scientificName}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 10 }}>
                  {relatedTrees.length} tree{relatedTrees.length !== 1 ? 's' : ''}: {relatedTrees.map((t) => t.name).join(', ')}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
