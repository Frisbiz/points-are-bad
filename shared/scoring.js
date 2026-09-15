export const MISSED_PICK_PTS = 4;

export function calcPts(prediction, result) {
  if (!prediction || !result) return null;
  const [predictedHome, predictedAway] = prediction.split("-").map(Number);
  const [resultHome, resultAway] = result.split("-").map(Number);
  if ([predictedHome, predictedAway, resultHome, resultAway].some(value => !Number.isFinite(value))) return null;
  return Math.abs(predictedHome - resultHome) + Math.abs(predictedAway - resultAway);
}

// Find each member's first-ever gameweek where they made a prediction.
export function computeFirstPickGW(group) {
  const predictions = group?.predictions || {};
  const activeSeason = group?.season || 2025;
  const gameweeks = [...(group?.gameweeks || [])].sort((a, b) =>
    ((a.season || activeSeason) - (b.season || activeSeason)) || (a.gw - b.gw)
  );
  const firstPicks = {};

  for (const username of group?.members || []) {
    for (const gameweek of gameweeks) {
      if ((gameweek.fixtures || []).some(fixture => predictions[username]?.[fixture.id])) {
        firstPicks[username] = { gw: gameweek.gw, season: gameweek.season || activeSeason };
        break;
      }
    }
  }

  return firstPicks;
}

export function isPreJoinGW(firstPicks, username, gameweek, activeSeason) {
  const firstPick = firstPicks[username];
  if (!firstPick) return true;
  const gameweekSeason = gameweek.season || activeSeason;
  return gameweekSeason < firstPick.season
    || (gameweekSeason === firstPick.season && gameweek.gw < firstPick.gw);
}

export function computeGroupStats(group) {
  const predictions = group?.predictions || {};
  const members = group?.members || [];
  const activeSeason = group?.season || 2025;
  const scope = group?.scoreScope || "all";
  const filteredGameweeks = (group?.gameweeks || []).filter(gameweek =>
    scope === "all" || (gameweek.season || activeSeason) === activeSeason
  );
  const sortedGameweeks = [...filteredGameweeks].sort((a, b) =>
    ((a.season || activeSeason) - (b.season || activeSeason)) || (a.gw - b.gw)
  );
  const firstPicks = computeFirstPickGW(group);
  const gameweekKey = gameweek => `${gameweek.gw}-${gameweek.season || activeSeason}`;

  const realGameweekPoints = {};
  const ownTotals = {};
  members.forEach(username => {
    realGameweekPoints[username] = {};
    let ownTotal = 0;
    let ownScored = 0;
    let perfects = 0;
    let close = 0;
    let bad = 0;
    let missed = 0;

    sortedGameweeks.forEach(gameweek => {
      if (isPreJoinGW(firstPicks, username, gameweek, activeSeason)) {
        realGameweekPoints[username][gameweekKey(gameweek)] = null;
        return;
      }

      let gameweekPoints = 0;
      (gameweek.fixtures || []).forEach(fixture => {
        if (!fixture.result) return;
        const points = calcPts(predictions[username]?.[fixture.id], fixture.result);
        if (points !== null) {
          ownTotal += points;
          ownScored += 1;
          gameweekPoints += points;
          if (points === 0) perfects += 1;
          else if (points <= 2) close += 1;
          else bad += 1;
        } else {
          ownTotal += MISSED_PICK_PTS;
          ownScored += 1;
          gameweekPoints += MISSED_PICK_PTS;
          missed += 1;
        }
      });
      realGameweekPoints[username][gameweekKey(gameweek)] = gameweekPoints;
    });

    ownTotals[username] = { ownTotal, ownScored, perfects, close, bad, missed };
  });

  // New members begin level with the worst active player's cumulative score.
  const bonuses = {};
  const membersByJoin = [...members].sort((a, b) => {
    const firstA = firstPicks[a];
    const firstB = firstPicks[b];
    if (!firstA && !firstB) return 0;
    if (!firstA) return 1;
    if (!firstB) return -1;
    return (firstA.season - firstB.season) || (firstA.gw - firstB.gw);
  });

  membersByJoin.forEach(username => {
    const firstPick = firstPicks[username];
    if (!firstPick) {
      bonuses[username] = null;
      return;
    }
    const joinIndex = sortedGameweeks.findIndex(gameweek =>
      (gameweek.season || activeSeason) === firstPick.season && gameweek.gw === firstPick.gw
    );
    if (joinIndex <= 0) {
      bonuses[username] = 0;
      return;
    }

    let worst = -1;
    members.forEach(other => {
      if (other === username) return;
      const otherFirstPick = firstPicks[other];
      if (!otherFirstPick) return;
      if (otherFirstPick.season > firstPick.season
        || (otherFirstPick.season === firstPick.season && otherFirstPick.gw >= firstPick.gw)) return;

      let total = bonuses[other] || 0;
      for (let index = 0; index < joinIndex; index += 1) {
        const points = realGameweekPoints[other][gameweekKey(sortedGameweeks[index])];
        if (points !== null) total += points;
      }
      if (total > worst) worst = total;
    });
    bonuses[username] = worst >= 0 ? worst : 0;
  });

  const activeTotals = members
    .filter(username => firstPicks[username])
    .map(username => (bonuses[username] || 0) + ownTotals[username].ownTotal);
  const worstActive = activeTotals.length > 0 ? Math.max(...activeTotals) : 0;
  members.forEach(username => {
    if (bonuses[username] === null) bonuses[username] = worstActive;
  });

  const standings = members.map(username => {
    const own = ownTotals[username];
    const startingBonus = bonuses[username] || 0;
    return {
      username,
      total: startingBonus + own.ownTotal,
      scored: own.ownScored,
      perfects: own.perfects,
      close: own.close,
      bad: own.bad,
      missed: own.missed,
      avg: own.ownScored > 0 ? (own.ownTotal / own.ownScored).toFixed(2) : "–",
      gwTotals: sortedGameweeks.map(gameweek => ({
        gw: gameweek.gw,
        season: gameweek.season || activeSeason,
        points: realGameweekPoints[username][gameweekKey(gameweek)],
      })),
      neverPicked: !firstPicks[username],
      startingBonus,
    };
  });

  const compareRank = (a, b) => {
    if (a.neverPicked !== b.neverPicked) return a.neverPicked ? 1 : -1;
    return (a.total - b.total) || (b.perfects - a.perfects) || (a.missed - b.missed);
  };
  standings.sort(compareRank);

  let previous = null;
  let rank = 0;
  return standings.map((player, index) => {
    if (!previous || compareRank(previous, player) !== 0) rank = index + 1;
    previous = player;
    return { ...player, rank };
  });
}

export function buildPointsBreakdownRows(stats, displayNames = {}) {
  return (stats || []).map(player => ({
    name: player.dn || displayNames[player.username] || player.username,
    Perfect: player.perfects || 0,
    Close: player.close || 0,
    Bad: player.bad || 0,
    Missed: player.missed || 0,
  }));
}
