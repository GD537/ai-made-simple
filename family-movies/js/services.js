/*
 * Family Movie Night: everything that talks to the outside world.
 *
 *   - TMDB: film details, age ratings, where to watch, recommendations.
 *   - Matching imported titles to TMDB IDs, with a "Did you mean...?" list
 *     for anything uncertain.
 *   - Finding new candidate films for the people watching.
 *   - Trakt, Jellyfin and Plex watch history.
 *   - Reading film titles from a screenshot or shelf photo with Claude.
 *
 * All network calls take an injectable fetch (and SDK class) so they can be
 * tested without a network.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const Engine = isNode ? require('./engine.js') : root.FMEngine;
  const Import = isNode ? require('./importers.js') : root.FMImport;
  const api = factory(Engine, Import);
  if (isNode) module.exports = api;
  else root.FMServices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Import) {
  'use strict';

  const TMDB_BASE = 'https://api.themoviedb.org/3';
  const TMDB_IMAGE = 'https://image.tmdb.org/t/p/';
  const LANGUAGE = { AU: 'en-AU', NZ: 'en-NZ', GB: 'en-GB', US: 'en-US' };
  // TMDB's genre IDs (stable).
  const GENRE_IDS = {
    Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
    Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
    'Science Fiction': 878, 'TV Movie': 10770, Thriller: 53, War: 10752, Western: 37,
  };
  // TMDB's own spelling of each country's ratings, for its discover filter.
  const TMDB_CERTS = {
    AU: ['G', 'PG', 'M', 'MA 15+', 'R 18+'],
    NZ: ['G', 'PG', 'M', 'R16', 'R18'],
    GB: ['U', 'PG', '12A', '15', '18'],
    US: ['G', 'PG', 'PG-13', 'R', 'NC-17'],
  };

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function createLimiter(max) {
    let active = 0;
    const queue = [];
    const next = () => {
      if (active >= max || !queue.length) return;
      active += 1;
      const job = queue.shift();
      job.fn().then(job.resolve, job.reject).finally(() => { active -= 1; next(); });
    };
    return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
  }

  // ------------------------------------------------------------------ TMDB ---

  class TmdbError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  /**
   * key: a TMDB "API key" (v3, short) or "API Read Access Token" (v4, long, starts eyJ).
   */
  function createTmdb(options) {
    const key = String(options.key || '').trim();
    const fetchImpl = options.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    const country = options.country || 'AU';
    const language = LANGUAGE[country] || 'en-US';
    const bearer = key.startsWith('eyJ') || key.length > 60;
    const limit = createLimiter(options.concurrency || 6);

    async function get(path, params) {
      const url = new URL(TMDB_BASE + path);
      Object.entries(params || {}).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.set(k, v); });
      if (!url.searchParams.has('language')) url.searchParams.set('language', language);
      if (!bearer) url.searchParams.set('api_key', key);
      const headers = { accept: 'application/json' };
      if (bearer) headers.Authorization = 'Bearer ' + key;
      return limit(async () => {
        for (let attempt = 0; attempt < 4; attempt++) {
          const res = await fetchImpl(url.toString(), { headers });
          if (res.status === 429) { await sleep(800 * (attempt + 1)); continue; }
          if (res.status === 401) throw new TmdbError(401, 'TMDB did not accept that key. Check it in Settings.');
          if (res.status === 404) throw new TmdbError(404, 'Not found on TMDB.');
          if (!res.ok) throw new TmdbError(res.status, 'TMDB error ' + res.status + '.');
          return res.json();
        }
        throw new TmdbError(429, 'TMDB is busy. Try again in a minute.');
      });
    }

    return {
      country,
      get,
      test: () => get('/configuration'),
      search: (title, year) => get('/search/movie', { query: title, year: year || '', include_adult: 'false' }),
      findImdb: (imdbId) => get('/find/' + encodeURIComponent(imdbId), { external_source: 'imdb_id' }),
      details: async (id) => normalizeTmdbMovie(
        await get('/movie/' + id, { append_to_response: 'keywords,credits,release_dates,watch/providers' }),
        country,
      ),
      recommendations: (id, page) => get('/movie/' + id + '/recommendations', { page: page || 1 }),
      discover: (params) => get('/discover/movie', params),
      providers: () => get('/watch/providers/movie', { watch_region: country }),
    };
  }

  function bayesQuality(avg, votes) {
    const m = 200;
    const c = 6.5;
    const v = votes || 0;
    return ((v / (v + m)) * (avg || 0) + (m / (v + m)) * c) / 10;
  }

  // Age rating for the chosen country; falls back to the US rating mapped across.
  function pickCertification(releaseDates, country) {
    const results = (releaseDates && releaseDates.results) || [];
    const fromCountry = (code) => {
      const entry = results.find((r) => r.iso_3166_1 === code);
      if (!entry) return null;
      const dates = (entry.release_dates || []).filter((d) => d.certification && d.certification.trim());
      const pref = dates.find((d) => d.type === 3) || dates.find((d) => d.type === 4) || dates[0];
      return pref ? pref.certification.trim() : null;
    };
    const own = fromCountry(country);
    const ownLevel = Engine.certLevel(country, own);
    if (ownLevel != null) return { label: own, level: ownLevel, estimated: false };
    for (const other of ['US', 'GB', 'AU', 'NZ']) {
      if (other === country) continue;
      const c = fromCountry(other);
      const level = Engine.certLevel(other, c);
      if (level != null) return { label: Engine.ratingLabel(country, level), level, estimated: true };
    }
    return { label: null, level: null, estimated: false };
  }

  function providerList(list) {
    return (list || []).map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));
  }

  function normalizeTmdbMovie(json, country) {
    const cert = pickCertification(json.release_dates, country);
    const wp = json['watch/providers'] && json['watch/providers'].results && json['watch/providers'].results[country];
    return {
      id: json.id,
      title: json.title,
      year: json.release_date ? Number(json.release_date.slice(0, 4)) : null,
      genres: (json.genres || []).map((g) => g.name),
      keywords: ((json.keywords && json.keywords.keywords) || []).slice(0, 12).map((k) => k.name),
      cast: ((json.credits && json.credits.cast) || []).slice(0, 5).map((c) => c.name),
      directors: ((json.credits && json.credits.crew) || []).filter((c) => c.job === 'Director').slice(0, 2).map((c) => c.name),
      runtime: json.runtime || null,
      cert: cert.label,
      certEstimated: cert.estimated,
      certCountry: country,
      ratingLevel: cert.level,
      quality: bayesQuality(json.vote_average, json.vote_count),
      votes: json.vote_count || 0,
      popularity: json.popularity || 0,
      poster: json.poster_path || null,
      overview: (json.overview || '').slice(0, 320),
      imdbId: json.imdb_id || null,
      providers: {
        link: (wp && wp.link) || null,
        flatrate: providerList(wp && wp.flatrate),
        free: providerList(wp && wp.free),
        ads: providerList(wp && wp.ads),
        rent: providerList(wp && wp.rent),
        buy: providerList(wp && wp.buy),
      },
      fetchedAt: Engine.todayString(),
    };
  }

  function posterUrl(path, size) {
    return path ? TMDB_IMAGE + (size || 'w342') + path : null;
  }

  // -------------------------------------------------------------- matching ---

  function tokenJaccard(a, b) {
    const A = new Set(a.split(' ').filter(Boolean));
    const B = new Set(b.split(' ').filter(Boolean));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((t) => { if (B.has(t)) inter += 1; });
    return inter / (A.size + B.size - inter);
  }

  // How well one search result fits an imported record (higher is better).
  function scoreCandidate(record, cand) {
    const nt = Import.normalizeTitle(record.title);
    const exact = nt === Import.normalizeTitle(cand.title) || (cand.original_title && nt === Import.normalizeTitle(cand.original_title));
    let score = exact ? 1 : tokenJaccard(nt, Import.normalizeTitle(cand.title));
    const cy = cand.release_date ? Number(cand.release_date.slice(0, 4)) : null;
    if (record.year && cy) score += record.year === cy ? 0.3 : Math.abs(record.year - cy) === 1 ? 0.2 : -0.4;
    const watchedYear = record.watchedOn ? Number(record.watchedOn.slice(0, 4)) : null;
    if (watchedYear && cy && cy > watchedYear) score -= 1; // can't have watched it before it came out
    return { score, exact: !!exact, year: cy };
  }

  /**
   * Decide on a match from search results.
   * Returns { status: 'matched', id } | { status: 'review', options } | { status: 'none' }.
   */
  function decideMatch(record, results) {
    const scored = (results || [])
      .map((c) => Object.assign({ cand: c }, scoreCandidate(record, c)))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score || (b.cand.vote_count || 0) - (a.cand.vote_count || 0));
    if (!scored.length) return { status: 'none' };
    const best = scored[0];
    const second = scored[1];
    const yearOk = record.year ? best.year && Math.abs(best.year - record.year) <= 1 : true;
    const clearWinner = !second || !second.exact || second.score < best.score - 0.25 ||
      (best.cand.vote_count || 0) >= 5 * Math.max(1, second.cand.vote_count || 0);
    if (best.exact && yearOk && clearWinner && best.score >= 1) return { status: 'matched', id: best.cand.id };
    return {
      status: 'review',
      options: scored.slice(0, 3).map((x) => ({
        id: x.cand.id, title: x.cand.title, year: x.year, poster: x.cand.poster_path || null,
      })),
    };
  }

  function demoSearchResults(catalog, title) {
    const nt = Import.normalizeTitle(title);
    return catalog
      .map((m) => ({ id: m.id, title: m.title, release_date: m.year ? m.year + '-01-01' : '', vote_count: m.votes || 0, poster_path: m.poster }))
      .filter((c) => tokenJaccard(nt, Import.normalizeTitle(c.title)) > 0 || Import.normalizeTitle(c.title) === nt);
  }

  /**
   * Match imported records to film IDs.
   * opts: { tmdb?, catalog? (array, demo mode), onProgress? }
   * Returns { matched: [{ record, movieId }], review: [{ record, options }], notFound: [record] }
   */
  async function matchRecords(records, opts) {
    const tmdb = opts.tmdb;
    const catalog = opts.catalog || [];
    const byKey = new Map();
    for (const r of records) {
      const k = Import.recordKey(r);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }
    const decisions = new Map();
    let done = 0;
    const keys = Array.from(byKey.keys());
    await Promise.all(keys.map(async (k) => {
      const r = byKey.get(k)[0];
      let decision;
      try {
        if (r.tmdbId) decision = { status: 'matched', id: Number(r.tmdbId) };
        else if (r.imdbId && tmdb) {
          const found = await tmdb.findImdb(r.imdbId);
          const hit = found.movie_results && found.movie_results[0];
          decision = hit ? { status: 'matched', id: hit.id } : null;
        }
        if (!decision) {
          const results = tmdb ? (await tmdb.search(r.title, r.year)).results : demoSearchResults(catalog, r.title);
          decision = decideMatch(r, results);
          // A wrong year in the export shouldn't hide the film: retry without it.
          if (decision.status === 'none' && r.year && tmdb) decision = decideMatch(Object.assign({}, r, { year: null }), (await tmdb.search(r.title)).results);
          // "Frozen 2013": the full text didn't match, so try it as title + year.
          if (decision.status !== 'matched' && r.alt) {
            const alt = Object.assign({}, r, { title: r.alt.title, year: r.alt.year });
            const altDecision = decideMatch(alt, tmdb ? (await tmdb.search(alt.title, alt.year)).results : demoSearchResults(catalog, alt.title));
            if (altDecision.status === 'matched' || decision.status === 'none') decision = altDecision;
          }
        }
      } catch (err) {
        if (err && err.status === 401) throw err;
        decision = { status: 'none', error: err && err.message };
      }
      decisions.set(k, decision);
      done += 1;
      if (opts.onProgress) opts.onProgress(done, keys.length);
    }));

    const out = { matched: [], review: [], notFound: [] };
    byKey.forEach((list, k) => {
      const d = decisions.get(k);
      for (const record of list) {
        if (d.status === 'matched') out.matched.push({ record, movieId: d.id });
        else if (d.status === 'review') out.review.push({ record, options: d.options });
        else out.notFound.push(record);
      }
    });
    return out;
  }

  // Fetch (or refresh) full details for films not yet in the cache.
  async function ensureDetails(tmdb, ids, movies, opts) {
    const maxAgeDays = (opts && opts.maxAgeDays) || 30;
    const today = Engine.todayString();
    const need = Array.from(new Set(ids.map(Number))).filter((id) => {
      const m = movies[id];
      return !m || m.stub || m.demo || !m.fetchedAt || Engine.daysBetween(m.fetchedAt, today) > maxAgeDays;
    });
    let done = 0;
    await Promise.all(need.map(async (id) => {
      try {
        movies[id] = await tmdb.details(id);
      } catch (err) {
        if (err && err.status === 401) throw err;
      }
      done += 1;
      if (opts && opts.onProgress) opts.onProgress(done, need.length);
    }));
    return need.length;
  }

  // ------------------------------------------------------------ candidates ---

  /**
   * Find new films worth scoring for the people watching: TMDB recommendations
   * from each person's favourites, plus popular films in genres they like,
   * within the age rating and (optionally) on the family's services.
   */
  async function findCandidates(opts) {
    const { tmdb, members, history, movies, viewerIds, limitLevel, settings, onProgress } = opts;
    const country = tmdb.country;
    const ids = new Set();
    const seeds = [];
    const genreWeights = new Map();

    for (const id of viewerIds) {
      const mine = history.filter((h) => h.memberId === id);
      const scored = mine
        .map((h) => ({ h, s: Engine.entrySignal(h) }))
        .filter((x) => x.s >= 0.5)
        .sort((a, b) => (b.h.signalDate || '').localeCompare(a.h.signalDate || '') || b.s - a.s);
      scored.slice(0, 4).forEach((x) => seeds.push(x.h.movieId));
      scored.slice(0, 20).forEach((x) => {
        const m = movies[x.h.movieId];
        (m && m.genres ? m.genres : []).forEach((g) => genreWeights.set(g, (genreWeights.get(g) || 0) + x.s));
      });
    }

    const uniqueSeeds = Array.from(new Set(seeds)).slice(0, 12);
    await Promise.all(uniqueSeeds.map(async (id) => {
      try {
        const res = await tmdb.recommendations(id);
        (res.results || []).slice(0, 12).forEach((r) => ids.add(r.id));
      } catch (err) { if (err && err.status === 401) throw err; }
    }));

    const topGenres = Array.from(genreWeights.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map((e) => GENRE_IDS[e[0]]).filter(Boolean);
    const params = {
      sort_by: 'popularity.desc',
      'vote_count.gte': 150,
      include_adult: 'false',
      with_genres: topGenres.join('|'),
    };
    if (limitLevel <= 2) {
      params.certification_country = country;
      params['certification.lte'] = TMDB_CERTS[country][limitLevel];
    }
    const services = (settings && settings.services) || [];
    if (settings && settings.onlyMyServices && services.length) {
      params.watch_region = country;
      params.with_watch_providers = services.join('|');
      params.with_watch_monetization_types = 'flatrate|free|ads';
    }
    for (const page of [1, 2]) {
      try {
        const res = await tmdb.discover(Object.assign({ page }, params));
        (res.results || []).forEach((r) => ids.add(r.id));
      } catch (err) { if (err && err.status === 401) throw err; }
    }

    const all = Array.from(ids);
    const fetched = await ensureDetails(tmdb, all, movies, { onProgress });
    return { found: all.length, fetched };
  }

  // Well-known films for the quick-rate screen, within someone's age limit.
  async function quickRateBatch(opts) {
    const { tmdb, member, page, exclude } = opts;
    const params = { sort_by: 'vote_count.desc', include_adult: 'false', page: page || 1, 'vote_count.gte': 500 };
    const level = member.maxRating == null ? 4 : member.maxRating;
    if (level <= 2) {
      params.certification_country = tmdb.country;
      params['certification.lte'] = TMDB_CERTS[tmdb.country][level];
    }
    if (member.isChild) params.with_genres = [GENRE_IDS.Animation, GENRE_IDS.Family].join('|');
    const res = await tmdb.discover(params);
    return (res.results || []).filter((r) => !exclude.has(r.id)).map((r) => ({
      id: r.id, title: r.title, year: r.release_date ? Number(r.release_date.slice(0, 4)) : null, poster: r.poster_path,
    }));
  }

  // ------------------------------------------------------------ connectors ---

  async function fetchJson(fetchImpl, url, init, label) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      throw new Error("Couldn't reach " + label + '. Check the address, and that it allows requests from this page (see the note below).');
    }
    if (res.status === 401 || res.status === 403) throw new Error(label + ' refused the request. Check the key or token.');
    if (res.status === 404) throw new Error(label + " couldn't find that. Check the address or username.");
    if (!res.ok) throw new Error(label + ' error ' + res.status + '.');
    return { json: await res.json(), headers: res.headers };
  }

  function cleanServer(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  // Trakt: public profile, read with an app Client ID (no sign-in needed).
  async function fetchTrakt(opts) {
    const fetchImpl = opts.fetch || fetch.bind(globalThis);
    const user = encodeURIComponent(String(opts.username || '').trim());
    const headers = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': String(opts.clientId || '').trim() };
    const base = 'https://api.trakt.tv/users/' + user;
    const history = [];
    for (let page = 1; page <= 50; page++) {
      const { json, headers: h } = await fetchJson(fetchImpl, base + '/history/movies?page=' + page + '&limit=100', { headers }, 'Trakt');
      history.push.apply(history, json);
      const pages = Number((h && h.get && h.get('X-Pagination-Page-Count')) || 1);
      if (page >= pages || !json.length) break;
    }
    const { json: ratings } = await fetchJson(fetchImpl, base + '/ratings/movies', { headers }, 'Trakt');
    return Import.parseTraktHistory(history).concat(Import.parseTraktRatings(ratings));
  }

  function jellyfinHeaders(apiKey) {
    const key = String(apiKey || '').trim();
    return { 'X-Emby-Token': key, Authorization: 'MediaBrowser Token="' + key + '"' };
  }

  async function jellyfinUsers(opts) {
    const fetchImpl = opts.fetch || fetch.bind(globalThis);
    const { json } = await fetchJson(fetchImpl, cleanServer(opts.server) + '/Users', { headers: jellyfinHeaders(opts.apiKey) }, 'Jellyfin');
    return (json || []).map((u) => ({ id: u.Id, name: u.Name }));
  }

  async function jellyfinHistory(opts) {
    const fetchImpl = opts.fetch || fetch.bind(globalThis);
    const url = cleanServer(opts.server) + '/Users/' + encodeURIComponent(opts.userId) +
      '/Items?Recursive=true&IncludeItemTypes=Movie&Filters=IsPlayed&Fields=ProviderIds,ProductionYear,UserData';
    const { json } = await fetchJson(fetchImpl, url, { headers: jellyfinHeaders(opts.apiKey) }, 'Jellyfin');
    return Import.parseJellyfinItems(json);
  }

  // Plex takes the token as a query parameter, which avoids a CORS preflight.
  function plexUrl(server, path, token, params) {
    const u = new URL(cleanServer(server) + path);
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
    u.searchParams.set('X-Plex-Token', String(token || '').trim());
    return u.toString();
  }

  async function plexAccounts(opts) {
    const fetchImpl = opts.fetch || fetch.bind(globalThis);
    const { json } = await fetchJson(fetchImpl, plexUrl(opts.server, '/accounts', opts.token), { headers: { Accept: 'application/json' } }, 'Plex');
    const list = (json.MediaContainer && json.MediaContainer.Account) || [];
    return list.filter((a) => a.name).map((a) => ({ id: a.id, name: a.name }));
  }

  async function plexHistory(opts) {
    const fetchImpl = opts.fetch || fetch.bind(globalThis);
    const params = { sort: 'viewedAt:desc' };
    if (opts.accountId != null) params.accountID = opts.accountId;
    const { json } = await fetchJson(fetchImpl, plexUrl(opts.server, '/status/sessions/history/all', opts.token, params), { headers: { Accept: 'application/json' } }, 'Plex');
    const records = Import.parsePlexHistory(json);
    const limit = createLimiter(4);
    const guidCache = new Map();
    await Promise.all(records.map((r) => limit(async () => {
      if (!r.ratingKey) return;
      if (!guidCache.has(r.ratingKey)) {
        try {
          const { json: meta } = await fetchJson(fetchImpl, plexUrl(opts.server, '/library/metadata/' + r.ratingKey, opts.token, { includeGuids: 1 }), { headers: { Accept: 'application/json' } }, 'Plex');
          guidCache.set(r.ratingKey, Import.parsePlexGuids(meta));
        } catch (err) {
          guidCache.set(r.ratingKey, {});
        }
      }
      const g = guidCache.get(r.ratingKey);
      if (g.tmdbId) r.tmdbId = g.tmdbId;
      if (g.imdbId) r.imdbId = g.imdbId;
      if (!r.year && g.year) r.year = g.year;
    })));
    return records;
  }

  // ------------------------------------------------------- Claude (photos) ---

  // Official Anthropic SDK, loaded on demand (this app has no build step).
  const ANTHROPIC_SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
  const VISION_MODEL = 'claude-opus-5';

  async function loadAnthropic() {
    const mod = await import(ANTHROPIC_SDK_URL);
    return mod.default || mod.Anthropic;
  }

  const TITLES_SCHEMA = {
    type: 'object',
    properties: {
      titles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The title exactly as shown, without any season or episode text' },
            year: { type: 'string', description: 'Four-digit release year if it is visible, otherwise an empty string' },
            kind: { type: 'string', enum: ['movie', 'tv', 'unsure'] },
          },
          required: ['title', 'year', 'kind'],
          additionalProperties: false,
        },
      },
    },
    required: ['titles'],
    additionalProperties: false,
  };

  const VISION_PROMPTS = {
    screen:
      "This is a screenshot from a streaming app or website: a viewing history, a 'Continue watching' row, a list, or similar. " +
      'List every film or show title you can read. Mark TV series as "tv". Include the year only if it is shown. ' +
      "Leave out anything you can't read clearly rather than guessing.",
    shelf:
      'This is a photo of DVDs, Blu-rays or 4K discs on a shelf or in a pile. List the title of every film you can read on the spines ' +
      'or covers. Mark TV box sets as "tv". Include the year only if it is printed. ' +
      "Leave out anything you can't read clearly rather than guessing.",
  };

  /**
   * Read film titles from an image.
   * opts: { apiKey, base64, mediaType, purpose: 'screen'|'shelf', Anthropic? }
   * Returns [{ title, year|null }] (films and unsure items; TV is dropped).
   */
  async function extractTitlesFromImage(opts) {
    const Anthropic = opts.Anthropic || (await loadAnthropic());
    const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });
    let response;
    try {
      response = await client.beta.messages.create({
        model: VISION_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: TITLES_SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: opts.mediaType, data: opts.base64 } },
            { type: 'text', text: VISION_PROMPTS[opts.purpose] || VISION_PROMPTS.screen },
          ],
        }],
      });
    } catch (err) {
      throw new Error(friendlyAnthropicError(Anthropic, err));
    }
    if (response.stop_reason === 'refusal') throw new Error('The AI declined to read this image. Try a different photo.');
    if (response.stop_reason === 'max_tokens') throw new Error('Too many titles in one image. Try a closer photo.');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error("The AI's answer couldn't be read. Try again.");
    }
    return (data.titles || [])
      .filter((t) => t.kind !== 'tv' && t.title && t.title.trim())
      .map((t) => ({ title: t.title.trim(), year: /^\d{4}$/.test(t.year) ? Number(t.year) : null }));
  }

  function friendlyAnthropicError(Anthropic, err) {
    if (Anthropic.AuthenticationError && err instanceof Anthropic.AuthenticationError) return "The Anthropic API key wasn't accepted. Check it in Settings.";
    if (Anthropic.PermissionDeniedError && err instanceof Anthropic.PermissionDeniedError) return "That API key can't use this model.";
    if (Anthropic.RateLimitError && err instanceof Anthropic.RateLimitError) return 'Too many requests right now. Wait a minute and try again.';
    if (Anthropic.BadRequestError && err instanceof Anthropic.BadRequestError) return 'The image was rejected: ' + (err.message || 'bad request');
    if (Anthropic.APIConnectionError && err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API. Check your connection.";
    if (Anthropic.APIError && err instanceof Anthropic.APIError && err.status >= 500) return 'The Anthropic API had a problem. Try again shortly.';
    return (err && err.message) || 'Reading the image failed.';
  }

  return {
    TMDB_CERTS, GENRE_IDS, ANTHROPIC_SDK_URL, VISION_MODEL, TITLES_SCHEMA,
    createTmdb, normalizeTmdbMovie, pickCertification, posterUrl, bayesQuality,
    scoreCandidate, decideMatch, matchRecords, ensureDetails,
    findCandidates, quickRateBatch,
    fetchTrakt, jellyfinUsers, jellyfinHistory, plexAccounts, plexHistory,
    extractTitlesFromImage, loadAnthropic,
  };
});
