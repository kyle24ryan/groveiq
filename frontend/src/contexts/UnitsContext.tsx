import { createContext, useContext, useState, type ReactNode } from 'react';

export type UnitSystem = 'us' | 'metric';

const STORAGE_KEY = 'groveiq-units';

type UnitsContextValue = {
  system: UnitSystem;
  setSystem: (system: UnitSystem) => void;
};

const UnitsContext = createContext<UnitsContextValue | null>(null);

function readStored(): UnitSystem {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'metric' ? 'metric' : 'us'; // US customary is the default (SPEC.md)
  } catch {
    return 'us';
  }
}

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>(readStored);

  function setSystem(next: UnitSystem) {
    setSystemState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private browsing, etc.) - setting just won't persist.
    }
  }

  return <UnitsContext.Provider value={{ system, setSystem }}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used within UnitsProvider');
  return ctx;
}
