export const DEMO_GROUP_CODE = 'M65Y4R';
export const DEMO_WC_GROUP_CODE = 'WCDEM0';
export const DEMO_SHARED_USERNAME = 'demo';
export const DEMO_MEMBERS = [
  { username: 'demo', displayName: 'Demo' },
  { username: 'farisdemo', displayName: 'Faris' },
  { username: 'damondemo', displayName: 'Damon' },
  { username: 'valldemo', displayName: 'Vall' },
  { username: 'aamerdemo', displayName: 'Aamer' },
];

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seedStr) {
  let state = hashSeed(seedStr) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function makeDemoPick(username, fixture, gw, season) {
  const rng = seededRng(`${username}|${fixture.id}|${fixture.home}|${fixture.away}|${gw}|${season}`);
  const base = {
    farisdemo: [1.5, 1.1],
    damondemo: [1.8, 1.4],
    valldemo: [1.6, 1.0],
    aamerdemo: [1.9, 1.1],
    demo: [1.4, 1.0],
  }[username] || [1.4, 1.1];
  const isWC = !!fixture.stage;
  const WC_FAV = ['Argentina','Brazil','France','England','Spain','Portugal','Netherlands','Germany','Croatia','Morocco'];
  const homeAdv = isWC ? (WC_FAV.includes(fixture.home) ? 0.4 : 0) : (fixture.home === 'Man City' || fixture.home === 'Liverpool' || fixture.home === 'Arsenal' ? 0.45 : 0);
  const awayAdv = isWC ? (WC_FAV.includes(fixture.away) ? 0.2 : 0) : (fixture.away === 'Man City' || fixture.away === 'Liverpool' || fixture.away === 'Arsenal' ? 0.25 : 0);
  const volatility = {
    farisdemo: 2.6,
    damondemo: 3.0,
    valldemo: 3.8,
    aamerdemo: 3.7,
    demo: 2.8,
  }[username] || 2.8;
  const cap = isWC ? 4 : 5;
  const bh = isWC ? Math.max(0.8, base[0] - 0.3) : base[0];
  const ba = isWC ? Math.max(0.6, base[1] - 0.2) : base[1];
  let h = Math.max(0, Math.min(cap, Math.round(bh + homeAdv - awayAdv * 0.35 + (rng() - 0.5) * volatility)));
  let a = Math.max(0, Math.min(cap, Math.round(ba + awayAdv - homeAdv * 0.2 + (rng() - 0.5) * volatility)));
  if (rng() < 0.24) {
    const d = Math.max(0, Math.min(cap - 1, Math.round((h + a) / 2 + (rng() - 0.5))));
    h = d; a = d;
  }
  if ((username === 'valldemo' || username === 'aamerdemo') && rng() < 0.22) {
    if (rng() < 0.5) h = Math.min(cap, h + 2);
    else a = Math.min(cap, a + 2);
  }
  return `${h}-${a}`;
}
