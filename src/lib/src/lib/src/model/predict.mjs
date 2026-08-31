const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

const pois = (k, l) => {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return Math.exp(-l) * l ** k / f;
};

function grid(lh, la) {
  let H = 0, D = 0, A = 0, O25 = 0, BTTS = 0;

  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = pois(i, lh) * pois(j, la);

      if (i > j) H += p;
      else if (i === j) D += p;
      else A += p;

      if (i + j >= 3) O25 += p;
      if (i && j) BTTS += p;
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
  let w = 1, att = 0, def = 0, sum = 0, fhfor = 0, fhag = 0;

  const sorted = [...rows].sort((a, b) => new Date(b.date) - new Date(a.date));

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

  return sum
    ? {
        gf: att / sum,
        ga: def / sum,
        fhgf: fhfor / sum,
        fhga: fhag / sum,
        n: sorted.length
      }
    : {
        gf: null,
        ga: null,
        fhgf: null,
        fhga: null,
        n: 0
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

  const totalPlayed = standings.reduce((s, r) => s + (r.played || 0), 0);
  const lgf = standings.reduce((s, r) => s + (r.gf || 0), 0);

  const leagueGoal = totalPlayed ? lgf / totalPlayed : 1.35;

  const shrink = n => Math.min(0.8, n / 10);

  const hAtt = (h.gf ?? leagueGoal) * shrink(h.n) + leagueGoal * (1 - shrink(h.n));
  const hDef = (h.ga ?? leagueGoal) * shrink(h.n) + leagueGoal * (1 - shrink(h.n));
  const aAtt = (a.gf ?? leagueGoal) * shrink(a.n) + leagueGoal * (1 - shrink(a.n));
  const aDef = (a.ga ?? leagueGoal) * shrink(a.n) + leagueGoal * (1 - shrink(a.n));

  let lh = clamp(((hAtt + aDef) / 2) * 1.08, 0.25, 3.4);
  let la = clamp(((aAtt + hDef) / 2) * 0.92, 0.2, 3.2);

  let p = grid(lh, la);
  let oneXtwo = normalize3(p);

  if (providerPrediction) {
    const blend = Math.min(0.35, Math.min(h.n, a.n) / 20);

    oneXtwo = normalize3({
      H: oneXtwo.H * (1 - blend) + providerPrediction.H * blend,
      D: oneXtwo.D * (1 - blend) + providerPrediction.D * blend,
      A: oneXtwo.A * (1 - blend) + providerPrediction.A * blend
    });

    p = {
      ...p,
      ...oneXtwo
    };
  }

  const sample = Math.min(h.n, a.n);
  const dataQuality = Math.round(Math.min(100, 35 + sample * 6));

  const confidence = {};

  for (const [k, v] of Object.entries(p)) {
    let c = 30 + Math.abs(v - 0.5) * 50 + Math.min(sample, 10) * 3;

    if (sample < 5) {
      c = Math.min(c, 49);
    }

    confidence[k] = Math.round(clamp(c / 100) * 100);
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
  return odds && odds > 1 ? prob * odds - 1 : null;
}
