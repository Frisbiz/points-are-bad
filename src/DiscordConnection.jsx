import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Discord, Link, LinkOff, RefreshCw, Check, X } from "griddy-icons";
import { discordResultMessage, requestDiscordAccount } from "./discordConnection.js";
import "./discord-connection.css";

export default function DiscordConnection({ username, returnPath, resultCode, onConnectionChange }) {
  const [connection, setConnection] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [notice, setNotice] = useState(resultCode ? discordResultMessage(resultCode) : "");
  const controller = useRef(null);
  const requestPending = useRef(false);
  const labelId = useId();
  const titleId = useId();
  const demo = username === "demo";

  const load = useCallback(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    requestDiscordAccount("discord-account-status", undefined, { signal: current.signal }).then(data => {
      if (!current.signal.aborted) { setConnection(data); setLoadError(""); }
    }).catch(failure => {
      if (!current.signal.aborted) setLoadError(failure.message);
    });
  }, []);

  useEffect(() => {
    if (username !== "demo") load();
    return () => controller.current?.abort();
  }, [load, username]);

  const mutate = async (action, payload) => {
    if (requestPending.current) return;
    requestPending.current = true;
    setBusy(action); setError(""); setNotice("");
    const signal = controller.current?.signal;
    try {
      const data = await requestDiscordAccount(action, payload, { signal });
      if (signal?.aborted) return;
      if (action === "discord-oauth-start") {
        window.location.assign(data.url);
        return;
      }
      setConnection(data); setConfirmDisconnect(false);
      setNotice(action === "discord-account-unlink" ? "Discord disconnected." : `Pick reminders ${data.remindersEnabled ? "on" : "off"}.`);
      try { await onConnectionChange?.(); } catch { /* The mutation succeeded; a failed profile refresh must not undo it. */ }
    } catch (failure) {
      if (!signal?.aborted) setError(failure.message);
    } finally {
      requestPending.current = false;
      if (!signal?.aborted) setBusy("");
    }
  };

  return <section className="discord-section" aria-labelledby={titleId} aria-busy={!!busy}>
    <div className="discord-section-heading"><Discord size={18} aria-hidden="true"/><h2 id={titleId}>Discord</h2></div>
    {demo ? <p className="discord-meta">Not available for the demo account.</p> : loadError ? <div className="discord-load-error">
      <p role="alert">{loadError}</p>
      <button className="discord-action" onClick={() => { setLoadError(""); load(); }}><RefreshCw size={15}/>Retry</button>
    </div> : !connection ? <div className="discord-loading" role="status"><RefreshCw size={16} className="discord-spinner"/>Checking connection...</div> : connection.linked ? <>
      <div className="discord-identity">
        <div className="discord-identity-name">
          <strong>{connection.profile?.displayName || "Connected"}</strong>
          {connection.profile && <span className="discord-meta">@{connection.profile.username}</span>}
        </div>
        <span className="discord-connected"><Check size={14} aria-hidden="true"/>{connection.profile ? "Connected" : ""}</span>
      </div>
      <div className="discord-preference">
        <span id={labelId}>Pick reminders</span>
        <button className="discord-switch" role="switch" aria-checked={connection.remindersEnabled} aria-labelledby={labelId} disabled={!!busy}
          onClick={() => mutate("discord-account-preferences", { enabled: !connection.remindersEnabled })}>
          <span className="discord-switch-track"/><span className="discord-switch-thumb"/>
        </button>
      </div>
      {confirmDisconnect ? <div className="discord-disconnect-confirm">
        <p>Disconnect Discord?</p>
        <div className="discord-confirm-actions">
          <button className="discord-action" disabled={!!busy} onClick={() => setConfirmDisconnect(false)}>Cancel</button>
          <button className="discord-action discord-action-danger" disabled={!!busy} onClick={() => mutate("discord-account-unlink")}>
            {busy === "discord-account-unlink" ? <RefreshCw size={15} className="discord-spinner"/> : <LinkOff size={15}/>}Disconnect
          </button>
        </div>
      </div> : <button className="discord-action discord-disconnect" disabled={!!busy} onClick={() => { setConfirmDisconnect(true); setNotice(""); setError(""); }}><LinkOff size={15}/>Disconnect</button>}
    </> : <div className="discord-disconnected">
      <span className="discord-meta">{connection.oauthAvailable ? "Not connected" : "Connection unavailable"}</span>
      {connection.oauthAvailable && <button className="discord-action discord-action-primary" disabled={!!busy} onClick={() => mutate("discord-oauth-start", { returnPath })}>
        {busy ? <RefreshCw size={15} className="discord-spinner"/> : <Link size={15}/>}<span>{busy ? "Connecting..." : "Connect Discord"}</span>
      </button>}
    </div>}
    {error && <p className="discord-feedback discord-error" role="alert">{error}</p>}
    {notice && <div className="discord-feedback" role="status"><span>{notice}</span><button className="discord-notice-close" title="Dismiss message" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14}/></button></div>}
  </section>;
}
