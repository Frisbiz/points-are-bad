const YAHOO_WC_LEAGUE = "soccer.l.fbwcup";
const YAHOO_TEAMS_URL = `https://api-secure.sports.yahoo.com/v1/editorial/league/${YAHOO_WC_LEAGUE}/teams`;

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function textOf(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function blocksOf(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"))].map(m => m[0]);
}

function num(value, fallback = 0) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function pickLogo(teamXml) {
  const images = blocksOf(teamXml, "image").map(block => ({
    type: textOf(block, "type"),
    url: textOf(block, "url"),
  }));
  return (
    images.find(img => img.type === "image.type.team_logo_cropped")?.url ||
    images.find(img => img.type === "image.type.team_logo_medium")?.url ||
    images.find(img => img.type === "image.type.team_logo_origin")?.url ||
    images.find(img => img.url)?.url ||
    null
  );
}

function parseYahooWorldCupStandings(xml) {
  const teams = blocksOf(xml, "team")
    .map(teamXml => {
      const standing = blocksOf(teamXml, "team_standing")[0] || "";
      if (!standing) return null;
      const record = blocksOf(standing, "team_record")[0] || "";
      const gf = num(textOf(standing, "points_for"));
      const ga = num(textOf(standing, "points_against"));
      return {
        pos: num(textOf(standing, "group_position")),
        groupSequence: num(textOf(standing, "group_sequence"), 999),
        teamId: textOf(teamXml, "team_id"),
        team: textOf(teamXml, "display_name") || textOf(teamXml, "full_name") || textOf(teamXml, "first_name"),
        abbr: textOf(teamXml, "abbr"),
        crest: pickLogo(teamXml),
        group: textOf(standing, "group_name") || textOf(teamXml, "division_display_name") || textOf(teamXml, "division"),
        p: num(textOf(record, "played")),
        w: num(textOf(record, "wins")),
        d: num(textOf(record, "ties")),
        l: num(textOf(record, "losses")),
        gf,
        ga,
        gd: gf - ga,
        pts: num(textOf(standing, "points")),
        live: textOf(standing, "live_status") === "true",
        record: textOf(record, "display"),
      };
    })
    .filter(row => row && row.team && row.group);

  const grouped = new Map();
  for (const row of teams) {
    if (!grouped.has(row.group)) grouped.set(row.group, []);
    grouped.get(row.group).push(row);
  }

  const groups = [...grouped.entries()]
    .map(([name, rows]) => ({
      name,
      rows: rows.sort((a, b) =>
        a.groupSequence - b.groupSequence ||
        a.pos - b.pos ||
        b.pts - a.pts ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        a.team.localeCompare(b.team)
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return groups;
}

export default async function handler(req, res) {
  try {
    const response = await fetch(YAHOO_TEAMS_URL, {
      headers: {
        "User-Agent": "PointsAreBad/1.0",
        "Accept": "application/xml,text/xml,*/*",
      },
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo API error ${response.status}` });
    }

    const xml = await response.text();
    const groups = parseYahooWorldCupStandings(xml);
    if (!groups.length) return res.status(502).json({ error: "Yahoo standings payload did not include groups" });

    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
    return res.status(200).json({
      source: "Yahoo Sports",
      league: YAHOO_WC_LEAGUE,
      updatedAt: Date.now(),
      groups,
    });
  } catch (e) {
    console.error("Yahoo World Cup standings error:", e.message);
    return res.status(500).json({ error: "Failed to fetch World Cup standings" });
  }
}

export { parseYahooWorldCupStandings };
