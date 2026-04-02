export default async function handler(req, res) {
  const { matchday, season, live, competition } = req.query;
  const comp = competition || "PL";
  let url = live === "true"
    ? `https://api.football-data.org/v4/competitions/PL/matches?status=LIVE`
    : `https://api.football-data.org/v4/competitions/${comp}/matches?season=${season}`;
  if (!live && matchday) url += `&matchday=${matchday}`;

  const response = await fetch(url, {
    headers: { "X-Auth-Token": process.env.VITE_FD_API_KEY }
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: `API error ${response.status}` });
  }

  const data = await response.json();
  res.status(200).json(data);
}
