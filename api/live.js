import { getValue } from "./_db.js";
import { normName, parseMatchesToFixtures } from "./_fixtureSync.js";
import { fetchYahooLiveMatches, fixtureGlobalKey, refreshYahooFixtureCache, saveFinishedLiveMatchesToCache } from "./_yahooFixtures.js";
import { setLiveSuccessCacheHeaders } from "./_livePolicy.js";
import { CURRENT_LEAGUE_SEASON } from "../shared/season.js";

const FD_COMP_MAP = { LL: "PD", CL: "CL" };

function fdApiKey(comp) {
  return comp === "LL" ? (process.env.FD_API_KEY_LALIGA || process.env.VITE_FD_API_KEY) : (process.env.VITE_FD_API_KEY || process.env.FD_API_KEY_LALIGA);
}

function knockoutWinnerPatch(f = {}) {
  const patch = {};
  if (f.winningTeamId) patch.winningTeamId = f.winningTeamId;
  if (f.winnerSide) patch.winnerSide = f.winnerSide;
  if (f.homeShootoutScore !== null && f.homeShootoutScore !== undefined) patch.homeShootoutScore = f.homeShootoutScore;
  if (f.awayShootoutScore !== null && f.awayShootoutScore !== undefined) patch.awayShootoutScore = f.awayShootoutScore;
  return patch;
}

function liveMatchesFromFixtures(fixtures = []) {
  return fixtures.map(f => {
    const [homeScore, awayScore] = String(f.liveScore || f.result || "0-0").split("-").map(n => Number.parseInt(n, 10));
    return {
      home: normName(f.home),
      away: normName(f.away),
      homeTeamId: f.homeTeamId || null,
      awayTeamId: f.awayTeamId || null,
      homeScore: Number.isFinite(homeScore) ? homeScore : 0,
      awayScore: Number.isFinite(awayScore) ? awayScore : 0,
      elapsed: f.elapsed || null,
      status: f.status === "FINISHED" ? "finished" : f.status === "PAUSED" ? "halftime" : f.status === "IN_PLAY" ? "in_progress" : f.status === "POSTPONED" ? "postponed" : f.status === "DELAYED" ? "delayed" : "scheduled",
      startTime: f.date || null,
      ...knockoutWinnerPatch(f),
    };
  });
}

async function fetchFootballDataLiveMatches(competition, week, season) {
  const fdComp = FD_COMP_MAP[competition];
  if (!fdComp) {
    const err = new Error(`Football-Data live scores are not configured for ${competition}`);
    err.status = 400;
    throw err;
  }
  const params = new URLSearchParams({ season: String(season), matchday: String(week) });
  const response = await fetch(`https://api.football-data.org/v4/competitions/${fdComp}/matches?${params}`, {
    headers: { "X-Auth-Token": fdApiKey(competition) },
  });
  if (!response.ok) {
    const err = new Error(`Football-Data API error ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  return liveMatchesFromFixtures(parseMatchesToFixtures(data.matches || [], Number(week), competition, season));
}

export default async function handler(req, res) {
  const { week, competition = "PL", season, dates = "" } = req.query;
  if (!week) return res.status(400).json({ error: "week parameter required" });

  const comp = competition === "WC" ? "WC" : competition === "PL" ? "PL" : competition === "LL" ? "LL" : competition === "CL" ? "CL" : null;
  if (!comp) return res.status(400).json({ error: "unsupported competition" });

  try {
    const seas = comp === "WC" ? 2026 : Number(season || CURRENT_LEAGUE_SEASON);
    if (comp === "LL" || comp === "CL") {
      try {
        const matches = await fetchFootballDataLiveMatches(comp, Number(week), seas);
        setLiveSuccessCacheHeaders(res);
        return res.status(200).json({ matches, week: Number.parseInt(week, 10), competition: comp });
      } catch (e) {
        console.error("Live direct Football-Data fallback:", e.message);
      }

      const globalDoc = await getValue(fixtureGlobalKey(comp, seas));
      const fixtures = (globalDoc?.gameweeks || []).find(gw => gw.gw === Number(week))?.fixtures || [];
      setLiveSuccessCacheHeaders(res);
      return res.status(200).json({ matches: liveMatchesFromFixtures(fixtures), week: Number.parseInt(week, 10), competition: comp });
    }

    const dateList = String(dates || "").split(",").map(d => d.trim()).filter(Boolean);
    try {
      const matches = await fetchYahooLiveMatches(comp, Number(week), dateList);
      try {
        await saveFinishedLiveMatchesToCache({ competition: comp, season: seas, targetGW: Number(week), matches });
      } catch (e) {
        console.error("Live final score cache promotion:", e.message);
      }
      setLiveSuccessCacheHeaders(res);
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
    setLiveSuccessCacheHeaders(res);
    return res.status(200).json({ matches: liveMatchesFromFixtures(fixtures), week: Number.parseInt(week, 10), competition: comp });
  } catch (e) {
    console.error("Live cache read error:", e.message);
    return res.status(500).json({ error: "Failed to read live scores" });
  }
}
