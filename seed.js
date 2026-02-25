// ─── POINTS ARE BAD — REAL DATA SEED SCRIPT ──────────────────────────────
// Paste this entire script into the browser console while on the live app.
//
// Accounts created (all passwords: password123):
//   vall, damon, faris, ismaeil, husain, jeremy, aamer
//
// Group: "Yuh Prem League Pick'ems"  |  Invite code: 7777
// GW11–27 fully seeded with real scores + predictions. GW28 is current (no results yet).
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  const { getApps } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js");
  const { getFirestore, doc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");

  const apps = getApps();
  if (!apps.length) {
    console.error("❌ Firebase not found. Make sure you're on the live Points Are Bad app first.");
    return;
  }
  const db = getFirestore(apps[0]);
  async function sset(key, val) {
    const ref = doc(db, "data", key.replace(/[/\\]/g, "_"));
    await setDoc(ref, { value: val, updatedAt: Date.now() });
    console.log("✓", key);
  }

  // ── TEAM NAME MAP ────────────────────────────────────────────────────────────
  const T = {
    ARS:"Arsenal", AVL:"Aston Villa", BOU:"Bournemouth", BRE:"Brentford",
    BHA:"Brighton", BUR:"Burnley",    CHE:"Chelsea",     CRY:"Crystal Palace",
    EVE:"Everton", FUL:"Fulham",      LEE:"Leeds",       LIV:"Liverpool",
    MCI:"Man City",MUN:"Man Utd",     NEW:"Newcastle",   NFO:"Nott'm Forest",
    SUN:"Southampton", TOT:"Spurs",   WHU:"West Ham",    WOL:"Wolves",
  };
  function fix(abbr) {
    // strip zero-width spaces, parse "HOME @ AWAY"
    const clean = abbr.replace(/\u200b/g, "").trim();
    const [h, a] = clean.split(" @ ");
    return { home: T[h] || h, away: T[a] || a };
  }

  // ── CONFIG ───────────────────────────────────────────────────────────────────
  const DISPLAY = ["Vall","Damon","Faris","Ismaeil","Husain","Jeremy","Aamer"];
  const PLAYERS = DISPLAY.map(n => n.toLowerCase());
  const GROUP_ID   = "1732000000000";
  const GROUP_CODE = "7777";
  const GROUP_NAME = "Yuh Prem League Pick'ems";
  const PASSWORD   = "password123";

  // ── RAW DATA FROM SPREADSHEET ────────────────────────────────────────────────
  // Format: { matches, results, predictions }
  // results: null = not played yet
  // predictions: null = not submitted
  const RAW = {
    11: {
      matches: ["MUN @ TOT","EVE @ FUL","WHU @ BUR","SUN @ ARS","CHE @ WOL","BOU @ AVL","NEW @ BRE","BHA @ CRY","LEE @ NFO","LIV @ MCI"],
      results: ["2-2","2-0","3-2","2-2","3-0","0-4","1-3","0-0","1-3","0-3"],
      predictions: {
        Vall:    ["3-1","1-1","2-1","1-1","1-0","3-1","2-1","1-3","1-2","2-3"],
        Damon:   ["1-2","1-0","1-2","1-3","3-1","2-1","1-2","1-1","0-1","2-2"],
        Faris:   ["2-1","0-1","1-0","1-2","2-0","1-2","2-2","1-2","1-1","1-1"],
        Ismaeil: ["3-2","0-0","2-2","0-3","2-1","1-3","1-3","3-3","1-0","0-0"],
        Husain:  ["1-0","2-2","0-0","0-2","3-0","1-1","1-1","0-2","0-0","1-2"],
        Jeremy:  ["1-1","2-1","2-0","3-2","1-1","0-2","0-4","2-2","3-0","0-3"],
        Aamer:   ["2-2","2-0","3-2","0-1","4-0","3-2","2-0","0-1","0-2","1-3"],
      }
    },
    12: {
      matches: ["CHE @ BUR","NFO @ LIV","WHU @ BOU","CRY @ WOL","BRE @ BHA","SUN @ FUL","MCI @ NEW","AVL @ LEE","TOT @ ARS","EVE @ MUN"],
      results: ["2-0","3-0","2-2","2-0","1-2","0-1","1-2","2-1","1-4","1-0"],
      predictions: {
        Vall:    ["2-0","0-2","0-1","0-0","0-1","0-0","2-1","3-0","2-1","0-1"],
        Damon:   ["4-0","1-3","0-2","2-1","2-2","2-1","2-0","1-2","0-1","1-1"],
        Faris:   ["3-0","1-2","2-2","1-0","2-1","1-1","3-2","1-1","2-2","2-2"],
        Ismaeil: ["2-2","0-1","1-2","3-1","1-2","2-2","2-2","2-2","1-3","1-2"],
        Husain:  ["3-1","0-3","2-1","3-0","1-1","2-0","4-0","2-0","1-2","2-1"],
        Jeremy:  ["1-1","2-2","1-1","2-0","1-0","1-2","1-1","1-0","1-1","1-3"],
        Aamer:   ["4-1","2-3","0-3","4-1","2-0","1-0","3-0","3-1","2-0","0-3"],
      }
    },
    13: {
      matches: ["BUR @ BRE","BOU @ SUN","LEE @ MCI","NEW @ EVE","FUL @ TOT","MUN @ CRY","LIV @ WHU","WOL @ AVL","BHA @ NFO","ARS @ CHE"],
      results: ["1-3","2-3","2-3","4-1","2-1","2-1","2-0","0-1","2-0","1-1"],
      predictions: {
        Vall:    ["1-3","0-1","0-2","3-3","0-3","3-1","0-3","0-1","2-1","1-2"],
        Damon:   ["0-1","2-2","1-3","0-1","1-1","2-0","2-0","1-2","1-1","1-0"],
        Faris:   ["0-3","3-1","0-4","2-1","1-2","1-1","2-1","1-1","3-1","3-1"],
        Ismaeil: ["1-1","1-1","0-1","2-2","0-1","0-1","1-2","0-2","1-0","3-2"],
        Husain:  ["1-2","1-2","2-3","1-2","2-2","2-1","1-1","1-3","1-2","2-2"],
        Jeremy:  ["2-2","0-2","1-2","1-1","0-2","1-2","2-2","2-3","2-2","1-1"],
        Aamer:   ["0-2","2-3","1-4","3-0","2-3","2-2","3-1","0-3","2-0","5-0"],
      }
    },
    14: {
      matches: ["MCI @ FUL","EVE @ BOU","TOT @ NEW","AVL @ BHA","CRY @ BUR","NFO @ WOL","BRE @ ARS","CHE @ LEE","SUN @ LIV","WHU @ MUN"],
      results: ["5-4","1-0","2-2","4-3","1-0","1-0","0-2","1-3","1-1","1-1"],
      predictions: {
        Vall:    ["2-0","1-2","1-3","2-2","2-2","1-0","1-3","3-0","3-2","0-2"],
        Damon:   ["2-2","0-1","1-1","1-2","3-1","2-1","0-1","2-0","1-2","2-2"],
        Faris:   ["3-0","2-1","2-2","2-1","1-0","1-2","1-1","1-1","0-2","2-1"],
        Ismaeil: ["2-1","0-2","0-3","0-2","1-1","3-1","0-2","2-1","2-2","1-2"],
        Husain:  ["3-1","2-2","1-2","3-1","2-1","1-1","1-2","2-2","2-0","0-1"],
        Jeremy:  ["0-3","1-1","2-1","3-2","0-0","2-2","0-3","3-1","0-4","1-1"],
        Aamer:   ["3-2","2-3","2-3","2-0","2-0","2-0","2-3","4-1","1-3","2-3"],
      }
    },
    15: {
      matches: ["ARS @ AVL","NFO @ EVE","BUR @ NEW","SUN @ MCI","BRE @ TOT","CHE @ BOU","LIV @ LEE","WHU @ BHA","CRY @ FUL","MUN @ WOL"],
      results: ["1-2","0-3","1-2","0-3","0-2","0-0","3-3","1-1","2-1","4-1"],
      predictions: {
        Vall:    ["3-1","1-2","2-4","2-3","3-1","3-1","1-2","1-3","2-2","2-1"],
        Damon:   ["1-1","2-2","0-2","1-2","0-2","1-0","1-0","1-1","2-0","2-2"],
        Faris:   ["3-2","0-3","0-1","0-2","2-2","2-0","2-1","1-2","1-0","3-0"],
        Ismaeil: ["2-1","2-1","1-2","1-3","1-2","2-2","2-2","2-3","1-1","2-0"],
        Husain:  ["2-0","1-1","2-3","0-3","2-1","2-1","1-3","0-3","1-2","0-0"],
        Jeremy:  ["1-2","0-1","0-3","0-4","2-0","1-1","3-2","2-2","3-1","1-2"],
        Aamer:   ["2-2","0-2","1-3","1-4","2-3","3-0","2-0","0-2","2-1","1-0"],
      }
    },
    16: {
      matches: ["EVE @ CHE","BHA @ LIV","FUL @ BUR","WOL @ ARS","MCI @ CRY","NEW @ SUN","TOT @ NFO","AVL @ WHU","LEE @ BRE","BOU @ MUN"],
      results: ["0-2","0-2","3-2","1-2","3-0","0-1","0-3","3-2","1-1","4-4"],
      predictions: {
        Vall:    ["1-2","2-3","2-2","0-1","3-1","2-2","2-0","3-1","1-4","0-3"],
        Damon:   ["1-0","2-0","1-2","0-2","2-2","1-2","3-0","1-1","2-2","2-2"],
        Faris:   ["2-2","1-1","1-1","0-4","2-0","2-1","1-1","2-2","1-3","1-3"],
        Ismaeil: ["0-1","2-2","2-0","0-6","3-0","3-2","3-1","2-1","2-3","1-2"],
        Husain:  ["2-1","2-1","3-2","1-4","3-2","3-1","2-1","2-0","2-1","1-4"],
        Jeremy:  ["1-1","1-3","3-1","0-3","2-1","2-0","0-0","1-0","0-2","0-2"],
        Aamer:   ["0-2","1-2","2-1","0-5","1-1","1-1","4-0","3-0","1-2","0-1"],
      }
    },
    17: {
      matches: ["CHE @ NEW","BRE @ WOL","WHU @ MCI","SUN @ BHA","BUR @ BOU","LIV @ TOT","CRY @ LEE","ARS @ EVE","MUN @ AVL","NFO @ FUL"],
      results: ["2-2","2-0","0-3","0-0","1-1","2-1","1-4","1-0","1-2","0-1"],
      predictions: {
        Vall:    ["0-1","2-0","1-2","2-2","1-2","1-0","1-2","3-0","3-2","1-3"],
        Damon:   ["1-2","2-1","2-3","1-3","0-2","1-2","2-0","1-1","1-2","0-3"],
        Faris:   ["3-2","1-1","1-3","0-2","1-0","3-2","1-1","0-1","2-2","1-1"],
        Ismaeil: ["2-2","2-2","1-4","1-1","0-1","2-2","2-1","2-0","2-1","1-0"],
        Husain:  ["0-2","0-0","0-2","2-1","1-1","2-1","1-0","2-1","2-3","0-1"],
        Jeremy:  ["1-1","1-0","0-3","1-2","0-0","2-0","3-0","3-1","0-2","1-2"],
        Aamer:   ["2-1","3-1","0-4","0-1","0-3","1-1","2-2","1-0","1-3","0-2"],
      }
    },
    18: {
      matches: ["NEW @ MUN","MCI @ NFO","FUL @ WHU","BOU @ BRE","WOL @ LIV","BHA @ ARS","EVE @ BUR","AVL @ CHE","LEE @ SUN","TOT @ CRY"],
      results: ["0-1","2-1","1-0","1-4","1-2","1-2","0-0","2-1","1-1","1-0"],
      predictions: {
        Vall:    ["2-3","3-2","3-2","2-1","1-2","0-1","1-0","1-2","0-1","0-2"],
        Damon:   ["1-2","3-0","1-2","0-1","0-1","1-1","0-0","2-0","2-2","1-1"],
        Faris:   ["1-1","4-0","1-1","1-3","0-3","1-2","2-0","1-1","1-3","1-2"],
        Ismaeil: ["2-2","2-1","2-2","2-2","2-2","2-2","2-2","2-2","1-1","2-2"],
        Husain:  ["3-2","3-1","2-1","1-2","0-2","0-3","3-1","3-1","1-2","2-1"],
        Jeremy:  ["2-1","2-0","3-1","2-3","1-3","1-3","2-1","2-1","2-1","1-3"],
        Aamer:   ["3-1","4-1","1-0","0-2","0-4","0-2","1-1","3-2","0-2","0-1"],
      }
    },
    19: {
      matches: ["NEW @ BUR","BOU @ CHE","EVE @ NFO","BHA @ WHU","AVL @ ARS","WOL @ MUN","FUL @ CRY","LEE @ LIV","MCI @ SUN","TOT @ BRE"],
      results: ["3-1","2-2","2-0","2-2","1-4","1-1","1-1","0-0","0-0","0-0"],
      predictions: {
        Vall:    ["2-0","0-3","0-0","2-1","0-1","0-3","1-2","1-2","2-3","0-1"],
        Damon:   ["1-0","2-2","1-0","1-1","0-2","0-0","0-1","0-2","2-2","2-0"],
        Faris:   ["2-1","1-2","0-1","1-2","1-3","0-1","1-1","1-3","3-1","1-2"],
        Ismaeil: ["2-2","1-3","2-2","0-0","1-2","0-2","2-2","2-2","2-0","2-2"],
        Husain:  ["3-0","0-1","1-1","1-0","2-1","1-4","2-0","2-3","3-0","0-2"],
        Jeremy:  ["0-1","2-3","1-2","2-2","2-2","1-2","2-1","2-1","4-0","2-1"],
        Aamer:   ["3-1","0-2","2-1","3-1","1-0","1-3","0-2","0-3","2-1","1-3"],
      }
    },
    20: {
      matches: ["NFO @ AVL","BUR @ BHA","WHU @ WOL","ARS @ BOU","MUN @ LEE","LIV @ FUL","SUN @ TOT","BRE @ EVE","CRY @ NEW","CHE @ MCI"],
      results: ["1-3","0-2","0-3","3-2","1-1","2-2","1-1","4-2","0-2","1-1"],
      predictions: {
        Vall:    ["0-2","1-2","2-1","1-0","2-1","2-2","0-1","0-2","1-2","0-2"],
        Damon:   ["1-2","1-2","0-1","2-0","2-1","2-1","1-2","0-2","0-2","1-2"],
        Faris:   ["0-2","1-2","2-1","3-1","1-2","2-1","1-2","0-1","1-2","1-3"],
        Ismaeil: ["1-3","1-2","2-1","2-1","2-2","1-0","0-1","2-0","2-2","1-2"],
        Husain:  ["0-2","2-1","1-2","2-1","1-2","1-2","1-2","2-1","1-2","0-3"],
        Jeremy:  ["1-2","0-1","2-2","2-0","2-2","2-1","1-2","2-1","0-1","1-2"],
        Aamer:   ["0-3","0-2","2-1","3-0","1-0","2-1","1-0","0-1","1-3","0-2"],
      }
    },
    21: {
      matches: ["NFO @ WHU","AVL @ CRY","CHE @ FUL","SUN @ BRE","TOT @ BOU","BHA @ MCI","WOL @ EVE","MUN @ BUR","LEE @ NEW","LIV @ ARS"],
      results: ["2-1","0-0","1-2","0-3","2-3","1-1","1-1","2-2","3-4","0-0"],
      predictions: {
        Vall:    ["2-1","2-1","2-1","0-2","1-0","0-3","0-2","2-0","2-2","1-2"],
        Damon:   ["1-2","2-0","2-1","1-2","2-2","1-3","0-1","2-1","0-2","2-2"],
        Faris:   ["1-2","2-1","1-2","0-1","1-2","1-2","0-2","2-1","1-2","0-2"],
        Ismaeil: ["2-1","3-1","2-1","2-2","1-2","1-2","0-2","1-2","0-1","1-3"],
        Husain:  ["1-2","2-1","1-2","1-2","1-2","1-2","1-2","1-0","1-2","1-3"],
        Jeremy:  ["1-2","2-2","2-1","1-2","3-1","1-3","0-0","1-0","1-3","2-3"],
        Aamer:   ["1-2","3-1","1-2","0-1","1-2","1-3","0-1","2-1","0-3","1-3"],
      }
    },
    22: {
      matches: ["MCI @ MUN","CRY @ SUN","BRE @ CHE","BUR @ LIV","WHU @ TOT","FUL @ LEE","ARS @ NFO","NEW @ WOL","EVE @ AVL","BOU @ BHA"],
      results: ["0-2","1-2","0-2","1-1","2-1","0-1","0-0","0-0","1-0","1-1"],
      predictions: {
        Vall:    ["2-3","1-2","1-2","2-2","0-1","2-3","3-0","3-1","1-2","1-2"],
        Damon:   ["2-2","0-2","0-2","1-2","1-2","1-0","1-1","1-0","0-2","2-2"],
        Faris:   ["1-2","1-0","3-1","0-3","0-2","1-2","2-0","2-2","0-0","1-1"],
        Ismaeil: ["3-1","1-1","1-3","2-1","2-1","2-0","3-1","2-1","2-2","3-1"],
        Husain:  ["2-0","0-1","2-1","0-2","1-3","3-1","1-0","3-2","1-3","0-2"],
        Jeremy:  ["2-1","1-3","1-1","1-3","2-2","2-2","2-1","2-0","2-1","2-1"],
        Aamer:   ["3-0","0-0","2-2","0-1","1-1","2-1","2-2","4-1","0-1","1-3"],
      }
    },
    23: {
      matches: ["SUN @ WHU","BHA @ FUL","TOT @ BUR","WOL @ MCI","LIV @ BOU","CHE @ CRY","AVL @ NEW","NFO @ BRE","MUN @ ARS","LEE @ EVE"],
      results: ["1-3","1-2","2-2","0-2","2-3","3-1","2-0","2-0","3-2","1-1"],
      predictions: {
        Vall:    ["1-0","1-2","2-1","0-3","2-2","3-1","0-2","1-3","5-0","2-1"],
        Damon:   ["0-1","0-2","3-1","1-2","2-0","1-0","1-2","0-3","1-1","1-2"],
        Faris:   ["1-1","2-1","1-0","0-2","1-2","3-0","1-3","0-1","1-2","0-1"],
        Ismaeil: ["1-2","1-1","1-2","2-2","0-0","0-2","2-2","1-2","0-5","1-1"],
        Husain:  ["2-1","1-3","0-1","1-3","1-0","2-0","2-1","0-2","2-3","0-0"],
        Jeremy:  ["2-2","0-1","2-0","0-4","2-1","2-1","2-0","0-0","1-3","2-0"],
        Aamer:   ["2-0","2-2","0-2","2-3","3-1","0-1","3-2","1-0","6-0","0-2"],
      }
    },
    24: {
      matches: ["ARS @ LEE","EVE @ BHA","BOU @ WOL","WHU @ CHE","NEW @ LIV","CRY @ NFO","FUL @ MUN","BRE @ AVL","MCI @ TOT","BUR @ SUN"],
      results: ["4-0","1-1","2-0","2-3","1-4","1-1","2-3","1-0","2-2","0-3"],
      predictions: {
        Vall:    ["2-2","1-0","2-0","0-2","0-2","2-1","0-3","0-3","2-2","0-3"],
        Damon:   ["2-1","0-1","2-1","0-1","1-1","0-1","0-2","1-2","1-2","0-1"],
        Faris:   ["3-1","1-2","1-0","1-3","1-2","1-1","2-3","0-1","3-1","0-2"],
        Ismaeil: ["2-0","0-2","0-1","2-3","2-2","2-0","2-1","0-2","0-2","1-1"],
        Husain:  ["1-0","2-1","1-2","1-2","1-3","1-0","0-1","1-3","2-0","1-2"],
        Jeremy:  ["1-2","2-2","3-1","0-3","0-1","1-2","1-2","2-1","1-0","1-3"],
        Aamer:   ["2-3","1-1","2-2","1-4","2-1","0-2","1-3","2-3","2-1","1-0"],
      }
    },
    25: {
      matches: ["NFO @ LEE","TOT @ MUN","CHE @ WOL","AVL @ BOU","SUN @ ARS","WHU @ BUR","EVE @ FUL","BRE @ NEW","CRY @ BHA","MCI @ LIV"],
      results: ["1-3","0-2","3-1","1-1","0-3","2-0","2-1","3-2","1-0","2-1"],
      predictions: {
        Vall:    ["3-1","0-2","2-1","2-2","1-3","2-1","0-3","0-2","0-0","2-2"],
        Damon:   ["0-1","2-2","2-0","1-2","0-2","1-2","2-2","1-2","0-1","2-1"],
        Faris:   ["1-3","1-3","4-0","2-0","0-3","3-1","1-2","1-1","1-1","2-3"],
        Ismaeil: ["2-1","1-2","3-0","0-2","2-3","2-0","1-1","2-2","2-0","1-2"],
        Husain:  ["2-0","2-3","3-1","2-1","1-4","1-0","1-3","2-1","2-1","3-1"],
        Jeremy:  ["2-2","2-1","1-0","1-0","1-2","3-0","0-2","3-1","1-2","3-2"],
        Aamer:   ["1-2","0-3","4-1","3-1","2-1","0-2","0-1","2-3","0-2","2-0"],
      }
    },
    26: {
      matches: ["NEW @ TOT","BOU @ EVE","LEE @ CHE","MUN @ WHU","FUL @ MCI","WOL @ NFO","BUR @ CRY","BHA @ AVL","LIV @ SUN","ARS @ BRE"],
      results: ["2-1","2-1","2-2","1-1","0-3","0-0","3-2","0-1","1-0","1-1"],
      predictions: {
        Vall:    ["2-1","1-2","0-2","3-1","1-2","0-2","1-2","0-2","0-1","1-2"],
        Damon:   ["1-2","2-1","1-2","2-1","1-2","0-1","1-2","1-2","1-2","2-0"],
        Faris:   ["2-2","1-2","1-3","2-1","0-2","0-1","0-2","1-2","2-1","2-1"],
        Ismaeil: ["2-2","2-2","2-2","2-2","2-2","2-2","2-2","2-2","2-2","2-2"],
        Husain:  ["2-1","1-2","1-3","3-0","0-2","1-0","0-2","1-2","2-1","2-1"],
        Jeremy:  ["2-1","0-1","1-3","4-0","0-3","0-1","0-2","1-3","2-0","2-0"],
        Aamer:   ["2-2","1-2","1-3","2-1","0-2","0-1","0-2","1-2","2-1","2-1"],
      }
    },
    27: {
      matches: ["NEW @ MCI","LIV @ NFO","LEE @ AVL","BUR @ CHE","BHA @ BRE","BOU @ WHU","FUL @ SUN","WOL @ CRY","ARS @ TOT","MUN @ EVE"],
      results: ["1-2","1-0","1-1","1-1","2-0","0-0","3-1","0-1","4-1","1-0"],
      predictions: {
        Vall:    ["0-2","2-0","0-1","1-2","0-0","1-3","0-0","1-0","3-1","2-0"],
        Damon:   ["0-4","3-0","0-2","1-3","0-1","2-1","1-2","1-1","2-2","3-1"],
        Faris:   ["1-4","3-1","1-2","0-2","1-2","2-2","2-1","0-0","3-0","3-0"],
        Ismaeil: ["2-2","1-2","2-2","1-1","2-1","0-2","0-1","1-2","3-2","2-2"],
        Husain:  ["1-2","1-0","0-3","2-2","1-3","3-1","0-2","0-2","2-0","2-1"],
        Jeremy:  ["1-3","2-1","2-3","0-1","2-2","2-3","2-2","2-1","2-1","1-1"],
        Aamer:   ["0-3","2-2","1-3","0-3","0-2","1-2","1-1","1-3","4-2","1-0"],
      }
    },
    28: {
      matches: ["AVL @ WOL","SUN @ BOU","EVE @ NEW","BRE @ BUR","WHU @ LIV","NFO @ BHA","MCI @ LEE","CRY @ MUN","TOT @ FUL","CHE @ ARS"],
      results: [null,null,null,null,null,null,null,null,null,null],
      predictions: {
        Vall:    [null,null,null,null,null,"0-1",null,null,null,null],
        Damon:   ["2-0",null,null,null,null,null,null,"1-2",null,null],
        Faris:   [null,null,null,null,null,null,null,null,null,null],
        Ismaeil: [null,null,null,null,null,"1-2","2-0",null,null,null],
        Husain:  ["1-2","2-1","1-2",null,null,null,null,"0-2","0-1","1-2"],
        Jeremy:  [null,null,null,"2-1",null,null,null,null,null,null],
        Aamer:   ["2-1","1-2",null,null,null,null,null,"1-3","1-2",null],
      }
    },
  };

  // ── BUILD GAMEWEEKS + PREDICTIONS ───────────────────────────────────────────
  const gameweeks = [];
  const predictions = Object.fromEntries(PLAYERS.map(p => [p, {}]));

  for (const [gwStr, data] of Object.entries(RAW)) {
    const gw = parseInt(gwStr);
    const fixtures = data.matches.map((abbr, i) => {
      const { home, away } = fix(abbr);
      const result = data.results[i];
      return {
        id: `gw${gw}-f${i}`,
        home, away,
        result: result || null,
        status: result ? "FINISHED" : "SCHEDULED",
        date: null,
      };
    });
    gameweeks.push({ gw, fixtures });

    // predictions keyed by lowercase username
    for (let pi = 0; pi < PLAYERS.length; pi++) {
      const username = PLAYERS[pi];
      const displayName = DISPLAY[pi];
      const playerPreds = data.predictions[displayName] || [];
      for (let fi = 0; fi < fixtures.length; fi++) {
        const pred = playerPreds[fi];
        if (pred && /^\d+-\d+$/.test(pred)) {
          predictions[username][`gw${gw}-f${fi}`] = pred;
        }
      }
    }
  }

  // Sort gameweeks by gw number
  gameweeks.sort((a, b) => a.gw - b.gw);

  // ── WRITE USERS ──────────────────────────────────────────────────────────────
  console.log("Creating users...");
  for (let i = 0; i < PLAYERS.length; i++) {
    await sset(`user:${PLAYERS[i]}`, {
      username:    PLAYERS[i],
      displayName: DISPLAY[i],
      password:    PASSWORD,
      groupIds:    [GROUP_ID],
    });
  }

  // ── WRITE GROUP ──────────────────────────────────────────────────────────────
  console.log("Creating group...");
  await sset(`group:${GROUP_ID}`, {
    id:              GROUP_ID,
    name:            GROUP_NAME,
    code:            GROUP_CODE,
    creatorUsername: PLAYERS[2],
    members:         PLAYERS,
    admins:          [PLAYERS[2]],
    gameweeks,
    currentGW:       28,
    apiKey:          "",
    season:          2025,
    predictions,
  });

  await sset(`groupcode:${GROUP_CODE}`, GROUP_ID);

  console.log(`
✅ Done!
   Group : "${GROUP_NAME}"   (invite code: ${GROUP_CODE})
   GWs   : 11–27 with real results + predictions. GW28 current (no results yet).
   Login with any player name (lowercase), password: ${PASSWORD}
  `);
})();
