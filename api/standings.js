import { normName } from './_fixtureSync.js';

export default async function handler(req, res) {
  try {
    const response = await fetch(
      'https://api.football-data.org/v4/competitions/PL/standings',
      { headers: { 'X-Auth-Token': process.env.VITE_FD_API_KEY } }
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: `API error ${response.status}` });
    }
    const data = await response.json();
    const total = data.standings?.find(s => s.type === 'TOTAL');
    if (!total) return res.status(200).json({ table: [] });

    const table = total.table.map(row => ({
      pos: row.position,
      team: normName(row.team?.name || row.team?.shortName),
      crest: row.team?.crest || null,
      p: row.playedGames,
      w: row.won,
      d: row.draw,
      l: row.lost,
      gf: row.goalsFor,
      ga: row.goalsAgainst,
      gd: row.goalDifference,
      pts: row.points,
      form: row.form || null,
    }));

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json({ table });
  } catch (e) {
    console.error('Standings error:', e.message);
    return res.status(500).json({ error: 'Failed to fetch standings' });
  }
}
