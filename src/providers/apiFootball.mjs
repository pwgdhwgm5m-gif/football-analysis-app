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
