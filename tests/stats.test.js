const test = require('node:test');
const assert = require('node:assert/strict');
const SL = require('../www/js/stats.js');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('basketball: points, shooting splits and advanced metrics', () => {
  // 7/15 FG incl. 3/7 from three, 4/5 FT -> PTS = 2*7 + 3 + 4 = 21
  const t = { fgm: 7, fga: 15, tpm: 3, tpa: 7, ftm: 4, fta: 5, oreb: 1, dreb: 3, ast: 8, stl: 2, blk: 0, tov: 3, pf: 2 };
  const d = SL.derived('basketball', t, 28 * 60, 1);
  assert.equal(d.pts, 21);
  assert.equal(d.reb, 4);
  close(d.fgPct, 7 / 15 * 100);
  close(d.tpPct, 3 / 7 * 100);
  close(d.ftPct, 80);
  close(d.efgPct, (7 + 1.5) / 15 * 100);
  close(d.tsPct, 21 / (2 * (15 + 0.44 * 5)) * 100);
  close(d.astTov, 8 / 3);
  // Hollinger game score: 21 + 2.8 - 10.5 - 0.4 + 0.7 + 0.9 + 2 + 5.6 + 0 - 0.8 - 3 = 18.3
  close(d.gameScore, 18.3, 1e-9);
  close(d.pts36, 21 * 36 / 28);
});

test('basketball: 3PT make tile adds FGM, FGA, 3PM, 3PA and 3 points', () => {
  let s = SL.emptyStats('basketball');
  const tile = id => SL.SPORTS.basketball.tiles.find(x => x.id === id);
  s = SL.applyDelta(s, tile('three').d, 1);
  s = SL.applyDelta(s, tile('two').d, 1);
  s = SL.applyDelta(s, tile('ft').d, 1);
  s = SL.applyDelta(s, tile('threeMiss').d, 1);
  assert.deepEqual([s.fgm, s.fga, s.tpm, s.tpa, s.ftm, s.fta], [2, 3, 1, 2, 1, 1]);
  assert.equal(SL.derived('basketball', s, 0, 1).pts, 3 + 2 + 1);
  // tile display counters
  assert.equal(tile('two').show(s), '1/1');
  assert.equal(tile('three').show(s), '1/2');
  assert.equal(tile('threeMiss').show(s), 1);
});

test('soccer: goal tile counts as shot and shot on target; undo restores', () => {
  const tile = id => SL.SPORTS.soccer.tiles.find(x => x.id === id);
  let s = SL.emptyStats('soccer');
  s = SL.applyDelta(s, tile('goal').d, 1);
  s = SL.applyDelta(s, tile('shotOff').d, 1);
  s = SL.applyDelta(s, tile('shotOn').d, 1);
  assert.deepEqual([s.goals, s.shots, s.shotsOn], [1, 3, 2]);
  assert.equal(tile('shotOn').show(s), 1);   // saved shots only (goals shown separately)
  assert.equal(tile('shotOff').show(s), 1);
  s = SL.applyDelta(s, tile('goal').d, -1);
  assert.deepEqual([s.goals, s.shots, s.shotsOn], [0, 2, 1]);
});

test('soccer: percentages and per-90 rates', () => {
  const t = SL.emptyStats('soccer');
  Object.assign(t, { goals: 2, assists: 1, shots: 6, shotsOn: 4, passCmp: 25, passAtt: 29, dribCmp: 4, dribAtt: 6, saves: 3, goalsConceded: 1 });
  const d = SL.derived('soccer', t, 45 * 60, 1); // 45 minutes
  assert.equal(d.goalContrib, 3);
  close(d.shotAcc, 4 / 6 * 100);
  close(d.conversion, 2 / 6 * 100);
  close(d.passPct, 25 / 29 * 100);
  close(d.dribPct, 4 / 6 * 100);
  close(d.savePct, 75);
  close(d.goals90, 4);       // 2 goals in 45 min -> 4 per 90
  close(d.ga90, 6);
});

test('division by zero yields null and formats as dash', () => {
  const t = SL.emptyStats('soccer');
  const d = SL.derived('soccer', t, 0, 0);
  assert.equal(d.shotAcc, null);
  assert.equal(d.goals90, null);
  assert.equal(SL.fmt(d.shotAcc, 0, '%'), '–');
  const b = SL.derived('basketball', SL.emptyStats('basketball'), 0, 0);
  assert.equal(b.fgPct, null);
  assert.equal(b.tsPct, null);
  assert.equal(b.ppg, null);
});

test('sumStats aggregates totals, minutes and games played', () => {
  const g = (stats, sec) => ({ sport: 'basketball', stats: Object.assign(SL.emptyStats('basketball'), stats), seconds: sec });
  const agg = SL.sumStats('basketball', [g({ fgm: 4, fga: 8, ast: 2 }, 600), g({ fgm: 6, fga: 10, ast: 5 }, 1200)]);
  assert.equal(agg.gp, 2);
  assert.equal(agg.totals.fgm, 10);
  assert.equal(agg.totals.ast, 7);
  assert.equal(agg.seconds, 1800);
  const d = SL.derived('basketball', agg.totals, agg.seconds, agg.gp);
  close(d.ppg, 10);       // 2*10 FGM = 20 pts over 2 games
  close(d.mpg, 15);
});

test('applyDelta never goes below zero', () => {
  const s = SL.applyDelta(SL.emptyStats('soccer'), { goals: 1 }, -1);
  assert.equal(s.goals, 0);
});

test('result, clock and CSV helpers', () => {
  assert.equal(SL.resultOf({ scoreFor: 3, scoreAgainst: 1 }), 'W');
  assert.equal(SL.resultOf({ scoreFor: 1, scoreAgainst: 3 }), 'L');
  assert.equal(SL.resultOf({ scoreFor: 2, scoreAgainst: 2 }), 'D');
  assert.equal(SL.resultOf({ scoreFor: '', scoreAgainst: '' }), null);
  assert.equal(SL.fmtClock(125), '02:05');
  assert.equal(SL.fmtClock(-4), '00:00');
  const players = [{ id: 'p1', name: 'Ann, "AJ" Jones', number: '3', position: 'PG', team: 'Hoops' }];
  const games = [{ id: 'g1', playerId: 'p1', sport: 'basketball', date: '2026-10-01', opponent: 'Wolves', location: '',
    scoreFor: 70, scoreAgainst: 60, seconds: 1800, stats: Object.assign(SL.emptyStats('basketball'), { fgm: 5, fga: 10, tpm: 1, tpa: 3, ftm: 2, fta: 2 }) }];
  const csv = SL.gamesToCsv('basketball', players, games).split('\n');
  assert.equal(csv.length, 2);
  assert.ok(csv[1].includes('"Ann, ""AJ"" Jones"'));
  assert.ok(csv[0].startsWith('date,player,number'));
  const header = csv[0].split(',');
  assert.equal(header.indexOf('pts') > 0, true);
  assert.ok(csv[1].endsWith(',' + (2 * 5 + 1 + 2) + '.00') === false); // pts is not the last column
  assert.equal(SL.gamesToCsv('soccer', players, games).split('\n').length, 1); // no soccer rows
});
