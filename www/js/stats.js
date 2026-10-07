/* StatLine stats engine — pure functions, no DOM. Works in browser and Node. */
(function (root) {
  'use strict';

  // ---------- Sport definitions ----------
  const SPORTS = {
    soccer: {
      label: 'Soccer',
      icon: '⚽',
      positions: ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'],
      sideLabel: 'Preferred foot',
      sideOptions: ['Right', 'Left', 'Both'],
      // raw counters stored per game
      keys: [
        'goals', 'assists', 'shots', 'shotsOn', 'keyPasses', 'passCmp', 'passAtt',
        'dribCmp', 'dribAtt', 'tackles', 'interceptions', 'clearances',
        'foulsCommitted', 'foulsWon', 'offsides', 'yellow', 'red', 'saves', 'goalsConceded'
      ],
      keyLabels: {
        goals: 'Goals', assists: 'Assists', shots: 'Shots', shotsOn: 'Shots on target',
        keyPasses: 'Key passes', passCmp: 'Passes completed', passAtt: 'Passes attempted',
        dribCmp: 'Dribbles completed', dribAtt: 'Dribbles attempted', tackles: 'Tackles won',
        interceptions: 'Interceptions', clearances: 'Clearances',
        foulsCommitted: 'Fouls committed', foulsWon: 'Fouls won', offsides: 'Offsides',
        yellow: 'Yellow cards', red: 'Red cards', saves: 'Saves', goalsConceded: 'Goals conceded'
      },
      // live-tracker tiles: deltas applied to raw counters
      tiles: [
        { id: 'goal', label: 'Goal', cls: 'good', d: { goals: 1, shots: 1, shotsOn: 1 }, show: s => s.goals },
        { id: 'assist', label: 'Assist', cls: 'good', d: { assists: 1 }, show: s => s.assists },
        { id: 'shotOn', label: 'Shot on target', d: { shots: 1, shotsOn: 1 }, show: s => s.shotsOn - s.goals },
        { id: 'shotOff', label: 'Shot off target', d: { shots: 1 }, show: s => s.shots - s.shotsOn },
        { id: 'passOk', label: 'Pass ✓', d: { passCmp: 1, passAtt: 1 }, show: s => s.passCmp },
        { id: 'passBad', label: 'Pass ✗', cls: 'bad', d: { passAtt: 1 }, show: s => s.passAtt - s.passCmp },
        { id: 'keyPass', label: 'Key pass', d: { keyPasses: 1 }, show: s => s.keyPasses },
        { id: 'dribOk', label: 'Dribble ✓', d: { dribCmp: 1, dribAtt: 1 }, show: s => s.dribCmp },
        { id: 'dribBad', label: 'Dribble ✗', cls: 'bad', d: { dribAtt: 1 }, show: s => s.dribAtt - s.dribCmp },
        { id: 'tackle', label: 'Tackle won', d: { tackles: 1 }, show: s => s.tackles },
        { id: 'inter', label: 'Interception', d: { interceptions: 1 }, show: s => s.interceptions },
        { id: 'clear', label: 'Clearance', d: { clearances: 1 }, show: s => s.clearances },
        { id: 'foulC', label: 'Foul committed', cls: 'bad', d: { foulsCommitted: 1 }, show: s => s.foulsCommitted },
        { id: 'foulW', label: 'Foul won', d: { foulsWon: 1 }, show: s => s.foulsWon },
        { id: 'offside', label: 'Offside', cls: 'bad', d: { offsides: 1 }, show: s => s.offsides },
        { id: 'yellow', label: 'Yellow card', cls: 'warn', d: { yellow: 1 }, show: s => s.yellow },
        { id: 'red', label: 'Red card', cls: 'bad', d: { red: 1 }, show: s => s.red },
        { id: 'save', label: 'Save', gk: true, d: { saves: 1 }, show: s => s.saves },
        { id: 'conceded', label: 'Goal conceded', gk: true, cls: 'bad', d: { goalsConceded: 1 }, show: s => s.goalsConceded }
      ]
    },
    basketball: {
      label: 'Basketball',
      icon: '🏀',
      positions: ['PG', 'SG', 'SF', 'PF', 'C'],
      sideLabel: 'Shooting hand',
      sideOptions: ['Right', 'Left'],
      keys: ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'],
      keyLabels: {
        fgm: 'Field goals made', fga: 'Field goals attempted', tpm: '3-pointers made',
        tpa: '3-pointers attempted', ftm: 'Free throws made', fta: 'Free throws attempted',
        oreb: 'Offensive rebounds', dreb: 'Defensive rebounds', ast: 'Assists',
        stl: 'Steals', blk: 'Blocks', tov: 'Turnovers', pf: 'Personal fouls'
      },
      tiles: [
        { id: 'two', label: '2PT made', cls: 'good', d: { fgm: 1, fga: 1 }, show: s => (s.fgm - s.tpm) + '/' + (s.fga - s.tpa) },
        { id: 'twoMiss', label: '2PT miss', cls: 'bad', d: { fga: 1 }, show: s => (s.fga - s.tpa) - (s.fgm - s.tpm) },
        { id: 'three', label: '3PT made', cls: 'good', d: { fgm: 1, fga: 1, tpm: 1, tpa: 1 }, show: s => s.tpm + '/' + s.tpa },
        { id: 'threeMiss', label: '3PT miss', cls: 'bad', d: { fga: 1, tpa: 1 }, show: s => s.tpa - s.tpm },
        { id: 'ft', label: 'FT made', cls: 'good', d: { ftm: 1, fta: 1 }, show: s => s.ftm + '/' + s.fta },
        { id: 'ftMiss', label: 'FT miss', cls: 'bad', d: { fta: 1 }, show: s => s.fta - s.ftm },
        { id: 'oreb', label: 'Off. rebound', d: { oreb: 1 }, show: s => s.oreb },
        { id: 'dreb', label: 'Def. rebound', d: { dreb: 1 }, show: s => s.dreb },
        { id: 'ast', label: 'Assist', d: { ast: 1 }, show: s => s.ast },
        { id: 'stl', label: 'Steal', d: { stl: 1 }, show: s => s.stl },
        { id: 'blk', label: 'Block', d: { blk: 1 }, show: s => s.blk },
        { id: 'tov', label: 'Turnover', cls: 'bad', d: { tov: 1 }, show: s => s.tov },
        { id: 'pf', label: 'Foul', cls: 'warn', d: { pf: 1 }, show: s => s.pf }
      ]
    }
  };

  function emptyStats(sport) {
    const o = {};
    SPORTS[sport].keys.forEach(k => { o[k] = 0; });
    return o;
  }

  function applyDelta(stats, delta, sign) {
    const out = Object.assign({}, stats);
    Object.keys(delta).forEach(k => { out[k] = Math.max(0, (out[k] || 0) + sign * delta[k]); });
    return out;
  }

  function sumStats(sport, games) {
    const t = emptyStats(sport);
    let seconds = 0;
    games.forEach(g => {
      SPORTS[sport].keys.forEach(k => { t[k] += (g.stats && g.stats[k]) || 0; });
      seconds += g.seconds || 0;
    });
    return { totals: t, seconds: seconds, gp: games.length };
  }

  // ---------- Helpers ----------
  function ratio(n, d) { return d > 0 ? n / d : null; }
  function pct(n, d) { const r = ratio(n, d); return r === null ? null : r * 100; }
  function perGame(n, gp) { return gp > 0 ? n / gp : null; }
  function per90(n, secs) { return secs > 0 ? n * 5400 / secs : null; }
  function per36(n, secs) { return secs > 0 ? n * 2160 / secs : null; }

  // ---------- Derived metrics ----------
  function basketballDerived(t, secs, gp) {
    const pts = 2 * t.fgm + t.tpm + t.ftm; // 2*FGM + 3PM + FTM  (FGM includes 3PM)
    const reb = t.oreb + t.dreb;
    const tsDen = 2 * (t.fga + 0.44 * t.fta);
    // Hollinger Game Score
    const gmSc = pts + 0.4 * t.fgm - 0.7 * t.fga - 0.4 * (t.fta - t.ftm) +
      0.7 * t.oreb + 0.3 * t.dreb + t.stl + 0.7 * t.ast + 0.7 * t.blk - 0.4 * t.pf - t.tov;
    return {
      pts: pts, reb: reb,
      fgPct: pct(t.fgm, t.fga), tpPct: pct(t.tpm, t.tpa), ftPct: pct(t.ftm, t.fta),
      efgPct: t.fga > 0 ? (t.fgm + 0.5 * t.tpm) / t.fga * 100 : null,
      tsPct: tsDen > 0 ? pts / tsDen * 100 : null,
      astTov: ratio(t.ast, t.tov),
      gameScore: gmSc,
      minutes: secs / 60,
      ppg: perGame(pts, gp), rpg: perGame(reb, gp), apg: perGame(t.ast, gp),
      spg: perGame(t.stl, gp), bpg: perGame(t.blk, gp), tpg: perGame(t.tov, gp),
      mpg: gp > 0 ? secs / 60 / gp : null,
      pts36: per36(pts, secs), reb36: per36(reb, secs), ast36: per36(t.ast, secs),
      gmScAvg: gp > 0 ? gmSc / gp : null
    };
  }

  function soccerDerived(t, secs, gp) {
    return {
      goalContrib: t.goals + t.assists,
      minutes: secs / 60,
      shotAcc: pct(t.shotsOn, t.shots),
      conversion: pct(t.goals, t.shots),
      passPct: pct(t.passCmp, t.passAtt),
      dribPct: pct(t.dribCmp, t.dribAtt),
      savePct: pct(t.saves, t.saves + t.goalsConceded),
      goals90: per90(t.goals, secs), assists90: per90(t.assists, secs),
      ga90: per90(t.goals + t.assists, secs),
      shots90: per90(t.shots, secs), tackles90: per90(t.tackles, secs),
      goalsPG: perGame(t.goals, gp), assistsPG: perGame(t.assists, gp),
      mpg: gp > 0 ? secs / 60 / gp : null
    };
  }

  function derived(sport, totals, secs, gp) {
    return sport === 'basketball' ? basketballDerived(totals, secs, gp) : soccerDerived(totals, secs, gp);
  }

  function gameDerived(game) {
    return derived(game.sport, game.stats, game.seconds || 0, 1);
  }

  function fmt(v, digits, suffix) {
    if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return '–';
    return v.toFixed(digits == null ? 1 : digits) + (suffix || '');
  }

  function fmtClock(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
  }

  function resultOf(game) {
    if (game.scoreFor == null || game.scoreAgainst == null || game.scoreFor === '' || game.scoreAgainst === '') return null;
    const a = Number(game.scoreFor), b = Number(game.scoreAgainst);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return a > b ? 'W' : a < b ? 'L' : 'D';
  }

  // ---------- CSV ----------
  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function gamesToCsv(sport, players, games) {
    const byId = {};
    players.forEach(p => { byId[p.id] = p; });
    const S = SPORTS[sport];
    const extra = sport === 'basketball'
      ? ['pts', 'reb', 'fgPct', 'tpPct', 'ftPct', 'efgPct', 'tsPct', 'gameScore']
      : ['goalContrib', 'shotAcc', 'passPct', 'dribPct'];
    const head = ['date', 'player', 'number', 'position', 'team', 'opponent', 'location', 'score_for', 'score_against', 'result', 'minutes']
      .concat(S.keys).concat(extra);
    const rows = [head.map(csvCell).join(',')];
    games.filter(g => g.sport === sport).sort((a, b) => a.date < b.date ? -1 : 1).forEach(g => {
      const p = byId[g.playerId] || {};
      const d = gameDerived(g);
      const line = [g.date, p.name, p.number, p.position, p.team, g.opponent, g.location,
        g.scoreFor, g.scoreAgainst, resultOf(g), (g.seconds / 60).toFixed(1)]
        .concat(S.keys.map(k => g.stats[k] || 0))
        .concat(extra.map(k => (d[k] == null ? '' : Number(d[k]).toFixed(2))));
      rows.push(line.map(csvCell).join(','));
    });
    return rows.join('\n');
  }

  const api = {
    SPORTS, emptyStats, applyDelta, sumStats, derived, gameDerived,
    fmt, fmtClock, resultOf, gamesToCsv
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StatLine = api;
})(typeof window !== 'undefined' ? window : globalThis);
