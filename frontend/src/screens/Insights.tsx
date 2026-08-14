import { InsightPanel } from '../components/InsightPanel';
import { trees, allInsights } from '../data/mockData';

export function Insights() {
  const insights = allInsights();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800 }}>
      <div>
        <h1 style={{ fontSize: 24 }}>Intelligence</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
          Anomalies, forecasts, and explanations across the collection.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {insights.map((insight) => {
          const tree = trees.find((t) => t.id === insight.treeId);
          return <InsightPanel key={insight.id} insight={insight} treeName={tree?.name} />;
        })}
      </div>
    </div>
  );
}
