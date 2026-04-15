const FD_COMP_MAP = { PL: "PL", LL: "PD", WC: "WC" };

function fdApiKey(comp) {
  return comp === "LL" ? process.env.FD_API_KEY_LALIGA : process.env.VITE_FD_API_KEY;
}

export default async function handler(req, res) {
  const { matchday, season, live, competition } = req.query;
  const comp = competition || "PL";
  const fdComp = FD_COMP_MAP[comp] || comp;
  const apiKey = fdApiKey(comp);
  let url = live === "true"
    ? `https://api.football-data.org/v4/competitions/${fdComp}/matches?status=LIVE`
    : `https://api.football-data.org/v4/competitions/${fdComp}/matches?season=${season}`;
  if (!live && matchday) url += `&matchday=${matchday}`;

  const response = await fetch(url, {
    headers: { "X-Auth-Token": apiKey }
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: `API error ${response.status}` });
  }

  const data = await response.json();
  res.status(200).json(data);
}
