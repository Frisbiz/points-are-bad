import './loading.css';

export default function LoadingSkeleton({ fullPage = false, label = 'Loading your groups' }) {
  return <div className={fullPage ? 'pab-loading-page' : 'pab-loading-section'} role="status" aria-label={label}>
    {fullPage && <div className="pab-loading-header" aria-hidden="true"><strong>POINTS <small>are bad</small></strong><span className="pab-skeleton sk-avatar"/></div>}
    <div className="pab-loading-content" aria-hidden="true">
      <span className="pab-skeleton sk-title"/>
      <span className="pab-skeleton sk-subtitle"/>
      <div className="pab-skeleton sk-summary"/>
      {[0,1,2].map(i=><div className="pab-loading-row" key={i}>
        <div><span className="pab-skeleton sk-name"/><span className="pab-skeleton sk-meta"/><span className="pab-skeleton sk-team"/><span className="pab-skeleton sk-team"/></div>
        <div className="pab-loading-progress"><span className="pab-skeleton sk-meta"/><span className="pab-skeleton sk-track"/></div>
        <span className="pab-skeleton sk-action"/>
      </div>)}
    </div>
  </div>;
}
