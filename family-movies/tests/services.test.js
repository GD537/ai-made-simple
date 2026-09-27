// Run: node --test 'family-movies/tests/*.test.js'
// The photo-reading test needs the Anthropic SDK: set ANTHROPIC_SDK_DIR to a folder
// where `npm install @anthropic-ai/sdk` has been run, or it is skipped.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const S = require('../js/services.js');

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) });
}

// Fake fetch: routes by URL substring, records every call.
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    for (const [needle, handler] of routes) {
      if (String(url).includes(needle)) return typeof handler === 'function' ? handler(String(url), init) : jsonResponse(handler);
    }
    return jsonResponse({ status_message: 'not found' }, 404);
  };
  fn.calls = calls;
  return fn;
}

const TMDB_MOVIE = {
  id: 76341,
  title: 'Mad Max: Fury Road',
  release_date: '2015-05-13',
  genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }],
  runtime: 121,
  vote_average: 7.6,
  vote_count: 22000,
  popularity: 50,
  poster_path: '/mad.jpg',
  imdb_id: 'tt1392190',
  overview: 'An apocalyptic story.',
  keywords: { keywords: [{ name: 'post-apocalyptic' }, { name: 'duringcreditsstinger' }] },
  credits: { cast: [{ name: 'Tom Hardy' }, { name: 'Charlize Theron' }], crew: [{ job: 'Director', name: 'George Miller' }, { job: 'Writer', name: 'X' }] },
  release_dates: { results: [
    { iso_3166_1: 'US', release_dates: [{ certification: 'R', type: 3 }] },
    { iso_3166_1: 'AU', release_dates: [{ certification: '', type: 1 }, { certification: 'MA 15+', type: 3 }] },
  ] },
  'watch/providers': { results: { AU: { link: 'https://tmdb/watch', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg' }], rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.jpg' }] } } },
};

test('TMDB film details become a movie record with AU rating and where-to-watch', () => {
  const m = S.normalizeTmdbMovie(TMDB_MOVIE, 'AU');
  assert.equal(m.cert, 'MA 15+');
  assert.equal(m.ratingLevel, 3);
  assert.equal(m.certEstimated, false);
  assert.deepEqual(m.directors, ['George Miller']);
  assert.deepEqual(m.providers.flatrate, [{ id: 8, name: 'Netflix', logo: '/n.jpg' }]);
  assert.equal(m.providers.rent[0].name, 'Apple TV');
  assert.ok(m.quality > 0.74 && m.quality < 0.77);
  assert.equal(m.year, 2015);
});

test('missing local rating falls back to the US rating, marked as estimated', () => {
  const c = S.pickCertification({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13', type: 3 }] }] }, 'AU');
  assert.deepEqual(c, { label: 'M', level: 2, estimated: true });
  assert.deepEqual(S.pickCertification({ results: [] }, 'AU'), { label: null, level: null, estimated: false });
});

test('TMDB client: v3 key as a parameter, v4 token as a header, retries when busy, clear error on a bad key', async () => {
  let busy = 1;
  const f = fakeFetch([
    ['/configuration', () => (busy-- > 0 ? jsonResponse({}, 429) : jsonResponse({ images: {} }))],
    ['/search/movie', { results: [] }],
  ]);
  const v3 = S.createTmdb({ key: 'abc123', fetch: f, country: 'AU' });
  await v3.test();
  assert.equal(f.calls.length, 2, 'retried after 429');
  assert.match(f.calls[1].url, /api_key=abc123/);
  assert.match(f.calls[1].url, /language=en-AU/);

  const token = 'eyJ' + 'x'.repeat(100);
  const v4 = S.createTmdb({ key: token, fetch: f, country: 'AU' });
  await v4.search('Up', 2009);
  const last = f.calls[f.calls.length - 1];
  assert.equal(last.init.headers.Authorization, 'Bearer ' + token);
  assert.doesNotMatch(last.url, /api_key/);
  assert.match(last.url, /year=2009/);

  const bad = S.createTmdb({ key: 'nope', fetch: async () => jsonResponse({}, 401) });
  await assert.rejects(bad.test(), /did not accept that key/);
});

test('matching decisions: confident, needs checking, and impossible dates', () => {
  const results = [
    { id: 1, title: 'The Lion King', release_date: '2019-07-12', vote_count: 9000 },
    { id: 2, title: 'The Lion King', release_date: '1994-06-24', vote_count: 17000 },
  ];
  assert.deepEqual(S.decideMatch({ title: 'The Lion King', year: 1994 }, results), { status: 'matched', id: 2 });
  const unsure = S.decideMatch({ title: 'The Lion King' }, results);
  assert.equal(unsure.status, 'review', 'two exact titles with similar popularity need a person to choose');
  assert.equal(unsure.options.length, 2);
  assert.deepEqual(S.decideMatch({ title: 'The Lion King', watchedOn: '2005-01-01' }, results), { status: 'matched', id: 2 },
    'the 2019 remake cannot have been watched in 2005');
  assert.deepEqual(S.decideMatch({ title: 'Totally Unknown' }, results), { status: 'none' });
  assert.deepEqual(S.decideMatch({ title: 'Moana' }, [{ id: 3, title: 'Moana', release_date: '2016-11-23', vote_count: 12000 }, { id: 4, title: 'Moana', release_date: '1926-01-01', vote_count: 40 }]),
    { status: 'matched', id: 3 }, 'a far more popular exact match wins without a year');
});

test('matchRecords: TMDB id, IMDb id and title search; groups repeats of the same film', async () => {
  const tmdb = {
    findImdb: async (id) => ({ movie_results: id === 'tt0133093' ? [{ id: 603 }] : [] }),
    search: async (title) => ({ results: title === 'Up' ? [{ id: 14160, title: 'Up', release_date: '2009-05-28', vote_count: 20000 }] : [] }),
  };
  const out = await S.matchRecords([
    { title: 'Coco', tmdbId: 354912 },
    { title: 'The Matrix', imdbId: 'tt0133093' },
    { title: 'Up', watchedOn: '2024-01-01' },
    { title: 'Up', watchedOn: '2024-06-01' },
    { title: 'Nope Nope' },
  ], { tmdb });
  assert.deepEqual(out.matched.map((m) => m.movieId), [354912, 603, 14160, 14160]);
  assert.equal(out.notFound.length, 1);
});

test('matchRecords in demo mode searches the bundled film list', async () => {
  const catalog = [{ id: 12, title: 'Finding Nemo', year: 2003, votes: 19000 }, { id: 10681, title: 'WALL·E', year: 2008, votes: 19000 }];
  const out = await S.matchRecords([{ title: 'WALL-E' }, { title: 'finding nemo' }, { title: 'Jaws' }], { catalog });
  assert.deepEqual(out.matched.map((m) => m.movieId).sort(), [10681, 12]);
  assert.equal(out.notFound[0].title, 'Jaws');
});

test('findCandidates: recommendations from favourites plus discover within the rating limit and services', async () => {
  const f = fakeFetch([
    ['/recommendations', { results: [{ id: 501 }, { id: 502 }] }],
    ['/discover/movie', { results: [{ id: 601 }] }],
    ['/movie/', (url) => {
      const id = Number(/\/movie\/(\d+)/.exec(url)[1]);
      return jsonResponse(Object.assign({}, TMDB_MOVIE, { id, title: 'Film ' + id }));
    }],
  ]);
  const tmdb = S.createTmdb({ key: 'k', fetch: f, country: 'AU' });
  const movies = { 10: { id: 10, title: 'Fav', genres: ['Animation', 'Family'], fetchedAt: '2099-01-01' } };
  const history = [{ memberId: 'kid', movieId: 10, thumbs: 1, signalDate: '2024-01-01' }];
  const res = await S.findCandidates({
    tmdb, members: [], history, movies, viewerIds: ['kid'], limitLevel: 1,
    settings: { onlyMyServices: true, services: [8, 337] },
  });
  assert.equal(res.found, 3);
  assert.ok(movies[501] && movies[601], 'details fetched into the cache');
  const discover = f.calls.find((c) => c.url.includes('/discover/movie'));
  const q = new URL(discover.url).searchParams;
  assert.equal(q.get('certification_country'), 'AU');
  assert.equal(q.get('certification.lte'), 'PG');
  assert.equal(q.get('with_watch_providers'), '8|337');
  assert.equal(q.get('watch_region'), 'AU');
  assert.equal(q.get('with_genres'), '16|10751');
});

test('Trakt: follows pagination, reads history and ratings', async () => {
  const f = fakeFetch([
    ['/history/movies?page=1', () => jsonResponse([{ type: 'movie', watched_at: '2024-01-01T00:00:00Z', movie: { title: 'Up', year: 2009, ids: { tmdb: 14160 } } }], 200, { 'X-Pagination-Page-Count': '2' })],
    ['/history/movies?page=2', () => jsonResponse([{ type: 'movie', watched_at: '2024-02-01T00:00:00Z', movie: { title: 'Coco', year: 2017, ids: { tmdb: 354912 } } }], 200, { 'X-Pagination-Page-Count': '2' })],
    ['/ratings/movies', [{ type: 'movie', rating: 3, rated_at: '2024-03-01T00:00:00Z', movie: { title: 'Cats', year: 2019, ids: { tmdb: 536869 } } }]],
  ]);
  const recs = await S.fetchTrakt({ fetch: f, clientId: 'cid', username: 'sam smith' });
  assert.deepEqual(recs.map((r) => r.tmdbId), [14160, 354912, 536869]);
  assert.equal(recs[2].thumbs, -1);
  assert.match(f.calls[0].url, /users\/sam%20smith\//);
  assert.equal(f.calls[0].init.headers['trakt-api-key'], 'cid');
  const denied = fakeFetch([['/history', () => jsonResponse({}, 401)]]);
  await assert.rejects(S.fetchTrakt({ fetch: denied, clientId: 'x', username: 'y' }), /refused/);
});

test('Jellyfin and Plex: users, history, and film IDs from Plex metadata', async () => {
  const jf = fakeFetch([
    ['/Users/u1/Items', { Items: [{ Name: 'Coco', Type: 'Movie', ProductionYear: 2017, ProviderIds: { Tmdb: '354912' }, UserData: { Played: true } }] }],
    ['/Users', [{ Id: 'u1', Name: 'Ruby' }]],
  ]);
  assert.deepEqual(await S.jellyfinUsers({ fetch: jf, server: 'https://media.example/', apiKey: 'k' }), [{ id: 'u1', name: 'Ruby' }]);
  const jr = await S.jellyfinHistory({ fetch: jf, server: 'https://media.example', apiKey: 'k', userId: 'u1' });
  assert.equal(jr[0].tmdbId, 354912);
  assert.equal(jf.calls[0].init.headers['X-Emby-Token'], 'k');

  const px = fakeFetch([
    ['/accounts', { MediaContainer: { Account: [{ id: 1, name: 'Garrath' }, { id: 0, name: '' }] } }],
    ['/status/sessions/history/all', { MediaContainer: { Metadata: [{ type: 'movie', title: 'Moana', viewedAt: 1717200000, ratingKey: '55', accountID: 1 }] } }],
    ['/library/metadata/55', { MediaContainer: { Metadata: [{ year: 2016, Guid: [{ id: 'tmdb://277834' }] }] } }],
  ]);
  assert.deepEqual(await S.plexAccounts({ fetch: px, server: 'https://plex.example:32400', token: 't' }), [{ id: 1, name: 'Garrath' }]);
  const pr = await S.plexHistory({ fetch: px, server: 'https://plex.example:32400', token: 't', accountId: 1 });
  assert.deepEqual([pr[0].tmdbId, pr[0].year], [277834, 2016]);
  assert.match(px.calls[1].url, /accountID=1/);
  assert.match(px.calls[1].url, /X-Plex-Token=t/);
});

function loadSdk() {
  const dir = process.env.ANTHROPIC_SDK_DIR;
  if (!dir) return null;
  try {
    const mod = require(require.resolve('@anthropic-ai/sdk', { paths: [path.resolve(dir)] }));
    return mod.default || mod;
  } catch (err) {
    return null;
  }
}

test('photo reading: request shape through the official SDK, and error handling', async (t) => {
  const Anthropic = loadSdk();
  if (!Anthropic) { t.skip('set ANTHROPIC_SDK_DIR to run'); return; }
  const calls = [];
  let reply = { status: 200, body: null };
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  class TestAnthropic extends Anthropic {
    constructor(opts) { super(Object.assign({}, opts, { fetch: fetchImpl, maxRetries: 0 })); }
  }
  const message = (stop, text) => ({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: stop,
    content: text == null ? [] : [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 },
  });

  reply.body = message('end_turn', JSON.stringify({ titles: [
    { title: 'Moana', year: '2016', kind: 'movie' },
    { title: 'Bluey', year: '', kind: 'tv' },
    { title: 'Coco', year: '', kind: 'unsure' },
  ] }));
  const titles = await S.extractTitlesFromImage({ apiKey: 'sk-test', base64: 'AAAA', mediaType: 'image/jpeg', purpose: 'shelf', Anthropic: TestAnthropic });
  assert.deepEqual(titles, [{ title: 'Moana', year: 2016 }, { title: 'Coco', year: null }]);

  const req = calls[0];
  assert.match(req.url, /\/v1\/messages/);
  assert.equal(req.headers.get('x-api-key'), 'sk-test');
  assert.equal(req.headers.get('anthropic-dangerous-direct-browser-access'), 'true');
  assert.match(req.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(req.body.model, 'claude-opus-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.equal(req.body.messages[0].content[0].type, 'image');
  assert.equal(req.body.messages[0].content[0].source.media_type, 'image/jpeg');
  assert.match(req.body.messages[0].content[1].text, /DVDs, Blu-rays/);
  assert.ok(!('betas' in req.body), 'betas go in the header, not the body');

  reply.body = message('refusal', null);
  await assert.rejects(S.extractTitlesFromImage({ apiKey: 'k', base64: 'A', mediaType: 'image/png', purpose: 'screen', Anthropic: TestAnthropic }), /declined/);

  reply = { status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } };
  await assert.rejects(S.extractTitlesFromImage({ apiKey: 'bad', base64: 'A', mediaType: 'image/png', purpose: 'screen', Anthropic: TestAnthropic }), /wasn't accepted/);
});
