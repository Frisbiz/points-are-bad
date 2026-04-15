// Yahoo Sports API proxy for live Premier League scores
// Uses Yahoo's first_name which matches our display names directly

// Fallback map: Yahoo display_name -> our display name (when first_name is missing)
const YAHOO_DISPLAY_MAP = {
  "Wolverhampton Wanderers": "Wolves",
  "Tottenham Hotspur": "Spurs",
  "Manchester United": "Man Utd",
  "Manchester City": "Man City",
  "Newcastle United": "Newcastle",
  "Nottingham Forest": "Nott'm Forest",
  "Brighton and Hove Albion": "Brighton",
  "West Ham United": "West Ham",
  "Leeds United": "Leeds",
  "Ipswich Town": "Ipswich",
  "Leicester City": "Leicester",
  "AFC Bournemouth": "Bournemouth",
  "Sheffield United": "Sheffield Utd",
  "Burnley": "Burnley",
  "Sunderland": "Sunderland",
};

function resolveTeamName(team) {
  if (team.first_name) return team.first_name;
  return YAHOO_DISPLAY_MAP[team.display_name] || team.display_name || "Unknown";
}

function parseStatus(game) {
  const st = game.status_type || "";
  if (st.includes("final")) return "finished";
  if (st.includes("postponed") || st.includes("cancelled")) return "postponed";
  if (String(game.is_halftime) === "true") return "halftime";
  if (st.includes("in_progress") || st.includes("mid_event")) return "in_progress";
  if (st.includes("pre_game") || st.includes("not_started")) return "scheduled";
  // Fallback: check status_display_name
  const disp = (game.status_display_name || "").toLowerCase();
  if (disp.includes("finish") || disp.includes("final")) return "finished";
  if (disp.includes("progress") || disp.includes("live")) return "in_progress";
  if (disp.includes("half")) return "halftime";
  if (disp.includes("postpone")) return "postponed";
  return "scheduled";
}

export default async function handler(req, res) {
  const { week } = req.query;
  if (!week) return res.status(400).json({ error: "week parameter required" });

  const url = `https://api-secure.sports.yahoo.com/v1/editorial/s/scoreboard`
    + `?lang=en-US&ysp_redesign=1&ysp_platform=desktop`
    + `&leagues=soccer.l.fbgb&week=${encodeURIComponent(week)}`
    + `&v=2&ysp_enable_last_update=1`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo API error ${response.status}` });
    }

    const data = await response.json();
    const scoreboard = data?.service?.scoreboard;
    if (!scoreboard) {
      return res.status(200).json({ matches: [], week: parseInt(week, 10) });
    }

    // Build team lookup
    const teams = {};
    for (const [id, team] of Object.entries(scoreboard.teams || {})) {
      teams[id] = resolveTeamName(team);
    }

    // Parse games
    const matches = Object.values(scoreboard.games || {}).map(game => {
      const home = teams[game.home_team_id] || "Unknown";
      const away = teams[game.away_team_id] || "Unknown";
      const status = parseStatus(game);
      const homeScore = parseInt(game.total_home_points || "0", 10);
      const awayScore = parseInt(game.total_away_points || "0", 10);

      return {
        home,
        away,
        homeScore: isNaN(homeScore) ? 0 : homeScore,
        awayScore: isNaN(awayScore) ? 0 : awayScore,
        elapsed: game.game_time_elapsed_display || null,
        status,
        startTime: game.start_time || null,
      };
    });

    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    return res.status(200).json({ matches, week: parseInt(week, 10) });
  } catch (e) {
    console.error("Yahoo live scores error:", e.message);
    return res.status(500).json({ error: "Failed to fetch live scores" });
  }
}
