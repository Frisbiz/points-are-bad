import './loading.css';

export function TrendsSkeleton({ fullPage = false }) {
  return <div className={fullPage ? 'pab-loading-page' : 'pab-trends-loading-section'} role="status" aria-label="Loading Trends">
    {fullPage && <div className="pab-loading-header" aria-hidden="true"><strong>POINTS <small>are bad</small></strong><span className="pab-skeleton sk-avatar"/></div>}
    <div className={fullPage ? 'pab-trends-loading-content pab-trends-loading-full' : 'pab-trends-loading-content'} aria-hidden="true">
      {fullPage && <div className="pab-trends-loading-context"><span className="pab-skeleton"/><span className="pab-skeleton"/></div>}
      <div className="pab-trends-loading-heading"><span className="pab-skeleton"/><span className="pab-skeleton"/></div>
      <div className="pab-trends-loading-players">
        {[0,1,2,3,4].map(i => <div className="pab-trends-loading-player" key={i}>
          <div className="pab-trends-loading-name"><span className="pab-skeleton"/><span className="pab-skeleton"/></div>
          <div className="pab-trends-loading-stats">{[0,1,2].map(stat => <div key={stat}><span className="pab-skeleton"/><span className="pab-skeleton"/></div>)}</div>
        </div>)}
      </div>
      <span className="pab-skeleton pab-trends-loading-section-title"/>
      {[0,1].map(i => <div className="pab-trends-loading-chart" key={i}>
        <span className="pab-skeleton pab-trends-loading-chart-title"/>
        <span className="pab-skeleton pab-trends-loading-chart-subtitle"/>
        <div className="pab-trends-loading-plot"><span/><span/><span/><span/></div>
      </div>)}
    </div>
  </div>;
}

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
