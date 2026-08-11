import { TreeCard } from '../components/TreeCard';
import { trees } from '../data/mockData';

export function Trees() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Trees</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          Every tree in the collection, each a live digital twin.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {trees.map((tree) => (
          <TreeCard key={tree.id} tree={tree} />
        ))}
      </div>
    </div>
  );
}
