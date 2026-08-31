const clamp = (x, a = 0, b = 1) =>
  Math.max(a, Math.min(b, x));

const pois = (k, l) => {
  let f = 1;

  for (let i = 2; i <= k; i++) {
    f *= i;
  }

  return Math.exp(-l) * l ** k / f;
};

function grid(lh, la) {
  let H = 0;
  let D = 0;
  let A = 0;
  let O25 = 0;
  let BTTS = 0;

  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = pois(i, lh) * pois(j, la);

      if (i > j) H += p;
      else if (i === j) D += p;
      else A += p;

      if (i + j >= 3) O25 += p;
      if (i > 0 && j > 0) BTTS += p;
    }
  }

  return {
    H,
    D,
    A,
    O25,
    U25: 1 - O25,
    BTTS,
    NOBTTS: 1 - BTTS,
    H15: 1 - Math.exp(-lh) * (1 + lh),
    A15: 1 - Math.exp(-la) * (1 + la)
  };
}

function weightedTeam(rows, teamId) {
  let w = 1;
  let att = 0;
  let def = 0;
  let sum = 0;
  let fhfor = 0;
  let fhag = 0;

  const sorted = [...rows].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  for (const r of sorted) {
    const home = r.homeId === teamId;

    const gf = home ? r.hg : r.ag;
    const ga = home ? r.ag : r.hg;

    if (gf == null || ga == null) continue;

    att += gf * w;
    def += ga * w;

    const fhf = home ? r.hh : r.ha;
    const fha = home ? r.ha : r.hh;

    fhfor += (fhf ?? 0) * w;
    fhag += (fha ?? 0) * w;

    sum += w;
    w *= 0.88;
  }

  if (!sum) {
    return {
      gf: null,
      ga: null,
      fhgf: null,
      fhga: null,
      n: 0
    };
  }

  return {
    gf: att / sum,
    ga: def / sum,
    fhgf: fhfor / sum,
    fhga: fhag / sum,
    n: sorted.length
  };
}

function normalize3(p) {
  const s = p.H + p.D + p.A || 1;

  return {
    H: p.H / s,
    D: p.D / s,
    A: p.A / s
  };
}

export function predict({
  homeRows,
  awayRows,
  homeId,
  awayId,
  standings,
  providerPrediction
}) {
  const h = weightedTeam(homeRows, homeId);
  const a = weightedTeam(awayRows, awayId);

  const totalPlayed = standings.reduce(
    (s, r) => s + (r.played || 0),
    0
  );

  const lgf = standings.reduce(
    (s, r) => s + (r.gf || 0),
    0
  );

  const leagueGoal =
    totalPlayed > 0 ? lgf / totalPlayed : 1.35;

  const shrink = n =>
    Math.min(0.8, n / 10);

  const hAtt =
    (h.gf ?? leagueGoal) * shrink(h.n) +
    leagueGoal * (1 - shrink(h.n));

  const hDef =
    (h.ga ?? leagueGoal) * shrink(h.n) +
    leagueGoal * (1 - shrink(h.n));

  const aAtt =
    (a.gf ?? leagueGoal) * shrink(a.n) +
    leagueGoal * (1 - shrink(a.n));

  const aDef =
    (a.ga ?? leagueGoal) * shrink(a.n) +
    leagueGoal * (1 - shrink(a.n));

  const lh = clamp(
    ((hAtt + aDef) / 2) * 1.08,
    0.25,
    3.4
  );

  const la = clamp(
    ((aAtt + hDef) / 2) * 0.92,
    0.2,
    3.2
  );

  let p = grid(lh, la);
  let oneXtwo = normalize3(p);

  if (providerPrediction) {
    const blend = Math.min(
      0.35,
      Math.min(h.n, a.n) / 20
    );

    oneXtwo = normalize3({
      H:
        oneXtwo.H * (1 - blend) +
        providerPrediction.H * blend,

      D:
        oneXtwo.D * (1 - blend) +
        providerPrediction.D * blend,

      A:
        oneXtwo.A * (1 - blend) +
        providerPrediction.A * blend
    });

    p = {
      ...p,
      ...oneXtwo
    };
  }

  const sample = Math.min(h.n, a.n);

  const dataQuality = Math.round(
    Math.min(100, 35 + sample * 6)
  );

  const confidence = {};

  for (const [key, value] of Object.entries(p)) {
    let c =
      30 +
      Math.abs(value - 0.5) * 50 +
      Math.min(sample, 10) * 3;

    if (sample < 5) {
      c = Math.min(c, 49);
    }

    confidence[key] = Math.round(
      clamp(c / 100) * 100
    );
  }

  return {
    lambdaHome: lh,
    lambdaAway: la,
    sample,
    dataQuality,
    probabilities: p,
    confidence
  };
}

export function ev(prob, odds) {
  return odds && odds > 1
    ? prob * odds - 1
    : null;
}
