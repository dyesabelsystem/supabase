export type AppView = 'home' | 'chapter' | 'pillar' | 'donate' | 'legal' | 'dashboard';

export interface PersistedAppState {
  view: AppView;
  selectedChapterId: string | null;
  selectedPillarId: string | null;
  scrollPositions: Partial<Record<AppView, number>>;
  updatedAt: number;
}

const APP_STATE_KEY = 'dyesabel_app_state';

const defaultState: PersistedAppState = {
  view: 'home',
  selectedChapterId: null,
  selectedPillarId: null,
  scrollPositions: {},
  updatedAt: 0
};

const isBrowser = () => typeof window !== 'undefined';

export const readPersistedAppState = (): PersistedAppState => {
  if (!isBrowser()) return defaultState;

  try {
    const raw = window.sessionStorage.getItem(APP_STATE_KEY);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    return {
      ...defaultState,
      ...parsed,
      scrollPositions: {
        ...defaultState.scrollPositions,
        ...(parsed.scrollPositions || {})
      }
    };
  } catch {
    return defaultState;
  }
};

export const patchPersistedAppState = (partialState: Partial<PersistedAppState>) => {
  if (!isBrowser()) return;

  const currentState = readPersistedAppState();
  const nextState: PersistedAppState = {
    ...currentState,
    ...partialState,
    scrollPositions: {
      ...currentState.scrollPositions,
      ...(partialState.scrollPositions || {})
    },
    updatedAt: Date.now()
  };

  try {
    window.sessionStorage.setItem(APP_STATE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage access failures.
  }
};

export const clearPersistedAppState = () => {
  if (!isBrowser()) return;

  try {
    window.sessionStorage.removeItem(APP_STATE_KEY);
  } catch {
    // Ignore storage access failures.
  }
};
