import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Global resilience handler to catch unhandled async errors in sandboxed environments
if (typeof window !== 'undefined') {
  window.onerror = function (message, source, lineno, colno, error) {
    if (typeof message === 'string' && (message.includes('Script error') || message === 'Script error.')) {
      console.warn('Suppressed cross-origin / sandboxed script error event:', { message, source, lineno, colno, error });
      return true; // Prevents default browser uncaught error bubbling
    }
    console.warn('Handled global window error:', { message, source, lineno, colno, error });
    return false;
  };

  window.addEventListener('error', (event) => {
    // Prevent unhandled cross-origin script errors from bubbling or crashing the page
    if (event.message === 'Script error.' || !event.error || event.message?.includes('Script error')) {
      console.warn('Handled cross-origin / background script event:', event);
      event.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Handled unhandled promise rejection:', event.reason);
    // Prevent default browser unhandled rejection crash behavior if applicable
    event.preventDefault();
  });
}

// Clean up any stale service worker in development preview to prevent stalled loading
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().catch(() => {});
    }
  }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


