/* StatLine app — vanilla JS, offline-first, data in localStorage. */
(function () {
  'use strict';
  const SL = window.StatLine;
  const SPORTS = SL.SPORTS;
  const STORE_KEY = 'statline.v1';
  const APP_VERSION = '1.1.0';

  // ---------- tiny DOM helper ----------
  function h(tag, attrs) {
    const e = document.createElement(tag);
    const kids = Array.prototype.slice.call(arguments, 2);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v == null || v === false || k === 'value' || k === 'checked') return;
        if (k === 'class') e.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) return add(c);
        e.append(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    if (attrs && attrs.value !== undefined && attrs.value !== null) e.value = attrs.value;
    if (attrs && attrs.checked) e.checked = true;
    return e;
  }
  const $ = function (s) { return document.querySelector(s); };

  // ---------- storage ----------
  let db = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return { players: d.players || [], games: d.games || [] };
      }
    } catch (e) { /* fall through */ }
    return { players: [], games: [] };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
    catch (e) { toast('⚠️ Could not save — storage full?'); }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(s) {
    if (!s) return '';
    const p = s.split('-');
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const player = function (id) { return db.players.find(function (p) { return p.id === id; }); };
  const game = function (id) { return db.games.find(function (g) { return g.id === id; }); };
  const playerGames = function (id) {
    return db.games.filter(function (g) { return g.playerId === id; })
      .sort(function (a, b) { return a.date === b.date ? a.created - b.created : (a.date < b.date ? -1 : 1); });
  };
  function gameSecs(g) { return (g.seconds || 0) + (g.runningSince ? (Date.now() - g.runningSince) / 1000 : 0); }

  // ---------- toast / sheet ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function openSheet(title, body, onClose) {
    closeSheet();
    const wrap = h('div', { id: 'sheetWrap', onclick: function (e) { if (e.target === wrap) closeSheet(); } },
      h('div', { class: 'sheet' }, h('h3', null, title), body));
    document.body.append(wrap);
    wrap._onClose = onClose;
  }
  function closeSheet() {
    const w = $('#sheetWrap'); if (w) { w.remove(); }
  }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* ignore */ } }

  // ---------- view plumbing ----------
  let cleanup = null;
  function setChrome(opts) {
    $('#title').textContent = opts.title || 'StatLine';
    $('#backBtn').hidden = !opts.back;
    document.body.classList.toggle('hide-tabs', !!opts.hideTabs);
    document.body.dataset.sport = opts.sport || '';
    document.querySelectorAll('#tabbar a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.tab === opts.tab);
    });
    const ta = $('#topActions'); ta.textContent = '';
    (opts.actions || []).forEach(function (a) { ta.append(a); });
  }
  function render(node) {
    const v = $('#view'); v.textContent = ''; v.append(node); v.scrollTop = 0;
  }
  function go(hash) { location.hash = hash; }

  function router() {
    if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
    closeSheet();
    const parts = (location.hash || '#/players').slice(1).split('/');
    const name = parts[1] || 'players', arg = parts[2];
    switch (name) {
      case 'player': return viewPlayer(arg);
      case 'games': return viewGames();
      case 'newgame': return viewNewGame(arg);
      case 'game': return viewGame(arg);
      case 'settings': return viewSettings();
      default: return viewPlayers();
    }
  }
  function notFound() {
    setChrome({ title: 'Not found', back: true, tab: 'players' });
    render(h('div', { class: 'empty' }, h('div', { class: 'big' }, '🤷'), 'That page no longer exists.'));
  }

  // ---------- shared stat presentation ----------
  function statCards(sport, totals, secs, gp, avg, isGK) {
    const d = SL.derived(sport, totals, secs, gp), f = SL.fmt, t = totals;
    const c = function (label, val, hl) { return { label: label, val: val, hl: hl }; };
    if (sport === 'basketball') {
      const L = avg
        ? { pts: 'PPG', reb: 'RPG', ast: 'APG', stl: 'SPG', blk: 'BPG', tov: 'TOPG', min: 'MPG' }
        : { pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tov: 'TOV', min: 'MIN' };
      const v = avg
        ? { pts: d.ppg, reb: d.rpg, ast: d.apg, stl: d.spg, blk: d.bpg, tov: d.tpg, min: d.mpg }
        : { pts: d.pts, reb: d.reb, ast: t.ast, stl: t.stl, blk: t.blk, tov: t.tov, min: d.minutes };
      const n = function (x) { return avg ? f(x, 1) : (x === null ? '–' : String(Math.round(x * 10) / 10)); };
      return [
        c(L.pts, n(v.pts), true), c(L.reb, n(v.reb), true), c(L.ast, n(v.ast), true),
        c(L.stl, n(v.stl)), c(L.blk, n(v.blk)), c(L.tov, n(v.tov)),
        c('FG%', f(d.fgPct, 1)), c('3P%', f(d.tpPct, 1)), c('FT%', f(d.ftPct, 1)),
        c('eFG%', f(d.efgPct, 1)), c('TS%', f(d.tsPct, 1)), c('AST/TO', f(d.astTov, 2)),
        c(L.min, f(v.min, 1)), c(avg ? 'GmSc avg' : 'GmSc', f(avg ? d.gmScAvg : d.gameScore, 1)),
        c('PTS/36', f(d.pts36, 1))
      ];
    }
    const out = [
      c('Goals', t.goals, true), c('Assists', t.assists, true), c('G+A', d.goalContrib, true),
      c('Minutes', Math.round(d.minutes)), c('Shots', t.shots), c('Shot acc.', f(d.shotAcc, 0, '%')),
      c('Pass %', f(d.passPct, 0, '%')), c('Key passes', t.keyPasses), c('Dribble %', f(d.dribPct, 0, '%')),
      c('Tackles', t.tackles), c('Intercepts', t.interceptions), c('Clearances', t.clearances),
      c('Fouls C/W', t.foulsCommitted + '/' + t.foulsWon), c('Cards Y/R', t.yellow + '/' + t.red),
      c('Offsides', t.offsides), c('Goals/90', f(d.goals90, 2)), c('G+A/90', f(d.ga90, 2)),
      c('Conversion', f(d.conversion, 0, '%'))
    ];
    if (isGK || t.saves || t.goalsConceded) {
      out.push(c('Saves', t.saves), c('Conceded', t.goalsConceded), c('Save %', f(d.savePct, 0, '%')));
    }
    return out;
  }
  function renderCards(cards) {
    return h('div', { class: 'stats-grid' }, cards.map(function (c) {
      return h('div', { class: 'stat' + (c.hl ? ' hl' : '') }, h('b', null, c.val), h('span', null, c.label));
    }));
  }
  function totalsTable(sport, totals) {
    const S = SPORTS[sport];
    return h('table', { class: 'totals' }, S.keys.map(function (k) {
      return h('tr', null, h('td', null, S.keyLabels[k]), h('td', null, totals[k]));
    }));
  }
  function gameLine(g) {
    const t = g.stats, d = SL.gameDerived(g);
    if (g.sport === 'basketball') {
      return d.pts + ' PTS · ' + d.reb + ' REB · ' + t.ast + ' AST · ' + t.fgm + '/' + t.fga + ' FG';
    }
    const bits = [t.goals + ' G', t.assists + ' A', t.shots + ' SH'];
    if (t.passAtt) bits.push(SL.fmt(d.passPct, 0, '%') + ' PASS');
    if (g.position === 'GK' || t.saves) bits.push(t.saves + ' SV');
    bits.push(Math.round(gameSecs(g) / 60) + "'");
    return bits.join(' · ');
  }
  function sparkline(sport, games) {
    if (!games.length) return null;
    const vals = games.map(function (g) {
      const d = SL.gameDerived(g);
      return sport === 'basketball' ? d.pts : d.goalContrib;
    });
    const max = Math.max(1, Math.max.apply(null, vals));
    const W = 300, H = 70, n = vals.length, bw = Math.min(26, (W - 10) / n - 4);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'spark');
    vals.forEach(function (v, i) {
      const x = 5 + i * ((W - 10) / n) + ((W - 10) / n - bw) / 2;
      const bh = Math.max(2, (v / max) * (H - 22));
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', H - 12 - bh); r.setAttribute('width', bw); r.setAttribute('height', bh); r.setAttribute('rx', 3);
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', x + bw / 2); tx.setAttribute('y', H - 1); tx.textContent = v;
      svg.append(r, tx);
    });
    return svg;
  }
  function gameRow(g, showPlayer) {
    const p = player(g.playerId) || { name: 'Unknown' };
    const res = SL.resultOf(g);
    return h('a', { class: 'card tap', href: '#/game/' + g.id, 'data-sport': g.sport },
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('div', { class: 'ellipsis' }, h('b', null, (showPlayer ? p.name + ' · ' : '') + 'vs ' + (g.opponent || 'Opponent'))),
          h('div', { class: 'small muted' }, fmtDate(g.date) + (g.location ? ' · ' + g.location : '')),
          h('div', { class: 'small', style: 'margin-top:4px' }, gameLine(g))),
        g.status === 'live' ? h('span', { class: 'chip live' }, '● LIVE') : null,
        res ? h('span', { class: 'chip ' + res }, res + ' ' + g.scoreFor + '–' + g.scoreAgainst) : null));
  }

  // ---------- Players list ----------
  let playerFilter = 'all';
  function viewPlayers() {
    setChrome({
      title: 'Players', tab: 'players',
      actions: [h('button', { class: 'icon-btn', 'aria-label': 'Add player', onclick: function () { playerForm(); } }, '+')]
    });
    const wrap = h('div');
    const seg = h('div', { class: 'seg' }, ['all', 'soccer', 'basketball'].map(function (k) {
      return h('button', {
        class: playerFilter === k ? 'on' : '',
        onclick: function () { playerFilter = k; viewPlayers(); }
      }, k === 'all' ? 'All' : SPORTS[k].icon + ' ' + SPORTS[k].label);
    }));
    wrap.append(seg);
    const list = db.players.filter(function (p) { return playerFilter === 'all' || p.sport === playerFilter; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!list.length) {
      wrap.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, '🏟️'),
        h('p', null, 'No players yet. Create a profile for each player you want to track.'),
        h('button', { class: 'primary', onclick: function () { playerForm(); } }, '+ Add player')));
    }
    list.forEach(function (p) {
      const gs = playerGames(p.id), S = SPORTS[p.sport];
      const agg = SL.sumStats(p.sport, gs), d = SL.derived(p.sport, agg.totals, agg.seconds, agg.gp);
      const line = !gs.length ? 'No games yet'
        : p.sport === 'basketball'
          ? SL.fmt(d.ppg, 1) + ' PPG · ' + SL.fmt(d.rpg, 1) + ' RPG · ' + SL.fmt(d.apg, 1) + ' APG'
          : agg.totals.goals + ' G · ' + agg.totals.assists + ' A · ' + agg.gp + ' apps';
      wrap.append(h('a', { class: 'card tap', href: '#/player/' + p.id, 'data-sport': p.sport },
        h('div', { class: 'row' },
          h('div', { class: 'badge' }, p.number !== '' && p.number != null ? p.number : S.icon),
          h('div', { class: 'grow' },
            h('div', { class: 'ellipsis' }, h('b', null, p.name)),
            h('div', { class: 'small muted ellipsis' }, S.icon + ' ' + [p.position, p.team].filter(Boolean).join(' · ')),
            h('div', { class: 'small' }, line)),
          h('span', { class: 'muted' }, '›'))));
    });
    render(wrap);
  }

  function playerForm(existing) {
    const p = existing || { name: '', sport: playerFilter === 'basketball' ? 'basketball' : 'soccer', number: '', position: '', team: '', side: '', height: '', notes: '' };
    const hasGames = existing && playerGames(existing.id).length > 0;
    let sport = p.sport;
    const name = h('input', { type: 'text', value: p.name, placeholder: 'Full name', autocomplete: 'off' });
    const num = h('input', { type: 'number', inputmode: 'numeric', value: p.number, placeholder: '#' });
    const team = h('input', { type: 'text', value: p.team, placeholder: 'Team / club' });
    const pos = h('select');
    const side = h('select');
    const sideLbl = h('span');
    const height = h('input', { type: 'text', value: p.height, placeholder: 'e.g. 178 cm' });
    const notes = h('textarea', { placeholder: 'Notes (strengths, goals, injuries…)' });
    notes.value = p.notes || '';
    function fillSport() {
      const S = SPORTS[sport];
      pos.textContent = ''; side.textContent = '';
      pos.append(h('option', { value: '' }, '—'));
      S.positions.forEach(function (x) { pos.append(h('option', { value: x }, x)); });
      pos.value = S.positions.indexOf(p.position) >= 0 ? p.position : '';
      side.append(h('option', { value: '' }, '—'));
      S.sideOptions.forEach(function (x) { side.append(h('option', { value: x }, x)); });
      side.value = S.sideOptions.indexOf(p.side) >= 0 ? p.side : '';
      sideLbl.textContent = S.sideLabel;
    }
    const sportSeg = h('div', { class: 'seg' });
    function drawSeg() {
      sportSeg.textContent = '';
      ['soccer', 'basketball'].forEach(function (k) {
        sportSeg.append(h('button', {
          type: 'button', class: sport === k ? 'on' : '', disabled: hasGames && sport !== k,
          onclick: function () { sport = k; drawSeg(); fillSport(); }
        }, SPORTS[k].icon + ' ' + SPORTS[k].label));
      });
    }
    drawSeg(); fillSport();
    const body = h('div', null,
      h('label', { class: 'field' }, h('span', null, 'Name *'), name),
      h('label', { class: 'field' }, h('span', null, 'Sport' + (hasGames ? ' (locked — player has games)' : '')), sportSeg),
      h('div', { class: 'two' },
        h('label', { class: 'field' }, h('span', null, 'Jersey #'), num),
        h('label', { class: 'field' }, h('span', null, 'Position'), pos)),
      h('label', { class: 'field' }, h('span', null, 'Team'), team),
      h('div', { class: 'two' },
        h('label', { class: 'field' }, sideLbl, side),
        h('label', { class: 'field' }, h('span', null, 'Height'), height)),
      h('label', { class: 'field' }, h('span', null, 'Notes'), notes),
      h('div', { class: 'btn-row' },
        h('button', { onclick: closeSheet }, 'Cancel'),
        h('button', {
          class: 'primary', onclick: function () {
            if (!name.value.trim()) { toast('Enter a name'); return; }
            const rec = existing || { id: uid(), created: Date.now() };
            Object.assign(rec, {
              name: name.value.trim(), sport: sport, number: num.value.trim(), position: pos.value,
              team: team.value.trim(), side: side.value, height: height.value.trim(), notes: notes.value.trim()
            });
            if (!existing) db.players.push(rec);
            save(); closeSheet(); toast(existing ? 'Player updated' : 'Player added');
            if (existing) viewPlayer(rec.id); else go('#/player/' + rec.id);
          }
        }, 'Save')));
    openSheet(existing ? 'Edit player' : 'New player', body);
  }

  // ---------- Player profile ----------
  let profileRange = 'all';
  function viewPlayer(id) {
    const p = player(id); if (!p) return notFound();
    const S = SPORTS[p.sport];
    setChrome({
      title: p.name, back: true, tab: 'players', sport: p.sport,
      actions: [h('button', { class: 'icon-btn', 'aria-label': 'Edit', onclick: function () { playerForm(p); } }, '✎')]
    });
    const all = playerGames(id);
    const gs = profileRange === 'last5' ? all.slice(-5) : all;
    const agg = SL.sumStats(p.sport, gs);
    const w = h('div', { 'data-sport': p.sport });
    w.append(h('div', { class: 'card' }, h('div', { class: 'row' },
      h('div', { class: 'badge' }, p.number !== '' ? p.number : S.icon),
      h('div', { class: 'grow' },
        h('b', null, p.name),
        h('div', { class: 'small muted' }, S.icon + ' ' + S.label + (p.position ? ' · ' + p.position : '') + (p.team ? ' · ' + p.team : '')),
        h('div', { class: 'small muted' }, [p.side ? S.sideLabel + ': ' + p.side : '', p.height].filter(Boolean).join(' · '))))));
    if (p.notes) w.append(h('div', { class: 'card small' }, p.notes));
    w.append(h('button', { class: 'primary block', onclick: function () { go('#/newgame/' + id); } }, '▶ Start new game'));
    w.append(h('button', { class: 'block', style: 'margin-top:8px', onclick: function () { aiSheet(p, {}); } }, '✨ AI analysis' + (p.ai ? ' (saved)' : '')));

    w.append(h('h2', null, 'Performance'));
    w.append(h('div', { class: 'seg' },
      h('button', { class: profileRange === 'all' ? 'on' : '', onclick: function () { profileRange = 'all'; viewPlayer(id); } }, 'All games (' + all.length + ')'),
      h('button', { class: profileRange === 'last5' ? 'on' : '', onclick: function () { profileRange = 'last5'; viewPlayer(id); } }, 'Last 5')));
    if (!gs.length) {
      w.append(h('div', { class: 'empty' }, 'No games recorded yet.'));
    } else {
      w.append(h('div', { class: 'small muted', style: 'margin:0 2px 8px' },
        agg.gp + ' game' + (agg.gp === 1 ? '' : 's') + (p.sport === 'basketball' ? ' · per-game averages' : ' · season totals & per-90 rates')));
      w.append(renderCards(statCards(p.sport, agg.totals, agg.seconds, agg.gp, p.sport === 'basketball', p.position === 'GK')));
      const sp = sparkline(p.sport, gs);
      w.append(h('h2', null, p.sport === 'basketball' ? 'Points per game' : 'Goal contributions per game'));
      w.append(h('div', { class: 'card' }, sp));
      w.append(h('h2', null, 'Totals'));
      w.append(h('div', { class: 'card' }, totalsTable(p.sport, agg.totals)));
      w.append(h('h2', null, 'Game log'));
      gs.slice().reverse().forEach(function (g) { w.append(gameRow(g, false)); });
    }
    w.append(h('div', { class: 'btn-row', style: 'margin-top:20px' },
      h('button', {
        class: 'danger', onclick: function () {
          if (!confirm('Delete ' + p.name + ' and all of their games? This cannot be undone.')) return;
          db.games = db.games.filter(function (g) { return g.playerId !== id; });
          db.players = db.players.filter(function (x) { return x.id !== id; });
          save(); toast('Player deleted'); go('#/players');
        }
      }, 'Delete player')));
    render(w);
  }

  // ---------- Games list ----------
  let gamesFilter = 'all';
  function viewGames() {
    setChrome({ title: 'Games', tab: 'games' });
    const w = h('div');
    w.append(h('div', { class: 'seg' }, ['all', 'soccer', 'basketball'].map(function (k) {
      return h('button', { class: gamesFilter === k ? 'on' : '', onclick: function () { gamesFilter = k; viewGames(); } },
        k === 'all' ? 'All' : SPORTS[k].icon + ' ' + SPORTS[k].label);
    })));
    const list = db.games.filter(function (g) { return gamesFilter === 'all' || g.sport === gamesFilter; })
      .sort(function (a, b) { return a.date === b.date ? b.created - a.created : (a.date < b.date ? 1 : -1); });
    if (!list.length) {
      w.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, '📋'),
        db.players.length ? 'No games yet. Open a player and tap “Start new game”.' : 'Add a player first, then start tracking games.'));
    }
    list.forEach(function (g) { w.append(gameRow(g, true)); });
    render(w);
  }

  // ---------- New game ----------
  function viewNewGame(playerId) {
    setChrome({ title: 'New game', back: true, tab: 'games', hideTabs: true });
    if (!db.players.length) {
      render(h('div', { class: 'empty' }, h('div', { class: 'big' }, '👤'), 'Add a player first.',
        h('p', null, h('button', { class: 'primary', onclick: function () { go('#/players'); } }, 'Go to players'))));
      return;
    }
    const sel = h('select');
    db.players.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (p) {
      sel.append(h('option', { value: p.id }, SPORTS[p.sport].icon + ' ' + p.name + (p.number !== '' ? ' (#' + p.number + ')' : '')));
    });
    sel.value = player(playerId) ? playerId : db.players[0].id;
    const date = h('input', { type: 'date', value: todayStr() });
    const opp = h('input', { type: 'text', placeholder: 'Opponent', autocomplete: 'off' });
    const loc = h('input', { type: 'text', placeholder: 'Venue / home or away' });
    render(h('div', null,
      h('label', { class: 'field' }, h('span', null, 'Player'), sel),
      h('div', { class: 'two' },
        h('label', { class: 'field' }, h('span', null, 'Date'), date),
        h('label', { class: 'field' }, h('span', null, 'Opponent'), opp)),
      h('label', { class: 'field' }, h('span', null, 'Location'), loc),
      h('button', {
        class: 'primary block', onclick: function () {
          const p = player(sel.value);
          const g = {
            id: uid(), created: Date.now(), playerId: p.id, sport: p.sport, position: p.position,
            date: date.value || todayStr(), opponent: opp.value.trim(), location: loc.value.trim(),
            scoreFor: '', scoreAgainst: '', status: 'live', seconds: 0, runningSince: null,
            stats: SL.emptyStats(p.sport), log: [], notes: ''
          };
          db.games.push(g); save(); go('#/game/' + g.id);
        }
      }, '▶ Start tracking')));
  }

  // ---------- Game: live tracker / box score ----------
  const GROUPS = {
    soccer: [
      ['Attack', ['goal', 'assist', 'shotOn', 'shotOff', 'keyPass', 'dribOk', 'dribBad']],
      ['Passing', ['passOk', 'passBad']],
      ['Defending', ['tackle', 'inter', 'clear']],
      ['Discipline', ['foulC', 'foulW', 'offside', 'yellow', 'red']],
      ['Goalkeeping', ['save', 'conceded']]
    ],
    basketball: [
      ['Scoring', ['two', 'twoMiss', 'three', 'threeMiss', 'ft', 'ftMiss']],
      ['Rebounds, playmaking & defense', ['oreb', 'dreb', 'ast', 'stl', 'blk']],
      ['Mistakes', ['tov', 'pf']]
    ]
  };

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* not supported */ }
  }

  function viewGame(id) {
    const g = game(id); if (!g) return notFound();
    const p = player(g.playerId) || { name: 'Unknown player', position: '', number: '' };
    const S = SPORTS[g.sport];
    const live = g.status === 'live';
    setChrome({
      title: p.name, back: true, tab: 'games', sport: g.sport, hideTabs: live,
      actions: [h('button', { class: 'icon-btn', 'aria-label': 'Game options', onclick: function () { gameMenu(g); } }, '⋯')]
    });
    const w = h('div', { 'data-sport': g.sport });
    const clockEl = h('div', { class: 'clock' });
    const summaryEl = h('div', { class: 'summary' });
    const tileEls = {};
    let timerBtn;

    function setScore(key, val) { g[key] = val === '' ? '' : Math.max(0, parseInt(val, 10) || 0); save(); }
    const sf = h('input', { class: 'score-in', type: 'number', inputmode: 'numeric', value: g.scoreFor, placeholder: '–', 'aria-label': 'Our score', onchange: function (e) { setScore('scoreFor', e.target.value); } });
    const sa = h('input', { class: 'score-in', type: 'number', inputmode: 'numeric', value: g.scoreAgainst, placeholder: '–', 'aria-label': 'Opponent score', onchange: function (e) { setScore('scoreAgainst', e.target.value); } });

    function refresh() {
      clockEl.textContent = SL.fmtClock(gameSecs(g));
      if (timerBtn) timerBtn.textContent = g.runningSince ? '⏸ Pause' : (g.seconds > 0 ? '▶ Resume' : '▶ Start clock');
      const d = SL.gameDerived(Object.assign({}, g, { seconds: gameSecs(g) })), t = g.stats;
      const items = g.sport === 'basketball'
        ? [['PTS', d.pts], ['REB', d.reb], ['AST', t.ast], ['FG', t.fgm + '/' + t.fga], ['3P', t.tpm + '/' + t.tpa], ['FT', t.ftm + '/' + t.fta]]
        : [['G', t.goals], ['A', t.assists], ['SOT', t.shotsOn + '/' + t.shots], ['PASS', t.passAtt ? SL.fmt(d.passPct, 0, '%') : '–'], ['TKL', t.tackles]];
      summaryEl.textContent = '';
      items.forEach(function (it) { summaryEl.append(h('div', null, h('b', null, it[1]), h('span', null, it[0]))); });
      S.tiles.forEach(function (tile) { if (tileEls[tile.id]) tileEls[tile.id].textContent = tile.show(t); });
    }

    function tick() { clockEl.textContent = SL.fmtClock(gameSecs(g)); }
    function toggleClock() {
      if (g.runningSince) { g.seconds = gameSecs(g); g.runningSince = null; keepAwake(false); }
      else { g.runningSince = Date.now(); keepAwake(true); }
      save(); refresh();
    }

    // header
    const head = h('div', { class: 'live-head' },
      h('div', { class: 'row' },
        h('div', { class: 'grow' }, clockEl,
          h('div', { class: 'small muted' }, (p.number !== '' ? '#' + p.number + ' ' : '') + (p.position || '') + ' · vs ' + (g.opponent || 'Opponent') + ' · ' + fmtDate(g.date))),
        live ? (timerBtn = h('button', { class: 'primary', onclick: toggleClock })) : h('span', { class: 'chip' }, 'FINAL')),
      summaryEl);
    w.append(head);

    w.append(h('div', { class: 'card row' },
      h('span', { class: 'grow muted small' }, 'Score (us – ' + (g.opponent || 'opp') + ')'),
      sf, h('span', null, '–'), sa));

    if (live) {
      const showGK = p.position === 'GK';
      GROUPS[g.sport].forEach(function (grp) {
        if (grp[0] === 'Goalkeeping' && !showGK) return;
        w.append(h('h2', null, grp[0]));
        const grid = h('div', { class: 'tiles' });
        grp[1].forEach(function (tid) {
          const tile = S.tiles.filter(function (x) { return x.id === tid; })[0];
          const cnt = h('div', { class: 'cnt' });
          tileEls[tid] = cnt;
          grid.append(h('button', {
            class: 'tile ' + (tile.cls || ''), onclick: function () {
              g.stats = SL.applyDelta(g.stats, tile.d, 1);
              g.log = (g.log || []).concat(tid).slice(-400);
              save(); refresh(); vibrate();
            }
          }, h('div', { class: 'lbl' }, tile.label), cnt));
        });
        w.append(grid);
      });
      if (g.sport === 'soccer' && !showGK) {
        w.append(h('div', { class: 'small muted', style: 'margin-top:12px' }, 'Goalkeeper stats appear when the player’s position is GK.'));
      }
      w.append(h('div', { class: 'btn-row', style: 'margin-top:16px' },
        h('button', {
          onclick: function () {
            const last = (g.log || []).pop(); if (!last) { toast('Nothing to undo'); return; }
            const tile = S.tiles.filter(function (x) { return x.id === last; })[0];
            g.stats = SL.applyDelta(g.stats, tile.d, -1); save(); refresh(); vibrate(20); toast('Undid: ' + tile.label);
          }
        }, '↩ Undo last'),
        h('button', { onclick: function () { editTotals(g, function () { viewGame(id); }); } }, '✎ Edit totals')));
      w.append(h('button', {
        class: 'primary block', style: 'margin-top:4px', onclick: function () {
          if (!confirm('Finish this game? You can reopen it later.')) return;
          g.seconds = gameSecs(g); g.runningSince = null; g.status = 'final'; keepAwake(false); save(); viewGame(id);
        }
      }, '🏁 Finish game'));
    } else {
      w.append(h('h2', null, 'Box score'));
      w.append(renderCards(statCards(g.sport, g.stats, g.seconds || 0, 1, false, p.position === 'GK')));
      w.append(h('h2', null, 'Totals'));
      w.append(h('div', { class: 'card' }, totalsTable(g.sport, g.stats)));
      const notes = h('textarea', { placeholder: 'Game notes…' }); notes.value = g.notes || '';
      notes.addEventListener('change', function () { g.notes = notes.value; save(); });
      w.append(h('h2', null, 'Notes'), notes);
      if (player(g.playerId)) w.append(h('button', { class: 'block', style: 'margin-top:12px', onclick: function () { aiSheet(player(g.playerId), { game: g }); } }, '✨ Analyze this game' + (g.ai ? ' (saved)' : '')));
      w.append(h('div', { class: 'btn-row', style: 'margin-top:16px' },
        h('button', { onclick: function () { editTotals(g, function () { viewGame(id); }); } }, '✎ Edit totals'),
        h('button', { onclick: function () { g.status = 'live'; save(); viewGame(id); } }, '↻ Reopen')));
    }
    render(w);
    refresh();
    if (live && g.runningSince) keepAwake(true);
    const iv = setInterval(tick, 250);
    const vis = function () { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', vis);
    cleanup = function () { clearInterval(iv); document.removeEventListener('visibilitychange', vis); keepAwake(false); };
  }

  function gameMenu(g) {
    const body = h('div', null,
      h('div', { class: 'btn-row' }, h('button', {
        onclick: function () { closeSheet(); editInfo(g); }
      }, '✎ Edit game details')),
      h('div', { class: 'btn-row' }, h('button', {
        class: 'danger', onclick: function () {
          if (!confirm('Delete this game?')) return;
          db.games = db.games.filter(function (x) { return x.id !== g.id; });
          save(); closeSheet(); toast('Game deleted'); go('#/player/' + g.playerId);
        }
      }, 'Delete game')));
    openSheet('Game options', body);
  }
  function editInfo(g) {
    const date = h('input', { type: 'date', value: g.date });
    const opp = h('input', { type: 'text', value: g.opponent });
    const loc = h('input', { type: 'text', value: g.location });
    openSheet('Game details', h('div', null,
      h('label', { class: 'field' }, h('span', null, 'Date'), date),
      h('label', { class: 'field' }, h('span', null, 'Opponent'), opp),
      h('label', { class: 'field' }, h('span', null, 'Location'), loc),
      h('div', { class: 'btn-row' }, h('button', { onclick: closeSheet }, 'Cancel'),
        h('button', {
          class: 'primary', onclick: function () {
            g.date = date.value || g.date; g.opponent = opp.value.trim(); g.location = loc.value.trim();
            save(); closeSheet(); viewGame(g.id);
          }
        }, 'Save'))));
  }
  function editTotals(g, done) {
    const S = SPORTS[g.sport];
    const inputs = {};
    const mins = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: '0.5', value: Math.round(gameSecs(g) / 6) / 10 });
    const body = h('div', null, h('label', { class: 'field' }, h('span', null, 'Minutes played'), mins));
    const grid = h('div', { class: 'two' });
    S.keys.forEach(function (k) {
      inputs[k] = h('input', { type: 'number', inputmode: 'numeric', min: 0, value: g.stats[k] || 0 });
      grid.append(h('label', { class: 'field' }, h('span', null, S.keyLabels[k]), inputs[k]));
    });
    body.append(grid, h('div', { class: 'small muted', style: 'margin-bottom:10px' },
      g.sport === 'basketball' ? 'Field goals include 3-pointers (FGM ≥ 3PM). Points are calculated automatically.' : 'Shots include goals; shots on target include goals.'));
    body.append(h('div', { class: 'btn-row' }, h('button', { onclick: closeSheet }, 'Cancel'),
      h('button', {
        class: 'primary', onclick: function () {
          const next = {};
          S.keys.forEach(function (k) { next[k] = Math.max(0, parseInt(inputs[k].value, 10) || 0); });
          if (g.sport === 'basketball') {
            next.fga = Math.max(next.fga, next.fgm); next.tpa = Math.max(next.tpa, next.tpm);
            next.fgm = Math.max(next.fgm, next.tpm); next.fga = Math.max(next.fga, next.tpa);
            next.fta = Math.max(next.fta, next.ftm);
          } else {
            next.shots = Math.max(next.shots, next.shotsOn, next.goals);
            next.shotsOn = Math.max(next.shotsOn, next.goals);
            next.passAtt = Math.max(next.passAtt, next.passCmp);
            next.dribAtt = Math.max(next.dribAtt, next.dribCmp);
          }
          g.stats = next; g.log = [];
          const m = Math.max(0, parseFloat(mins.value) || 0);
          g.seconds = Math.round(m * 60); if (g.runningSince) g.runningSince = Date.now();
          save(); closeSheet(); toast('Totals updated'); done();
        }
      }, 'Save')));
    openSheet('Edit totals', body);
  }

  // ---------- Settings / data ----------
  function isNative() { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  async function shareFile(filename, text, mime) {
    try {
      if (isNative() && window.Capacitor.Plugins.Filesystem && window.Capacitor.Plugins.Share) {
        const r = await window.Capacitor.Plugins.Filesystem.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
        await window.Capacitor.Plugins.Share.share({ title: filename, url: r.uri, dialogTitle: 'Export ' + filename });
        return;
      }
      const blob = new Blob([text], { type: mime });
      const a = h('a', { href: URL.createObjectURL(blob), download: filename });
      document.body.append(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast('Exported ' + filename);
    } catch (e) { toast('Export failed: ' + (e && e.message ? e.message : e)); }
  }


  // ---------- AI analysis (bring-your-own Anthropic API key) ----------
  const AI_KEY = 'statline.ai.v1';   // { key, model, anonymize } — never part of backups
  function aiCfg() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(AI_KEY) || '{}') || {}; } catch (e) { c = {}; }
    return { key: c.key || '', model: c.model || window.StatLineAI.DEFAULT_MODEL, anonymize: c.anonymize !== false };
  }
  function aiSave(c) {
    try { localStorage.setItem(AI_KEY, JSON.stringify(c)); } catch (e) { toast('⚠️ Could not save AI settings'); }
  }
  function aiRender(text) {
    const box = h('div', { class: 'ai-out' });
    window.StatLineAI.parseMarkdown(text).forEach(function (n) {
      const runs = (n.runs || []).map(function (r) { return r.b ? h('b', null, r.text) : r.text; });
      if (n.t === 'h') box.append(h('h4', null, n.text));
      else if (n.t === 'li') box.append(h('div', { class: 'ai-li' }, h('span', null, '•'), h('div', null, runs)));
      else box.append(h('p', null, runs));
    });
    return box;
  }
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, function () { toast('Copy failed'); }); return; }
    } catch (e) { /* fall through */ }
    toast('Copy not available');
  }
  // target = the player or game object; analysis is stored at target.ai = {text, model, at, focus}
  function aiSheet(p, opts) {
    const AI = window.StatLineAI;
    const cfg = aiCfg();
    const target = opts.game || p;
    const finals = playerGames(p.id).filter(function (g) { return g.status === 'final'; });
    const body = h('div', null);
    if (!cfg.key) {
      body.append(h('p', { class: 'small' }, 'AI analysis needs your own Anthropic API key. Add it once in Data ▸ AI analysis.'),
        h('button', { class: 'primary block', onclick: function () { closeSheet(); go('#/settings'); } }, 'Open AI settings'));
      openSheet('✨ AI analysis', body); return;
    }
    if (!finals.length) {
      body.append(h('p', { class: 'small' }, 'Finish at least one game first — the analysis uses completed games only.'));
      openSheet('✨ AI analysis', body); return;
    }
    let focus = opts.game ? 'game' : 'overview';
    const result = h('div');
    const q = h('textarea', { placeholder: 'Optional question, e.g. “Why is my shooting inconsistent?”', maxlength: '500' });
    const seg = h('div', { class: 'seg' });
    const foci = opts.game ? ['game', 'training'] : ['overview', 'strengths', 'training', 'scouting'];
    function drawSeg() {
      seg.textContent = '';
      foci.forEach(function (k) {
        seg.append(h('button', { class: focus === k ? 'on' : '', onclick: function () { focus = k; drawSeg(); } }, AI.FOCI[k].label));
      });
    }
    drawSeg();
    function showSaved() {
      result.textContent = '';
      if (target.ai && target.ai.text) {
        result.append(h('div', { class: 'small muted', style: 'margin:8px 0' },
          'Saved analysis · ' + (AI.FOCI[target.ai.focus] ? AI.FOCI[target.ai.focus].label : '') + ' · ' + target.ai.model + ' · ' + new Date(target.ai.at).toLocaleString()),
          aiRender(target.ai.text),
          h('div', { class: 'btn-row' }, h('button', { onclick: function () { copyText(target.ai.text); } }, 'Copy')));
      }
    }
    let busy = false;
    const run = h('button', { class: 'primary block' }, '✨ Analyze');
    run.addEventListener('click', function () {
      if (busy) return;
      busy = true; run.disabled = true; run.textContent = 'Analyzing…';
      result.textContent = ''; result.append(h('div', { class: 'small muted', style: 'margin:10px 0' }, 'Asking Claude… this can take 10–30 seconds.'));
      const c = aiCfg();
      const payload = AI.buildPayload(p, playerGames(p.id), { anonymize: c.anonymize, gameId: opts.game ? opts.game.id : null });
      AI.callClaude({ key: c.key, model: c.model, user: AI.buildUserMessage(payload, { focus: focus, question: q.value }) })
        .then(function (text) {
          target.ai = { text: text, model: c.model, at: Date.now(), focus: focus }; save();
          showSaved();
        })
        .catch(function (err) {
          result.textContent = '';
          result.append(h('div', { class: 'card small', style: 'border-color:var(--danger,#e5484d)' }, '⚠️ ' + err.message));
          if (target.ai) result.append(h('div', { class: 'small muted' }, 'Showing your last saved analysis below.'), aiRender(target.ai.text));
        })
        .then(function () { busy = false; run.disabled = false; run.textContent = '✨ Analyze'; });
    });
    body.append(seg, q, run,
      h('div', { class: 'small muted', style: 'margin:8px 0' },
        'Sends this player’s stats (' + (cfg.anonymize ? 'name hidden' : 'with name') + ', no notes) to Anthropic using your key. AI can make mistakes — treat it as a second opinion.'),
      result);
    showSaved();
    openSheet('✨ AI analysis' + (opts.game ? ' · this game' : ''), body);
  }

  function aiSettingsCard() {
    const AI = window.StatLineAI;
    const cfg = aiCfg();
    const key = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'sk-ant-…', value: cfg.key });
    const model = h('select', null, AI.MODELS.map(function (m) { return h('option', { value: m.id, selected: m.id === cfg.model }, m.label); }));
    model.value = cfg.model;
    const anon = h('input', { type: 'checkbox', checked: cfg.anonymize });
    const card = h('div', { class: 'card' },
      h('label', { class: 'field' }, h('span', null, 'Anthropic API key'), key),
      h('label', { class: 'field' }, h('span', null, 'Model'), model),
      h('label', { class: 'check' }, anon, h('span', null, 'Hide player names from the AI (recommended)')),
      h('div', { class: 'btn-row' },
        h('button', { onclick: function () { aiSave({ key: '', model: model.value, anonymize: anon.checked }); key.value = ''; toast('API key removed'); } }, 'Remove key'),
        h('button', { class: 'primary', onclick: function () { aiSave({ key: key.value.trim(), model: model.value, anonymize: anon.checked }); toast('AI settings saved'); } }, 'Save')),
      h('div', { class: 'small muted' },
        'Get a key at console.anthropic.com. It is stored only on this device, is not included in backups, and is sent only to api.anthropic.com. Each analysis uses a small amount of your API credit. Player stats (and the name, if you turn hiding off) leave the device when you run an analysis; notes never do.'));
    return card;
  }

  function demoData() {
    const mk = function (sport, name, num, pos, team) {
      const p = { id: uid(), created: Date.now(), name: name, sport: sport, number: num, position: pos, team: team, side: '', height: '', notes: 'Demo player' };
      db.players.push(p); return p;
    };
    const addGame = function (p, daysAgo, opp, sf, sa, stats, mins) {
      const d = new Date(Date.now() - daysAgo * 864e5);
      const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      db.games.push({
        id: uid(), created: Date.now() + db.games.length, playerId: p.id, sport: p.sport, position: p.position, date: ds, opponent: opp,
        location: '', scoreFor: sf, scoreAgainst: sa, status: 'final', seconds: mins * 60, runningSince: null,
        stats: Object.assign(SL.emptyStats(p.sport), stats), log: [], notes: ''
      });
    };
    const s = mk('soccer', 'Demo Striker', '9', 'ST', 'Demo FC');
    addGame(s, 21, 'Rovers', 2, 1, { goals: 1, assists: 0, shots: 4, shotsOn: 2, keyPasses: 1, passCmp: 18, passAtt: 24, dribCmp: 3, dribAtt: 5, tackles: 1, foulsWon: 2 }, 90);
    addGame(s, 14, 'United', 1, 1, { goals: 0, assists: 1, shots: 2, shotsOn: 1, keyPasses: 2, passCmp: 22, passAtt: 27, dribCmp: 2, dribAtt: 4, offsides: 2 }, 82);
    addGame(s, 7, 'City', 3, 0, { goals: 2, assists: 1, shots: 6, shotsOn: 4, keyPasses: 3, passCmp: 25, passAtt: 29, dribCmp: 4, dribAtt: 6, tackles: 2, yellow: 1 }, 90);
    const b = mk('basketball', 'Demo Guard', '3', 'PG', 'Demo Hoops');
    addGame(b, 20, 'Hawks', 78, 71, { fgm: 7, fga: 15, tpm: 3, tpa: 7, ftm: 4, fta: 5, oreb: 1, dreb: 3, ast: 8, stl: 2, blk: 0, tov: 3, pf: 2 }, 28);
    addGame(b, 13, 'Wolves', 64, 70, { fgm: 5, fga: 14, tpm: 1, tpa: 6, ftm: 2, fta: 2, oreb: 0, dreb: 4, ast: 6, stl: 1, blk: 1, tov: 4, pf: 3 }, 30);
    addGame(b, 6, 'Bulls', 82, 69, { fgm: 9, fga: 17, tpm: 4, tpa: 8, ftm: 6, fta: 7, oreb: 2, dreb: 5, ast: 10, stl: 3, blk: 0, tov: 2, pf: 1 }, 32);
    save();
  }

  function viewSettings() {
    setChrome({ title: 'Data & backup', tab: 'settings' });
    const w = h('div');
    w.append(h('div', { class: 'card small muted' },
      'All data is stored on this device. Use backup regularly — clearing app data or uninstalling the app erases it.'));
    w.append(h('h2', null, 'Export spreadsheet (CSV)'));
    w.append(h('div', { class: 'btn-row' },
      h('button', { onclick: function () { shareFile('statline-soccer.csv', SL.gamesToCsv('soccer', db.players, db.games), 'text/csv'); } }, '⚽ Soccer'),
      h('button', { onclick: function () { shareFile('statline-basketball.csv', SL.gamesToCsv('basketball', db.players, db.games), 'text/csv'); } }, '🏀 Basketball')));
    w.append(h('h2', null, 'Backup & restore'));
    w.append(h('div', { class: 'btn-row' },
      h('button', {
        onclick: function () {
          shareFile('statline-backup-' + todayStr() + '.json', JSON.stringify({ app: 'statline', version: 1, exported: new Date().toISOString(), players: db.players, games: db.games }, null, 1), 'application/json');
        }
      }, '⬇ Backup (JSON)'),
      h('button', { onclick: function () { fileInput.click(); } }, '⬆ Restore')));
    const fileInput = h('input', {
      type: 'file', accept: 'application/json,.json', hidden: true, onchange: function (e) {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = function () {
          try {
            const d = JSON.parse(r.result);
            if (!Array.isArray(d.players) || !Array.isArray(d.games)) throw new Error('Not a StatLine backup');
            const replace = confirm('Restore backup?\n\nOK = REPLACE all current data\nCancel = keep current data and merge the backup in');
            if (replace) { db = { players: d.players, games: d.games }; }
            else {
              d.players.forEach(function (p) { if (!player(p.id)) db.players.push(p); });
              d.games.forEach(function (g) { if (!game(g.id)) db.games.push(g); });
            }
            save(); toast('Backup restored'); viewSettings();
          } catch (err) { toast('Restore failed: ' + err.message); }
        };
        r.readAsText(f); e.target.value = '';
      }
    });
    w.append(fileInput);
    w.append(h('h2', null, '✨ AI analysis'));
    w.append(aiSettingsCard());
    w.append(h('h2', null, 'Other'));
    w.append(h('div', { class: 'btn-row' },
      h('button', { onclick: function () { demoData(); toast('Demo data added'); viewSettings(); } }, 'Load demo data'),
      h('button', {
        class: 'danger', onclick: function () {
          if (!confirm('Erase ALL players and games on this device?')) return;
          if (!confirm('Really erase everything? This cannot be undone.')) return;
          db = { players: [], games: [] }; save(); toast('All data erased'); viewSettings();
        }
      }, 'Erase all data')));
    w.append(h('div', { class: 'small muted', style: 'margin-top:18px' },
      'StatLine v' + APP_VERSION + ' · ' + db.players.length + ' players · ' + db.games.length + ' games'));
    w.append(h('h2', null, 'Metric definitions'));
    w.append(h('div', { class: 'card small' },
      h('p', { style: 'margin-top:0' }, h('b', null, 'Basketball: '),
        'PTS = 2×FGM + 3PM + FTM · eFG% = (FGM + 0.5×3PM) ÷ FGA · TS% = PTS ÷ (2×(FGA + 0.44×FTA)) · AST/TO = assists ÷ turnovers · GmSc (Hollinger Game Score) = PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA−FTM) + 0.7·OREB + 0.3·DREB + STL + 0.7·AST + 0.7·BLK − 0.4·PF − TOV · PTS/36 = points per 36 minutes.'),
      h('p', { style: 'margin-bottom:0' }, h('b', null, 'Soccer: '),
        'Shot accuracy = shots on target ÷ shots · Conversion = goals ÷ shots · Pass % = completed ÷ attempted · Per-90 = stat × 90 ÷ minutes played · Save % = saves ÷ (saves + goals conceded). Shots on target include goals.')));
    render(w);
  }

  // ---------- boot ----------
  $('#backBtn').addEventListener('click', function () { history.length > 1 ? history.back() : go('#/players'); });
  window.addEventListener('hashchange', router);
  if (!location.hash) location.hash = '#/players';
  router();

  if ('serviceWorker' in navigator && !isNative() && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache optional */ });
  }
})();
