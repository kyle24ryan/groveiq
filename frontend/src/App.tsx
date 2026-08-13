import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UnitsProvider } from './contexts/UnitsContext';
import { Layout } from './components/Layout';
import { Grove } from './screens/Grove';
import { Trees } from './screens/Trees';
import { TreeDetail } from './screens/TreeDetail';
import { Environment } from './screens/Environment';
import { Timeline } from './screens/Timeline';
import { Insights } from './screens/Insights';
import { Settings } from './screens/Settings';
import { NotificationSettings } from './screens/NotificationSettings';
import { SpeciesReference } from './screens/SpeciesReference';

function App() {
  return (
    <UnitsProvider>
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
            <Route path="settings/notifications" element={<NotificationSettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </UnitsProvider>
  );
}

export default App;
