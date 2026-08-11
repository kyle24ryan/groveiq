import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Grove } from './screens/Grove';
import { Trees } from './screens/Trees';
import { TreeDetail } from './screens/TreeDetail';
import { Environment } from './screens/Environment';
import { Timeline } from './screens/Timeline';
import { Insights } from './screens/Insights';
import { Settings } from './screens/Settings';
import { SpeciesReference } from './screens/SpeciesReference';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Grove />} />
          <Route path="trees" element={<Trees />} />
          <Route path="trees/:treeId" element={<TreeDetail />} />
          <Route path="species" element={<SpeciesReference />} />
          <Route path="species/:species" element={<SpeciesReference />} />
          <Route path="environment" element={<Environment />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="insights" element={<Insights />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
