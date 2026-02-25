export default async function handler(req, res) {
  const { matchday, season } = req.query;
  let url = `https://api.football-data.org/v4/competitions/PL/matches?season=${season}`;
  if (matchday) url += `&matchday=${matchday}`;

  const response = await fetch(url, {
    headers: { "X-Auth-Token": process.env.VITE_FD_API_KEY }
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: `API error ${response.status}` });
  }

  const data = await response.json();
  res.status(200).json(data);
}
