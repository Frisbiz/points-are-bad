import { useState } from 'react';
import './landing.css';

const competitions = [
  ['PL', 'Premier League', 'All 38 gameweeks.'],
  ['LL', 'La Liga', 'Every round of the season.'],
  ['CL', 'Champions League', 'From the league phase to the final.'],
  ['WC', 'World Cup', 'Every stage of the tournament.'],
];

const competitionLogos = {
  PL: '/marks/premier-league.png',
  LL: '/marks/la-liga.png',
  CL: '/marks/champions-league.png',
  WC: '/marks/world-cup.png',
};

function CompetitionLogo({ id }) {
  return <img className="competition-logo" src={competitionLogos[id]} alt="" width="40" height="40" decoding="async" />;
}

function Brand({ onTap }) {
  return <span className="pab-brand"><span>POINTS</span><button onClick={onTap} aria-label="Points are bad">are bad<span aria-hidden="true">↘</span></button></span>;
}

function ScoreExample() {
  const [home, setHome] = useState(2);
  const [away, setAway] = useState(1);
  const points = Math.abs(home - 3) + Math.abs(away - 1);
  return <div className="score-sheet">
    <div className="sheet-top"><span className="sheet-number"><CompetitionLogo id="PL"/>Premier League</span><span className="example-tag">Interactive example</span></div>
    <div className="sheet-heading"><span className="sheet-caption">The North London derby</span><h2>See how scoring works</h2><p>Set your prediction, then compare it with the final score.</p></div>
    <div className="score-columns"><span>Fixture</span><span>Your pick</span><span>Final</span></div>
    {[['Arsenal', '/marks/arsenal.png', home, setHome, 3], ['Tottenham', '/marks/tottenham.png', away, setAway, 1]].map(([name, crest, value, setter, result]) => <div className="score-team" key={name}>
      <span className="score-team-name"><img className="landing-team-crest" src={crest} alt="" width="28" height="32" decoding="async" />{name}</span>
      <div className="score-stepper"><button aria-label={`Decrease ${name} prediction`} disabled={value === 0} onClick={() => setter(value - 1)}>−</button><output aria-label={`${name} prediction`}>{value}</output><button aria-label={`Increase ${name} prediction`} disabled={value === 9} onClick={() => setter(value + 1)}>+</button></div>
      <strong className="final-score">{result}</strong>
    </div>)}
    <div className={`score-receipt ${points === 0 ? 'is-perfect' : ''}`}><div><span>{points === 0 ? 'Exact score. Zero points.' : points === 1 ? 'One goal off. One point.' : `${points} goals off. ${points} points.`}</span><p>Difference from the final score</p></div><output className="damage" aria-live="polite" aria-atomic="true">{points}<span>{points === 1 ? 'point' : 'points'}</span></output></div>
    <div className="sheet-bottom"><span>{Math.abs(home - 3)} home + {Math.abs(away - 1)} away goals off</span><strong>Lower is better.</strong></div>
  </div>;
}

function LeagueExample() {
  return <div className="league-example">
    <div className="league-example-title"><div><span className="sheet-caption">Example group</span><h3>Everyone predicts the same matches.</h3></div><span className="example-tag">Example standings</span></div>
    <div className="league-example-labels"><span>Position / player</span><span>Points ↓</span></div>
    {[['01', 'You', 'Y', 12], ['02', 'Faris', 'F', 18], ['03', 'Aamer', 'A', 24]].map(([rank, name, initial, points], i) => <div className={`league-example-row ${i === 0 ? 'is-you' : ''}`} key={rank}><span className="league-position">{rank}</span><span className="player-initial">{initial}</span><span>{name}</span><strong>{points}</strong></div>)}
    <p>Lowest total leads the group.</p>
  </div>;
}

export default function LandingPage({ onContinue, onDemo, onAreBadTap, onOpenWhatsNew, signedIn = false }) {
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');
  async function openDemo() {
    if (demoLoading) return;
    setDemoLoading(true);
    setDemoError('');
    try { await (onDemo || onContinue)(); }
    catch { setDemoError('The demo could not load. Please try again.'); }
    finally { setDemoLoading(false); }
  }
  return <div className="pab-landing">
    <a className="pab-skip" href="#main-content">Skip to content</a>
    <header className="pab-header"><a href="#main-content" className="brand-home" aria-label="Points Are Bad home"><span className="pab-wordmark">POINTS<span>are bad</span></span></a><nav aria-label="Main navigation"><a href="#the-game">How it works</a><a href="#competitions">Competitions</a><button onClick={onOpenWhatsNew}>What's new</button></nav><button className="pab-button pab-button-small" onClick={onContinue}>{signedIn ? 'Your groups' : 'Sign in / join'}</button></header>
    <main id="main-content">
      <section className="pab-hero">
        <div className="hero-copy"><p className="hero-intro">Football predictions with friends</p><h1>Predict the score.<br/>Lowest points wins.</h1><p className="hero-description">Pick each score before kickoff. Every goal you’re off adds one point.<br className="desktop-break"/> The lowest total in your group wins.</p><div className="pab-actions"><button className="pab-button" onClick={onContinue}>{signedIn ? 'Open your groups' : 'Create a group'} <span aria-hidden="true">↗</span></button>{!signedIn&&<button className="pab-text-button" disabled={demoLoading} onClick={openDemo}>{demoLoading ? 'Opening demo…' : 'Explore the demo'} <span aria-hidden="true">→</span></button>}</div><p className="hero-footnote">Free to play. Private groups.</p>{demoError && <p role="alert" className="demo-error">{demoError}</p>}</div>
        <div className="hero-example"><ScoreExample/><p className="example-footnote">Example fixture. Not a live result.</p></div>
      </section>
      <section className="competition-strip" aria-label="Supported competitions"><span>Choose a competition</span>{competitions.map(([id, name]) => <a href="#competitions" key={id}><CompetitionLogo id={id}/><span>{name}</span></a>)}</section>
      <section id="the-game" className="pab-game-section">
        <div className="section-heading">
          <p className="section-kicker">How it works</p>
          <h2>Pick scores. Get points for being wrong.</h2>
          <p>Everyone predicts the same fixtures. Points measure how far each prediction was from the result.</p>
          <div className="pab-steps">{[
            ['01', 'Create a group', 'Choose a competition and send the invite code to your friends.'],
            ['02', 'Make your picks', 'Predict each score before the match starts.'],
            ['03', 'Keep your total low', 'Every goal you’re off adds one point. The lowest total wins.'],
          ].map(([n, title, body]) => <div className="pab-step" key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div>
        </div>
        <div className="standings-preview"><LeagueExample/><div className="standings-note"><strong>The closer your predictions, the lower your total.</strong></div></div>
      </section>
      <section id="competitions" className="pab-competitions"><div className="competition-heading"><div><p className="section-kicker">Choose a competition</p><h2>Play across the biggest competitions.</h2></div><p>Create a separate group for each competition.</p></div><div className="competition-list">{competitions.map(([id, name, description]) => <button onClick={onContinue} key={id}><CompetitionLogo id={id}/><span><strong>{name}</strong><small>{description}</small></span><span aria-hidden="true">↗</span></button>)}</div></section>
      <section className="pab-final"><div><p>Ready to make your picks?</p><h2>{signedIn ? 'Open your groups.' : 'Start a prediction group.'}</h2></div><div><button className="pab-button" onClick={onContinue}>{signedIn ? 'Open your groups' : 'Create a group'} <span aria-hidden="true">↗</span></button><span className="final-note">Free to play with your friends.</span></div></section>
    </main>
    <footer className="pab-footer"><Brand onTap={onAreBadTap}/><p>Football score predictions with friends.</p><button onClick={onOpenWhatsNew}>What's new</button><a href="#main-content">Back to top ↑</a></footer>
  </div>;
}
