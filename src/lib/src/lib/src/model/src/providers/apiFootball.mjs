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
      `fix:${q}`,
      () =>
        fetchJson(`${BASE}/fixtures?${q}`, {
          headers: headers()
        }).then(x => x.data),
      120000
    );

    if (data.errors && Object.keys(data.errors).length) {
      throw new Error(JSON.stringify(data.errors));
    }

    return (data.response || []).map(x => ({
      id: x.fixture.id,
      leagueCode,
      date: x.fixture.date,
      status: x.fixture.status?.short,
      home: {
        id: x.teams.home.id,
        name: x.teams.home.name,
        logo: x.teams.home.logo
      },
      away: {
        id: x.teams.away.id,
        name: x.teams.away.name,
        logo: x.teams.away.logo
      },
      score: x.goals
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
      `std:${q}`,
      () =>
        fetchJson(`${BASE}/standings?${q}`, {
          headers: headers()
        }).then(x => x.data),
      600000
    );

    const rows =
      data.response?.[0]?.league?.standings?.[0] || [];

    return rows.map(r => ({
      rank: r.rank,
      teamId: r.team.id,
      team: r.team.name,
      played: r.all.play,
      win: r.all.win,
      draw: r.all.draw,
      lose: r.all.lose,
      gf: r.all.goals.for,
      ga: r.all.goals.against,
      gd: r.goalsDiff,
      points: r.points,
      form: r.form || ""
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
    if (!id) return [];

    const q = new URLSearchParams({
      league: String(id),
      season: String(season),
      team: String(teamId),
      last: String(last),
      status: "FT"
    });

    const { data } = await cached(
      `recent:${q}`,
      () =>
        fetchJson(`${BASE}/fixtures?${q}`, {
          headers: headers()
        }).then(x => x.data),
      300000
    );

    return (data.response || []).map(x => ({
      id: x.fixture.id,
      date: x.fixture.date,
      homeId: x.teams.home.id,
      awayId: x.teams.away.id,
      hg: x.goals.home,
      ag: x.goals.away,
      hh: x.score.halftime?.home,
      ha: x.score.halftime?.away
    }));
  },

  async providerPrediction(fixtureId) {
    assertKey();

    const { data } = await cached(
      `pred:${fixtureId}`,
      () =>
        fetchJson(`${BASE}/predictions?fixture=${fixtureId}`, {
          headers: headers()
        }).then(x => x.data),
      300000
    );

    const p = data.response?.[0]?.predictions?.percent;
    if (!p) return null;

    const n = s =>
      Number(String(s || "").replace("%", "")) / 100;

    return {
      H: n(p.home),
      D: n(p.draw),
      A: n(p.away)
    };
  }
};
