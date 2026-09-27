// Run: node --test 'family-movies/tests/*.test.js'
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

const TODAY = '2026-09-26';

function daysAgo(n) {
  return new Date(Date.parse(TODAY + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
}

function movie(id, genres, extra) {
  return Object.assign({ id, title: 'Film ' + id, year: 2020, genres, ratingLevel: 0, quality: 0.7, votes: 1000 }, extra || {});
}

function watch(memberId, movieId, opts) {
  const o = opts || {};
  const watchedOn = o.daysAgo == null ? null : daysAgo(o.daysAgo);
  return {
    id: memberId + movieId + (o.daysAgo || ''),
    memberId, movieId, watchedOn,
    signalDate: watchedOn || daysAgo(30),
    completion: o.completion === undefined ? 1 : o.completion,
    thumbs: o.thumbs === undefined ? null : o.thumbs,
    together: !!o.together,
  };
}

function member(id, extra) {
  return Object.assign({ id, name: id, maxRating: 4, tasteHalfLifeDays: 365, rewatchHalfLifeDays: 180 }, extra || {});
}

function recommend(input) {
  return E.recommend(Object.assign({ today: TODAY, watchlist: [], dismissed: [], k: 6, rowK: 20 }, input));
}

function allItems(r) {
  return r.top.concat(r.newRow, r.rewatchRow);
}

function titles(list) {
  return list.map((x) => x.movie.title);
}

test('family weights: equal by default, lean moves weight to one person, always sums to 1', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(E.familyWeights(ids, null, 0), { a: 0.25, b: 0.25, c: 0.25, d: 0.25 });
  const w = E.familyWeights(ids, 'd', 0.6);
  assert.ok(Math.abs(w.d - 0.7) < 1e-9);
  assert.ok(Math.abs(w.a - 0.1) < 1e-9);
  const sum = Object.values(w).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.deepEqual(E.familyWeights(ids, 'zz', 0.9), { a: 0.25, b: 0.25, c: 0.25, d: 0.25 }, 'lean to someone not watching is ignored');
  assert.equal(E.familyWeights(ids, 'a', 5).a, 1, 'lean is capped at 100%');
});

test('age ratings map to levels per country', () => {
  assert.equal(E.certLevel('AU', 'MA 15+'), 3);
  assert.equal(E.certLevel('AU', 'PG'), 1);
  assert.equal(E.certLevel('US', 'PG-13'), 2);
  assert.equal(E.certLevel('GB', '12A'), 2);
  assert.equal(E.certLevel('NZ', 'R16'), 3);
  assert.equal(E.certLevel('AU', 'NR'), null);
  assert.equal(E.ratingLabel('AU', 3), 'MA15+');
});

test('rating is a hard filter set by the strictest viewer, even at 100% lean', () => {
  const movies = {
    1: movie(1, ['Action'], { ratingLevel: 3 }),
    2: movie(2, ['Action'], { ratingLevel: 1 }),
    3: movie(3, ['Action'], { ratingLevel: null }), // unknown rating
  };
  const members = [member('dad'), member('kid', { maxRating: 1 })];
  const history = [watch('dad', 99, { thumbs: 1 })];
  movies[99] = movie(99, ['Action'], { ratingLevel: 3 });
  const r = recommend({ members, history, movies, viewerIds: ['dad', 'kid'], leanTo: 'dad', lean: 1, mode: 'new' });
  const ids = allItems(r).map((x) => x.movieId);
  assert.deepEqual(ids, [2]);
  assert.equal(r.limitLevel, 1);
  const adults = recommend({ members, history, movies, viewerIds: ['dad'], mode: 'new' });
  assert.deepEqual(allItems(adults).filter((x) => x.kind === 'new').map((x) => x.movieId).sort(), [1, 2, 3]);
});

test('a heavy watcher does not drown out a light watcher', () => {
  const movies = {};
  const history = [];
  for (let i = 0; i < 100; i++) { movies[100 + i] = movie(100 + i, ['Action']); history.push(watch('heavy', 100 + i, { thumbs: 1, daysAgo: 10 })); }
  for (let i = 0; i < 12; i++) { movies[300 + i] = movie(300 + i, ['Animation']); history.push(watch('light', 300 + i, { thumbs: 1, daysAgo: 10 })); }
  movies[1] = movie(1, ['Action'], { title: 'Action pick' });
  movies[2] = movie(2, ['Animation'], { title: 'Animation pick' });
  const r = recommend({ members: [member('heavy'), member('light')], history, movies, viewerIds: ['heavy', 'light'], mode: 'new' });
  const byTitle = Object.fromEntries(allItems(r).map((x) => [x.movie.title, x.score]));
  assert.ok(Math.abs(byTitle['Action pick'] - byTitle['Animation pick']) < 0.05,
    'scores should be close, got ' + JSON.stringify(byTitle));
});

test('lean changes the order toward that person', () => {
  const movies = { 10: movie(10, ['Horror']), 11: movie(11, ['Animation']), 1: movie(1, ['Horror']), 2: movie(2, ['Animation']) };
  const history = [watch('a', 10, { thumbs: 1, daysAgo: 5 }), watch('b', 11, { thumbs: 1, daysAgo: 5 })];
  const members = [member('a'), member('b')];
  const leanA = recommend({ members, history, movies, viewerIds: ['a', 'b'], mode: 'new', leanTo: 'a', lean: 0.8 });
  const leanB = recommend({ members, history, movies, viewerIds: ['a', 'b'], mode: 'new', leanTo: 'b', lean: 0.8 });
  assert.equal(leanA.top[0].movieId, 1);
  assert.equal(leanB.top[0].movieId, 2);
});

test('no one hates it: a film one viewer dislikes sinks below a neutral one', () => {
  const movies = {
    20: movie(20, ['Horror']), 21: movie(21, ['Horror']), 22: movie(22, ['Horror']),
    30: movie(30, ['Horror', 'Thriller']),
    1: movie(1, ['Horror', 'Thriller'], { title: 'Scary' }),
    2: movie(2, ['Documentary'], { title: 'Calm' }),
  };
  const history = [
    watch('kid', 20, { thumbs: -1, daysAgo: 5 }), watch('kid', 21, { thumbs: -1, daysAgo: 5 }), watch('kid', 22, { completion: 0.1, daysAgo: 5 }),
    watch('dad', 30, { thumbs: 1, daysAgo: 5 }), watch('mum', 30, { thumbs: 1, daysAgo: 5 }),
  ];
  const members = [member('dad'), member('mum'), member('kid')];
  const r = recommend({ members, history, movies, viewerIds: ['dad', 'mum', 'kid'], mode: 'new' });
  const order = titles(r.top);
  assert.ok(order.indexOf('Calm') < order.indexOf('Scary'), 'got ' + order.join(', '));
  const scary = r.top.find((x) => x.movie.title === 'Scary');
  assert.equal(scary.fit.find((f) => f.memberId === 'kid').level, 'meh');
});

test('no history means neutral, not disliked', () => {
  const movies = { 1: movie(1, ['Science Fiction']), 50: movie(50, ['Science Fiction']) };
  const history = [watch('dad', 50, { thumbs: 1, daysAgo: 3 })];
  const r = recommend({ members: [member('dad'), member('newbie')], history, movies, viewerIds: ['dad', 'newbie'], mode: 'new' });
  const item = r.top[0];
  assert.equal(item.movieId, 1);
  assert.equal(item.fit.find((f) => f.memberId === 'newbie').level, 'ok');
  assert.ok(item.score > 0.6);
});

test('watch signals: giving up early is a dislike, thumbs beat completion, shared watches count less', () => {
  assert.ok(E.entrySignal({ completion: 0.2 }) < 0);
  assert.equal(E.entrySignal({ completion: 0.95 }), 0.5);
  assert.equal(E.entrySignal({ completion: 0.1, thumbs: 1 }), 1);
  assert.equal(E.entrySignal({ completion: 1, thumbs: -1 }), -1);
  assert.equal(E.entrySignal({ completion: null }), 0.3);
  assert.equal(E.entrySignal({ owned: true }), 0.6);
  assert.ok(Math.abs(E.entrySignal({ completion: 1, together: true }) - 0.3) < 1e-9);
  assert.equal(E.entrySignal({ completion: 1, together: true, thumbs: 1 }), 1, 'a personal thumbs is full strength');
});

test('anything a viewer disliked is never suggested', () => {
  const movies = { 1: movie(1, ['Comedy']), 2: movie(2, ['Comedy']) };
  const history = [watch('a', 1, { thumbs: -1, daysAgo: 400 }), watch('b', 2, { thumbs: 1, daysAgo: 400 })];
  const r = recommend({ members: [member('a'), member('b')], history, movies, viewerIds: ['a', 'b'], mode: 'mix', settings: { newMeans: 'most' } });
  assert.ok(!allItems(r).some((x) => x.movieId === 1));
  assert.ok(allItems(r).some((x) => x.movieId === 2));
});

test('rewatch cooldown is per person and much shorter for children', () => {
  const movies = { 1: movie(1, ['Animation']) };
  const kid = member('kid', { rewatchHalfLifeDays: 21 });
  const adult = member('adult', { rewatchHalfLifeDays: 180 });
  const fav = (who, n) => recommend({ members: [kid, adult], history: [watch(who, 1, { thumbs: 1, daysAgo: n })], movies, viewerIds: [who], mode: 'favourites' }).top.length;
  assert.equal(fav('kid', 3), 0, 'kid watched 3 days ago: too soon');
  assert.equal(fav('kid', 40), 1, 'kid watched 40 days ago: ready');
  assert.equal(fav('adult', 40), 0, 'adult watched 40 days ago: too soon');
  assert.equal(fav('adult', 200), 1, 'adult watched 200 days ago: ready');
});

test('modes: new excludes seen films, favourites only liked seen films, mix uses the share', () => {
  const movies = {};
  const history = [];
  for (let i = 1; i <= 6; i++) movies[i] = movie(i, ['Comedy'], { title: 'New ' + i });
  for (let i = 11; i <= 16; i++) { movies[i] = movie(i, ['Comedy'], { title: 'Fav ' + i }); history.push(watch('a', i, { thumbs: 1, daysAgo: 500 })); }
  movies[20] = movie(20, ['Comedy'], { title: 'Meh seen' });
  history.push(watch('a', 20, { thumbs: 0, daysAgo: 500 }));
  const base = { members: [member('a')], history, movies, viewerIds: ['a'], k: 5 };
  assert.ok(recommend(Object.assign({ mode: 'new' }, base)).top.every((x) => x.kind === 'new'));
  const fav = recommend(Object.assign({ mode: 'favourites' }, base)).top;
  assert.ok(fav.every((x) => x.kind === 'rewatch'));
  assert.ok(!fav.some((x) => x.movieId === 20), 'a film rated only "OK" is not a favourite');
  const mix = recommend(Object.assign({ mode: 'mix', settings: { mixShare: 0.4 } }, base)).top;
  assert.equal(mix.filter((x) => x.kind === 'rewatch').length, 2);
  assert.equal(mix.filter((x) => x.kind === 'new').length, 3);
  const r = recommend(Object.assign({ mode: 'mix' }, base));
  const shown = new Set(r.top.map((x) => x.movieId));
  assert.ok(r.newRow.concat(r.rewatchRow).every((x) => !shown.has(x.movieId)), 'rows do not repeat the top picks');
});

test('"new to most of us" lets in a film only one person has seen, and says who', () => {
  const movies = { 1: movie(1, ['Adventure']) };
  const history = [watch('kid1', 1, { thumbs: 1, daysAgo: 100 })];
  const members = ['mum', 'dad', 'kid1', 'kid2'].map((id) => member(id, { rewatchHalfLifeDays: 30 }));
  const ids = members.map((m) => m.id);
  const strict = recommend({ members, history, movies, viewerIds: ids, mode: 'new' });
  assert.equal(strict.top.length, 0);
  const most = recommend({ members, history, movies, viewerIds: ids, mode: 'new', settings: { newMeans: 'most' } });
  assert.equal(most.top.length, 1);
  assert.deepEqual(most.top[0].unseenBy, ['mum', 'dad', 'kid2']);
  assert.equal(most.top[0].seenBy[0].daysAgo, 100);
  assert.match(most.top[0].reason, /kid1 loved it/);
});

test('"new to most of us" with two viewers, and never for a single viewer', () => {
  const movies = { 1: movie(1, ['Comedy']) };
  const members = [member('a'), member('b')];
  const history = [watch('a', 1, { thumbs: 1, daysAgo: 400 })];
  const two = recommend({ members, history, movies, viewerIds: ['a', 'b'], mode: 'new', settings: { newMeans: 'most' } });
  assert.equal(two.top.length, 1, 'one of two has seen it: still counts as new');
  const one = recommend({ members, history, movies, viewerIds: ['a'], mode: 'new', settings: { newMeans: 'most' } });
  assert.equal(one.top.length, 0, 'the only viewer has seen it: not new');
});

test('a recent rewatch never outranks an older one, even when both scores are negative', () => {
  // Both films are ones the kid dislikes the genre of, so both family scores go negative.
  const movies = {
    1: movie(1, ['Horror'], { title: 'Seen last week' }),
    2: movie(2, ['Horror'], { title: 'Seen two years ago' }),
  };
  const members = [member('dad', { rewatchHalfLifeDays: 5 }), member('kid')];
  const history = [watch('dad', 1, { thumbs: 1, daysAgo: 7 }), watch('dad', 2, { thumbs: 1, daysAgo: 730 })];
  for (let i = 0; i < 10; i++) {
    movies[20 + i] = movie(20 + i, ['Horror']);
    history.push(watch('kid', 20 + i, { thumbs: -1, daysAgo: 5 }));
  }
  const r = recommend({ members, history, movies, viewerIds: ['dad', 'kid'], mode: 'favourites', settings: { strictness: 'strict' } });
  const order = titles(r.top);
  assert.ok(r.top.every((x) => x.score < 0), 'setup: scores are negative');
  assert.deepEqual(order, ['Seen two years ago', 'Seen last week']);
});

test('"not for us" hides a film for the people who dismissed it', () => {
  const movies = { 1: movie(1, ['Comedy']), 2: movie(2, ['Comedy']) };
  const members = [member('a'), member('b')];
  const dismissed = [{ movieId: 1, memberIds: ['a'], date: TODAY }];
  const withA = recommend({ members, history: [], dismissed, movies, viewerIds: ['a', 'b'], mode: 'new' });
  assert.deepEqual(allItems(withA).map((x) => x.movieId), [2]);
  const onlyB = recommend({ members, history: [], dismissed, movies, viewerIds: ['b'], mode: 'new' });
  assert.equal(allItems(onlyB).length, 2);
});

test('"only our services" hides films that are not streaming on them', () => {
  const movies = {
    1: movie(1, ['Comedy'], { providers: { flatrate: [{ id: 8, name: 'Netflix' }] } }),
    2: movie(2, ['Comedy'], { providers: { flatrate: [{ id: 337, name: 'Disney Plus' }] } }),
    3: movie(3, ['Comedy'], { providers: null }),
  };
  const r = recommend({ members: [member('a')], history: [], movies, viewerIds: ['a'], mode: 'new', settings: { onlyMyServices: true, services: [8] } });
  assert.deepEqual(allItems(r).map((x) => x.movieId).sort(), [1, 3]);
  assert.equal(r.counts.hiddenByService, 1);
});

test('explanations name a similar film the person liked', () => {
  const movies = {
    50: movie(50, ['Animation', 'Science Fiction'], { title: 'Robot Pals', keywords: ['robot'] }),
    1: movie(1, ['Animation', 'Science Fiction'], { title: 'Robot Pals 2', keywords: ['robot'] }),
  };
  const history = [watch('kid', 50, { thumbs: 1, daysAgo: 10 })];
  const r = recommend({ members: [member('kid', { name: 'Ruby' })], history, movies, viewerIds: ['kid'], mode: 'new' });
  assert.equal(r.top[0].reason, 'Because Ruby loved Robot Pals');
});

test('watching together adds a family-night signal to the score', () => {
  const movies = { 60: movie(60, ['Music']), 1: movie(1, ['Music']), 2: movie(2, ['War']) };
  const history = [watch('a', 60, { together: true, daysAgo: 20 }), watch('b', 60, { together: true, daysAgo: 20 })];
  const r = recommend({ members: [member('a'), member('b')], history, movies, viewerIds: ['a', 'b'], mode: 'new' });
  assert.equal(r.top[0].movieId, 1);
});

test('stats: picks, finish rate and thumbs', () => {
  const events = [
    { type: 'pick', id: 'p1', date: TODAY, mode: 'new', kind: 'new' },
    { type: 'pick', id: 'p2', date: TODAY, mode: 'mix', kind: 'rewatch' },
    { type: 'pick', id: 'p3', date: daysAgo(60), mode: 'new', kind: 'new' },
    { type: 'checkin', pickId: 'p1', date: TODAY, completion: 1, thumbs: { a: 1, b: -1 } },
    { type: 'checkin', pickId: 'p2', date: TODAY, completion: 0.3, thumbs: { a: 1 } },
    { type: 'already-seen', date: TODAY },
    { type: 'not-for-us', date: TODAY },
  ];
  const s = E.computeStats(events, TODAY);
  assert.equal(s.picks, 3);
  assert.equal(s.picks30, 2);
  assert.equal(s.checked, 2);
  assert.equal(s.finishRate, 0.5);
  assert.ok(Math.abs(s.thumbsUpRate - 2 / 3) < 1e-9);
  assert.equal(s.byMode.new.picks, 2);
  assert.equal(s.byKind.rewatch, 1);
  assert.equal(s.alreadySeen30, 1);
  assert.equal(s.notForUs30, 1);
});

test('taste summary lists likes and dislikes in plain words', () => {
  const movies = { 1: movie(1, ['Science Fiction']), 2: movie(2, ['Romance']) };
  const history = [watch('a', 1, { thumbs: 1, daysAgo: 5 }), watch('a', 2, { thumbs: -1, daysAgo: 5 })];
  const s = E.tasteSummary({ members: [member('a')], history, movies, today: TODAY }, 'a');
  assert.deepEqual(s.likes, ['sci-fi']);
  assert.deepEqual(s.dislikes, ['romance']);
});
