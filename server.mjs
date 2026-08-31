import express from "express";
import { apiFootball } from "./src/providers/apiFootball.mjs";
import { oddsApi } from "./src/providers/oddsApi.mjs";
import { predict, ev } from "./src/model/predict.mjs";

const app = express();
const PORT = process.env.PORT || 3000;

const LEAGUES = [
  { code: "TSL", name: "Süper Lig", flag: "🇹🇷" },
  { code: "PL", name: "Premier League", flag: "🇬🇧" },
  { code: "PD", name: "La Liga", flag: "🇪🇸" },
  { code: "SA", name: "Serie A", flag: "🇮🇹" },
  { code: "BL1", name: "Bundesliga", flag: "🇩🇪" },
  { code: "FL1", name: "Ligue 1", flag: "🇫🇷" },
  { code: "DED", name: "Eredivisie", flag: "🇳🇱" },
  { code: "PPL", name: "Primeira Liga", flag: "🇵🇹" },
  { code: "BSA", name: "Brasileirão", flag: "🇧🇷" }
];

function seasonFor(date) {
  const d = new Date(date + "T12:00:00Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  return month >= 7 ? year : year - 1;
}

const norm = s =>
  (s || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");

function findOdds(match, events = []) {
  const found = events.find(
    e =>
      norm(e?.home) === norm(match?.home?.name) &&
      norm(e?.away) === norm(match?.away?.name)
  );

  return found?.odds || {};
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: "2.0.1",

    commercialMode:
      process.env.COMMERCIAL_MODE !== "false",

    providers: {
      football: Boolean(process.env.API_FOOTBALL_KEY),
      odds: Boolean(process.env.ODDS_API_KEY)
    }
  });
});

app.get("/api/leagues", (req, res) => {
  res.json(LEAGUES);
});

app.get("/api/day", async (req, res) => {
  const date =
    req.query.date ||
    new Date().toISOString().slice(0, 10);

  const season = seasonFor(date);

  const matches = [];
  const errors = [];

  for (const league of LEAGUES) {
    try {
      const fixtures =
        await apiFootball.fixtures({
          date,
          leagueCode: league.code,
          season
        });

      if (!Array.isArray(fixtures) || fixtures.length === 0) {
        continue;
      }

      let standings = [];

      try {
        standings =
          await apiFootball.standings({
            leagueCode: league.code,
            season
          });
      } catch (error) {
        errors.push(
          `${league.code} standings: ${error.message}`
        );
      }

      let oddsPack = {
        events: [],
        quota: null
      };

      if (process.env.ODDS_API_KEY) {
        try {
          const result =
            await oddsApi.oddsForLeague(
              league.code
            );

          if (result && Array.isArray(result.events)) {
            oddsPack = result;
          }
        } catch (error) {
          errors.push(
            `${league.code} odds: ${error.message}`
          );
        }
      }

      for (const fixture of fixtures) {
        try {
          const homeRows =
            await apiFootball.recentFixtures({
              leagueCode: league.code,
              season,
              teamId: fixture.home.id,
              last: 12
            });

          const awayRows =
            await apiFootball.recentFixtures({
              leagueCode: league.code,
              season,
              teamId: fixture.away.id,
              last: 12
            });

          let providerPrediction = null;

          try {
            providerPrediction =
              await apiFootball.providerPrediction(
                fixture.id
              );
          } catch {
            providerPrediction = null;
          }

          const model = predict({
            homeRows,
            awayRows,
            homeId: fixture.home.id,
            awayId: fixture.away.id,
            standings,
            providerPrediction
          });

          const odds =
            findOdds(
              fixture,
              oddsPack.events || []
            );

          const markets = {};

          for (
            const [key, probability]
            of Object.entries(
              model.probabilities || {}
            )
          ) {
            const marketOdds =
              odds?.[key] || null;

            markets[key] = {
              prob: probability,

              confidence:
                model.confidence?.[key] ?? 0,

              odds: marketOdds,

              ev:
                marketOdds
                  ? ev(
                      probability,
                      marketOdds
                    )
                  : null
            };
          }

          matches.push({
            ...fixture,

            league,

            model: {
              sample:
                model.sample ?? 0,

              dataQuality:
                model.dataQuality ?? 0,

              lambdaHome:
                model.lambdaHome ?? null,

              lambdaAway:
                model.lambdaAway ?? null,

              markets
            }
          });
        } catch (error) {
          errors.push(
            `${league.code} ${fixture?.home?.name || "Home"}-${fixture?.away?.name || "Away"}: ${error.message}`
          );
        }
      }
    } catch (error) {
      errors.push(
        `${league.code}: ${error.message}`
      );
    }
  }

  matches.sort(
    (a, b) =>
      new Date(a.date) -
      new Date(b.date)
  );

  res.json({
    date,
    season,
    count: matches.length,
    matches,
    errors
  });
});

app.use(
  express.static("public/public")
);

app.get("*", (req, res) => {
  res.sendFile(
    process.cwd() +
      "/public/public/index.html"
  );
});

app.listen(PORT, () => {
  console.log(
    `Score V2 listening on ${PORT}`
  );
});
