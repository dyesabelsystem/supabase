import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppToastViewport, appToast } from './components/AppToast';
import ErrorBoundary from './components/ErrorBoundary';
import { AppDialogProvider } from './contexts/AppDialogContext';
import { AuthProvider } from './contexts/AuthContext';
import './index.css'; // Ensure your global styles are imported

const applyInitialTheme = () => {
  const savedTheme = window.localStorage.getItem('theme');
  const theme = savedTheme || 'dark';

  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

applyInitialTheme();

// Register directly instead of using the PWA auto-update helper, which contains
// a controller-change reload handler. Updates download in the background and
// wait until every open app tab closes before activating.
const registerServiceWorker = async () => {
  let updateToastShown = false;
  const showUpdateReady = () => {
    if (updateToastShown) return;
    updateToastShown = true;
    appToast.success("Update downloaded", {
      description: "It will be ready the next time you open the app. Your current session will continue.",
      duration: 5000,
    });
  };

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      type: 'classic',
    });

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const isUpdate = Boolean(navigator.serviceWorker.controller);
      worker.addEventListener('statechange', () => {
        if (worker.state !== 'installed') return;
        if (isUpdate) {
          showUpdateReady();
        } else {
          appToast.success("App ready for offline use.");
        }
      });
    };

    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateReady();
    }
    watchInstallingWorker(registration.installing);
    registration.addEventListener('updatefound', () => {
      watchInstallingWorker(registration.installing);
    });
  } catch (error) {
    console.error('Service worker registration failed:', error);
  }
};

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  if (document.readyState === 'complete') {
    void registerServiceWorker();
  } else {
    window.addEventListener('load', () => void registerServiceWorker(), { once: true });
  }
}

// Handle offline sync messages from SW
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string };
    if (!data) return;

    if (data.type === "OFFLINE_WRITE_QUEUED") {
      appToast.info("You're offline", {
        description: "Your changes are queued and will sync when you're online.",
        duration: 5000,
      });
    }

    if (data.type === "OFFLINE_QUEUE_SYNCED") {
      appToast.success("Back online", {
        description: "Queued changes have been synced.",
        duration: 4000,
      });
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppToastViewport />
      <AuthProvider>
        <AppDialogProvider>
          <App />
        </AppDialogProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
