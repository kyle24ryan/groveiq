import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Overview } from './screens/Overview';
import { TreeDetail } from './screens/TreeDetail';
import { TimeMachine } from './screens/TimeMachine';
import { Weather } from './screens/Weather';
import { Settings } from './screens/Settings';
import { SpeciesReference } from './screens/SpeciesReference';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="trees/:treeId" element={<TreeDetail />} />
          <Route path="species" element={<SpeciesReference />} />
          <Route path="species/:species" element={<SpeciesReference />} />
          <Route path="time-machine" element={<TimeMachine />} />
          <Route path="weather" element={<Weather />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
