import { fetchJson, ttlCache } from "../lib/http.mjs";

const cached = ttlCache(180000);
const BASE = "https://v3.football.api-sports.io";

const MAP = {
  TSL: 203,
  PL: 39,
  PD: 140,
  SA: 135,
  BL1: 78,
  FL1: 61,
  DED: 88,
  PPL: 94,
  BSA: 71
};

const headers = () => ({
  "x-apisports-key": process.env.API_FOOTBALL_KEY || ""
});

function assertKey() {
  if (!process.env.API_FOOTBALL_KEY) {
    throw new Error("API_FOOTBALL_KEY missing");
  }
}

function checkErrors(data) {
  if (data?.errors && Object.keys(data.errors).length) {
    throw new Error(JSON.stringify(data.errors));
  }
}

export const apiFootball = {
  name: "API-Football",
  leagueIds: MAP,

  async fixtures({ date, leagueCode, season }) {
    assertKey();

    const id = MAP[leagueCode];
    if (!id) return [];

    const q = new URLSearchParams({
      league: String(id),
      season: String(season),
      date
    });

    const { data } = await cached(
      `fix:${q.toString()}`,
      () =>
        fetchJson(`${BASE}/fixtures?${q.toString()}`, {
          headers: headers()
        }).then(x => x.data),
      120000
    );

    checkErrors(data);

    return (data.response || []).map(x => ({
      id: x?.fixture?.id,
      leagueCode,
      date: x?.fixture?.date,
      status: x?.fixture?.status?.short || "",
      home: {
        id: x?.teams?.home?.id,
        name: x?.teams?.home?.name || "",
        logo: x?.teams?.home?.logo || ""
      },
      away: {
        id: x?.teams?.away?.id,
        name: x?.teams?.away?.name || "",
        logo: x?.teams?.away?.logo || ""
      },
      score: {
        home: x?.goals?.home ?? null,
        away: x?.goals?.away ?? null
      }
    }));
  },

  async standings({ leagueCode, season }) {
    assertKey();

    const id = MAP[leagueCode];
    if (!id) return [];

    const q = new URLSearchParams({
      league: String(id),
      season: String(season)
    });

    const { data } = await cached(
      `stand:${q.toString()}`,
      () =>
        fetchJson(`${BASE}/standings?${q.toString()}`, {
          headers: headers()
        }).then(x => x.data),
      300000
    );

    checkErrors(data);

    const rows =
      data?.response?.[0]?.league?.standings?.[0] || [];

    return rows
      .filter(r => r?.team && r?.all)
      .map(r => ({
        rank: r?.rank ?? 0,
        teamId: r?.team?.id,
        team: r?.team?.name || "",
        played: r?.all?.played ?? r?.all?.play ?? 0,
        win: r?.all?.win ?? 0,
        draw: r?.all?.draw ?? 0,
        lose: r?.all?.lose ?? 0,
        gf: r?.all?.goals?.for ?? 0,
        ga: r?.all?.goals?.against ?? 0,
        gd: r?.goalsDiff ?? 0,
        points: r?.points ?? 0,
        form: r?.form || ""
      }));
  },

  async recentFixtures({
    leagueCode,
    season,
    teamId,
    last = 12
  }) {
    assertKey();

    const id = MAP[leagueCode];
    if (!id || !teamId) return [];

    const q = new URLSearchParams({
      league: String(id),
      season: String(season),
      team: String(teamId),
      last: String(last),
      status: "FT"
    });

    const { data } = await cached(
      `recent:${q.toString()}`,
      () =>
        fetchJson(`${BASE}/fixtures?${q.toString()}`, {
          headers: headers()
        }).then(x => x.data),
      300000
    );

    checkErrors(data);

    return (data.response || [])
      .filter(x => x?.fixture && x?.teams)
      .map(x => ({
        id: x?.fixture?.id,
        date: x?.fixture?.date,

        homeId: x?.teams?.home?.id,
        awayId: x?.teams?.away?.id,

        hg: x?.goals?.home ?? null,
        ag: x?.goals?.away ?? null,

        hh: x?.score?.halftime?.home ?? null,
        ha: x?.score?.halftime?.away ?? null
      }));
  },

  async providerPrediction(fixtureId) {
    assertKey();

    if (!fixtureId) return null;

    const q = new URLSearchParams({
      fixture: String(fixtureId)
    });

    const { data } = await cached(
      `pred:${q.toString()}`,
      () =>
        fetchJson(`${BASE}/predictions?${q.toString()}`, {
          headers: headers()
        }).then(x => x.data),
      300000
    );

    checkErrors(data);

    const p = data?.response?.[0]?.predictions?.percent;
    if (!p) return null;

    const parsePct = value => {
      if (value === undefined || value === null) return null;

      const n = Number(
        String(value)
          .replace("%", "")
          .trim()
      );

      if (!Number.isFinite(n)) return null;

      return n / 100;
    };

    return {
      H: parsePct(p.home),
      D: parsePct(p.draw),
      A: parsePct(p.away)
    };
  }
};
