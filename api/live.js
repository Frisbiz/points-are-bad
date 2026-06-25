import { getValue } from "./_db.js";
import { normName } from "./_fixtureSync.js";
import { fetchYahooLiveMatches, fixtureGlobalKey, refreshYahooFixtureCache } from "./_yahooFixtures.js";

function liveMatchesFromFixtures(fixtures = []) {
  return fixtures.map(f => {
    const [homeScore, awayScore] = String(f.liveScore || f.result || "0-0").split("-").map(n => Number.parseInt(n, 10));
    return {
      home: normName(f.home),
      away: normName(f.away),
      homeScore: Number.isFinite(homeScore) ? homeScore : 0,
      awayScore: Number.isFinite(awayScore) ? awayScore : 0,
      elapsed: f.elapsed || null,
      status: f.status === "FINISHED" ? "finished" : f.status === "PAUSED" ? "halftime" : f.status === "IN_PLAY" ? "in_progress" : f.status === "POSTPONED" ? "postponed" : "scheduled",
      startTime: f.date || null,
    };
  });
}

export default async function handler(req, res) {
  const { week, competition = "PL", season, dates = "" } = req.query;
  if (!week) return res.status(400).json({ error: "week parameter required" });

  const comp = competition === "WC" ? "WC" : competition === "PL" ? "PL" : null;
  if (!comp) {
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).json({ matches: [], week: Number.parseInt(week, 10), competition });
  }

  try {
    const seas = comp === "WC" ? 2026 : Number(season || 2025);
    const dateList = String(dates || "").split(",").map(d => d.trim()).filter(Boolean);
    try {
      const matches = await fetchYahooLiveMatches(comp, Number(week), dateList);
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.status(200).json({ matches, week: Number.parseInt(week, 10), competition: comp });
    } catch (e) {
      console.error("Live direct Yahoo fallback:", e.message);
    }

    let globalDoc = null;
    try {
      const syncInfo = await refreshYahooFixtureCache({ competition: comp, season: seas, targetGW: Number(week) });
      globalDoc = syncInfo.globalDoc;
    } catch (e) {
      console.error("Live refresh fallback:", e.message);
      globalDoc = await getValue(fixtureGlobalKey(comp, seas));
    }
    const fixtures = (globalDoc?.gameweeks || []).find(gw => gw.gw === Number(week))?.fixtures || [];
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({ matches: liveMatchesFromFixtures(fixtures), week: Number.parseInt(week, 10), competition: comp });
  } catch (e) {
    console.error("Live cache read error:", e.message);
    return res.status(500).json({ error: "Failed to read live scores" });
  }
}
