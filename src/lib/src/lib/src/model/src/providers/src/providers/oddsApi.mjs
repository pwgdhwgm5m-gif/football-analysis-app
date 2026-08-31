import { fetchJson, ttlCache } from "../lib/http.mjs";

const cached = ttlCache(300000);
const BASE = "https://api.the-odds-api.com/v4";

const SPORT = {
  PL: "soccer_epl",
  PD: "soccer_spain_la_liga",
  SA: "soccer_italy_serie_a",
  BL1: "soccer_germany_bundesliga",
  FL1: "soccer_france_ligue_one",
  DED: "soccer_netherlands_eredivisie",
  PPL: "soccer_portugal_primeira_liga",
  TSL: "soccer_turkey_super_league",
  BSA: "soccer_brazil_campeonato"
};

function best(groups, name) {
  const values = [];

  for (const group of groups || []) {
    for (const outcome of group || []) {
      if (
        outcome.name === name &&
        Number(outcome.price) > 1
      ) {
        values.push(Number(outcome.price));
      }
    }
  }

  return values.length ? Math.max(...values) : null;
}

export const oddsApi = {
  name: "The Odds API",

  async oddsForLeague(leagueCode) {
    const key = process.env.ODDS_API_KEY;

    if (!key) {
      return {
        events: [],
        quota: null
      };
    }

    const sport = SPORT[leagueCode];

    if (!sport) {
      return {
        events: [],
        quota: null
      };
    }

    const q = new URLSearchParams({
      apiKey: key,
      regions: "eu,uk",
      markets: "h2h,totals",
      oddsFormat: "decimal",
      dateFormat: "iso"
    });

    const { data, headers } = await cached(
      `odds:${sport}`,
      () =>
        fetchJson(
          `${BASE}/sports/${sport}/odds?${q}`
        ),
      180000
    );

    const events = (data || []).map(e => {
      const h2h =
        e.bookmakers?.flatMap(
          b =>
            b.markets
              ?.filter(m => m.key === "h2h")
              .map(m => m.outcomes) || []
        ) || [];

      const totals =
        e.bookmakers?.flatMap(
          b =>
            b.markets
              ?.filter(m => m.key === "totals")
              .map(m => m.outcomes) || []
        ) || [];

      return {
        id: e.id,
        home: e.home_team,
        away: e.away_team,
        commence: e.commence_time,

        odds: {
          H: best(h2h, e.home_team),
          D: best(h2h, "Draw"),
          A: best(h2h, e.away_team),
          O25: best(totals, "Over"),
          U25: best(totals, "Under")
        }
      };
    });

    return {
      events,
      quota: {
        remaining: headers.get("x-requests-remaining"),
        used: headers.get("x-requests-used")
      }
    };
  }
};
