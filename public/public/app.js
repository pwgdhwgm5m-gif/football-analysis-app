const $ = s => document.querySelector(s);

const pct = n =>
  `${Math.round((Number(n) || 0) * 100)}%`;

const marketNames = {
  H: "1",
  D: "X",
  A: "2",
  O25: "2.5 Üst",
  U25: "2.5 Alt",
  BTTS: "KG Var",
  NOBTTS: "KG Yok",
  H15: "Ev 1.5+",
  A15: "Dep 1.5+"
};

let matches = [];
let activeLeague = "ALL";

function localDate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

$("#dateInput").value = localDate();

async function api(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function marketBox(key, market) {
  if (!market) return "";

  const odds =
    market.odds != null
      ? Number(market.odds).toFixed(2)
      : "—";

  const ev =
    market.ev != null
      ? `${market.ev >= 0 ? "+" : ""}${(
          market.ev * 100
        ).toFixed(1)}%`
      : "—";

  return `
    <div class="market ${
      market.confidence >= 70 ? "strong" : ""
    }">
      <b>${marketNames[key] || key}</b>
      <strong>${pct(market.prob)}</strong>
      <small>Güven ${market.confidence}/100</small>
      <small>Oran ${odds}</small>
      <small>EV ${ev}</small>
    </div>
  `;
}

function matchCard(match) {
  const m = match.model.markets;

  return `
    <article class="match-card">
      <div class="teams">
        ${match.home.name}
        <span>–</span>
        ${match.away.name}
      </div>

      <div class="meta">
        ${match.league.flag}
        ${match.league.name}
        · Örnek ${match.model.sample}
        · Veri ${match.model.dataQuality}/100
      </div>

      <div class="markets">
        ${[
          "H",
          "D",
          "A",
          "O25",
          "U25",
          "BTTS",
          "NOBTTS",
          "H15",
          "A15"
        ]
          .map(key => marketBox(key, m[key]))
          .join("")}
      </div>
    </article>
  `;
}

function allSelections() {
  const result = [];

  for (const match of matches) {
    for (const [key, market] of Object.entries(
      match.model.markets
    )) {
      result.push({
        match,
        key,
        market
      });
    }
  }

  return result;
}

function selectionCard(item) {
  const { match, key, market } = item;

  const odds =
    market.odds != null
      ? Number(market.odds).toFixed(2)
      : "—";

  const ev =
    market.ev != null
      ? `${market.ev >= 0 ? "+" : ""}${(
          market.ev * 100
        ).toFixed(1)}%`
      : "—";

  return `
    <article class="pick-card">
      <b>
        ${match.home.name} – ${match.away.name}
      </b>

      <div>
        ${match.league.flag}
        ${marketNames[key] || key}
        · ${pct(market.prob)}
        · Güven ${market.confidence}/100
        · Oran ${odds}
        · EV ${ev}
      </div>
    </article>
  `;
}

function render() {
  const visible =
    activeLeague === "ALL"
      ? matches
      : matches.filter(
          x => x.league.code === activeLeague
        );

  $("#matches").innerHTML = visible.length
    ? visible.map(matchCard).join("")
    : `<div class="empty">Bu tarihte maç bulunamadı.</div>`;

  const selections = allSelections();

  const topEv = selections
    .filter(
      x =>
        x.market.ev != null &&
        x.market.ev > 0 &&
        x.market.confidence >= 50
    )
    .sort((a, b) => b.market.ev - a.market.ev)
    .slice(0, 10);

  $("#topEv").innerHTML = topEv.length
    ? topEv.map(selectionCard).join("")
    : `<div class="empty">
        Pozitif EV yok veya gerçek oran verisi bulunamadı.
       </div>`;

  const trusted = selections
    .filter(
      x =>
        x.market.prob > 0.5 &&
        x.market.confidence >= 50
    )
    .sort(
      (a, b) =>
        b.market.confidence -
        a.market.confidence
    )
    .slice(0, 10);

  $("#trusted").innerHTML = trusted.length
    ? trusted.map(selectionCard).join("")
    : `<div class="empty">
        Yeterli güven seviyesinde seçim yok.
       </div>`;
}

async function loadMatches() {
  $("#status").textContent = "Veri yükleniyor...";

  try {
    const data = await api(
      `/api/day?date=${$("#dateInput").value}`
    );

    matches = data.matches || [];

    $("#status").textContent =
      `${matches.length} gerçek fikstür` +
      (data.errors?.length
        ? ` · ${data.errors.length} kaynak uyarısı`
        : "");

    render();
  } catch (error) {
    matches = [];

    $("#status").textContent =
      `Veri hatası: ${error.message}`;

    render();
  }
}

async function init() {
  try {
    const leagues = await api("/api/leagues");

    $("#leagueFilters").innerHTML =
      `<button class="active" data-code="ALL">
        Tümü
       </button>` +
      leagues
        .map(
          l => `
            <button data-code="${l.code}">
              ${l.flag} ${l.name}
            </button>
          `
        )
        .join("");

    $("#leagueFilters").onclick = event => {
      const button =
        event.target.closest("button");

      if (!button) return;

      activeLeague =
        button.dataset.code;

      document
        .querySelectorAll(
          "#leagueFilters button"
        )
        .forEach(b =>
          b.classList.toggle(
            "active",
            b === button
          )
        );

      render();
    };

    $("#dateInput").onchange = loadMatches;
    $("#refreshBtn").onclick = loadMatches;

    await loadMatches();
  } catch (error) {
    $("#status").textContent =
      `Başlatma hatası: ${error.message}`;
  }
}

init();
