import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './pwa-status.css';

export default function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const registrationRef = useRef(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_serviceWorkerUrl, registration) {
      registrationRef.current = registration || null;
      registration?.update().catch(() => {});
    },
    onRegisterError(error) {
      console.error('PWA registration failed', error);
    },
  });

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  useEffect(() => {
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        registrationRef.current?.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', checkForUpdate);
    return () => document.removeEventListener('visibilitychange', checkForUpdate);
  }, []);

  return (
    <div className="pwa-status-layer" aria-live="polite">
      {!online && (
        <div className="pwa-offline-banner" role="status">
          <span className="pwa-status-dot" aria-hidden="true" />
          You’re offline. Picks and live scores need a connection.
        </div>
      )}
      {online && needRefresh && (
        <section className="pwa-update-card" role="status" aria-label="App update available">
          <div className="pwa-update-copy">
            <strong>Update ready</strong>
            <span>Refresh PAB to use the latest version.</span>
          </div>
          <div className="pwa-update-actions">
            <button type="button" className="pwa-update-later" onClick={() => setNeedRefresh(false)}>Later</button>
            <button type="button" className="pwa-update-now" onClick={() => updateServiceWorker(true)}>Update</button>
          </div>
        </section>
      )}
    </div>
  );
}
