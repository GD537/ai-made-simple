/*
 * Family Movie Night: recommendation engine.
 *
 * Pure logic: no DOM, no network. Runs in the browser (window.FMEngine) and in
 * Node for tests (require('./engine.js')).
 *
 * How a family pick is made:
 *   1. Each person's taste is learned from their own history (thumbs, how much
 *      they watched, rewatches, watchlist, "not for us"). Old signals fade.
 *      The taste is scaled to the same size for everyone, so the heaviest
 *      watcher doesn't take over the family blend.
 *   2. Every film is scored for each person watching. "No data" scores as
 *      neutral, so a film is only held back for someone when their history
 *      actually says they'd dislike it.
 *   3. The family score blends those scores with equal shares, optionally
 *      leaning toward one person. A film anyone watching would dislike is
 *      pushed down hard ("no one hates it").
 *   4. The age rating is a hard filter set by the strictest viewer present.
 *   5. Films split into "new" and "favourites to watch again", with a cooldown
 *      before a favourite comes back (shorter for children).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FMEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY_MS = 86400000;

  // ------------------------------------------------------------- ratings ---

  // Five internal levels (0 = everyone ... 4 = adults only), labelled per country.
  const RATING_SCALES = {
    AU: ['G', 'PG', 'M', 'MA15+', 'R18+'],
    NZ: ['G', 'PG', 'M', 'R16', 'R18'],
    GB: ['U', 'PG', '12A', '15', '18'],
    US: ['G', 'PG', 'PG-13', 'R', 'NC-17'],
  };
  const COUNTRIES = { AU: 'Australia', NZ: 'New Zealand', GB: 'United Kingdom', US: 'United States' };
  const CERT_LEVELS = {
    AU: { E: 0, G: 0, PG: 1, M: 2, 'MA15+': 3, 'R18+': 4, 'X18+': 4 },
    NZ: { G: 0, PG: 1, M: 2, R13: 2, RP13: 2, R15: 3, R16: 3, RP16: 3, R18: 4, RP18: 4, R: 4 },
    GB: { U: 0, UC: 0, PG: 1, 12: 2, '12A': 2, 15: 3, 18: 4, R18: 4 },
    US: { G: 0, PG: 1, 'PG-13': 2, R: 3, 'NC-17': 4 },
  };
  // A film with no known rating is treated like MA15+: hidden whenever a child is watching.
  const UNKNOWN_RATING_LEVEL = 3;

  function certLevel(country, cert) {
    if (cert == null) return null;
    const key = String(cert).toUpperCase().replace(/\s+/g, '');
    const table = CERT_LEVELS[country];
    if (!table || !Object.prototype.hasOwnProperty.call(table, key)) return null;
    return table[key];
  }

  function ratingLabel(country, level) {
    const scale = RATING_SCALES[country] || RATING_SCALES.AU;
    return scale[Math.max(0, Math.min(scale.length - 1, level))];
  }

  function movieLevel(movie) {
    return movie.ratingLevel == null ? UNKNOWN_RATING_LEVEL : movie.ratingLevel;
  }

  // ------------------------------------------------------------ settings ---

  const SETTINGS_DEFAULTS = {
    country: 'AU',
    newMeans: 'everyone', // 'everyone' | 'most'
    mixShare: 0.4, // share of "Mix" picks that are favourites
    strictness: 'normal', // how hard "no one hates it" pushes down
    variety: 'normal', // how different the films in a row should be
    onlyMyServices: false,
    services: [],
  };
  const MISERY_FLOORS = { relaxed: 0.36, normal: 0.42, strict: 0.48 };
  const VARIETY = { low: 0.05, normal: 0.12, high: 0.22 };
  const TUNING = {
    togetherStrength: 0.6, // a shared watch without a personal thumbs counts this much per person
    familyNightWeight: 0.15, // share of the score from "what we enjoy together"
    minReadiness: 0.35, // below this, a favourite is too recent to suggest again
    confidenceK: 3, // how many signals before a taste profile is trusted
    stretch: 1.6, // spreads typical similarity values over the 0..1 score range
    qualityWeight: 0.2, // share of the score from critic/audience rating
    unknownAgeDays: 730, // age assumed for a signal with no date
    watchlistSignal: 0.25,
    dismissSignal: -0.3,
  };
  const MEMBER_DEFAULTS = {
    adult: { tasteHalfLifeDays: 365, rewatchHalfLifeDays: 180, maxRating: 4 },
    child: { tasteHalfLifeDays: 150, rewatchHalfLifeDays: 30, maxRating: 1 },
  };

  function resolveSettings(settings) {
    return Object.assign({}, SETTINGS_DEFAULTS, settings || {});
  }

  // --------------------------------------------------------------- dates ---

  function dayString(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  }

  function todayString() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function daysBetween(from, to) {
    return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY_MS);
  }

  function decay(days, halfLife) {
    return Math.exp((-Math.LN2 * Math.max(0, days)) / halfLife);
  }

  // ------------------------------------------------------------- vectors ---

  function unit(v) {
    let n = 0;
    v.forEach((x) => { n += x * x; });
    n = Math.sqrt(n);
    const out = new Map();
    if (!n) return out;
    v.forEach((x, k) => out.set(k, x / n));
    return out;
  }

  function dot(a, b) {
    if (a.size > b.size) { const t = a; a = b; b = t; }
    let s = 0;
    a.forEach((x, k) => { const y = b.get(k); if (y) s += x * y; });
    return s;
  }

  function addScaled(target, v, w) {
    v.forEach((x, k) => target.set(k, (target.get(k) || 0) + x * w));
  }

  // TMDB keywords that describe the release rather than the film.
  const KEYWORD_STOPLIST = /creditsstinger|woman director|^\d{4}s$|^sequel$|^remake$|duringcredits|aftercredits/;

  // Genres carry the most weight; directors, cast and keywords refine it.
  function featureVector(movie) {
    const v = new Map();
    const add = (k, w) => v.set(k, (v.get(k) || 0) + w);
    (movie.genres || []).forEach((g) => add('g:' + g, 1));
    (movie.directors || []).slice(0, 2).forEach((d) => add('d:' + d, 0.7));
    (movie.cast || []).slice(0, 4).forEach((c) => add('c:' + c, 0.35));
    (movie.keywords || [])
      .map((k) => String(k).toLowerCase())
      .filter((k) => !KEYWORD_STOPLIST.test(k))
      .slice(0, 8)
      .forEach((k) => add('k:' + k, 0.4));
    return unit(v);
  }

  const GENRE_PHRASES = {
    Action: 'action films', Adventure: 'adventure films', Animation: 'animation', Comedy: 'comedy',
    Crime: 'crime films', Documentary: 'documentaries', Drama: 'drama', Family: 'family films',
    Fantasy: 'fantasy', History: 'history films', Horror: 'horror', Music: 'music films',
    Mystery: 'mysteries', Romance: 'romance', 'Science Fiction': 'sci-fi', 'TV Movie': 'TV movies',
    Thriller: 'thrillers', War: 'war films', Western: 'westerns',
  };

  const KEYWORD_PHRASES = {
    'based on novel or book': 'films based on books', 'based on true story': 'true stories',
    'true story': 'true stories', 'biography': 'true stories', musical: 'musicals',
    superhero: 'superhero films', pixar: 'Pixar films', disney: 'Disney films',
    'period drama': 'period dramas', whodunit: 'whodunits', 'time travel': 'time-travel stories',
  };

  function featureLabel(feature) {
    const kind = feature.slice(0, 2);
    const name = feature.slice(2);
    if (kind === 'g:') return GENRE_PHRASES[name] || name.toLowerCase();
    if (kind === 'd:') return 'films by ' + name;
    if (kind === 'c:') return name;
    if (kind === 'k:') return KEYWORD_PHRASES[name] || 'films about ' + name;
    return name;
  }

  // ------------------------------------------------------------- signals ---

  // How much one history entry says about liking the film (-1 .. 1).
  function entrySignal(entry, tuning) {
    const t = tuning || TUNING;
    let s;
    if (entry.thumbs === 1) s = 1;
    else if (entry.thumbs === -1) s = -1;
    else if (entry.thumbs === 0) s = 0.2;
    else if (entry.owned) s = 0.6;
    else if (entry.completion == null) s = 0.3; // watched, nothing else known
    else if (entry.completion >= 0.8) s = 0.5;
    else if (entry.completion >= 0.4) s = 0.1;
    else s = -0.4; // gave up early: a dislike, not a like
    if (entry.together && entry.thumbs == null) s *= t.togetherStrength;
    return s;
  }

  // Per person, per film: have they seen it, when, and did they like it?
  function aggregateSeen(entries) {
    const byMovie = new Map();
    for (const e of entries) {
      let a = byMovie.get(e.movieId);
      if (!a) {
        a = { count: 0, lastWatched: null, explicit: null, explicitDate: '', implicit: -Infinity };
        byMovie.set(e.movieId, a);
      }
      a.count += 1;
      if (e.watchedOn && (!a.lastWatched || e.watchedOn > a.lastWatched)) a.lastWatched = e.watchedOn;
      if (e.thumbs != null) {
        const d = e.signalDate || '';
        if (a.explicit == null || d >= a.explicitDate) { a.explicit = e.thumbs; a.explicitDate = d; }
      } else {
        a.implicit = Math.max(a.implicit, entrySignal(Object.assign({}, e, { together: false })));
      }
    }
    byMovie.forEach((a) => {
      if (a.explicit != null) a.signal = a.explicit === 1 ? 1 : a.explicit === 0 ? 0.2 : -1;
      else a.signal = a.count >= 2 && a.implicit >= 0 ? Math.max(a.implicit, 0.6) : a.implicit;
      a.liked = a.signal >= 0.5;
      a.disliked = a.signal < 0;
    });
    return byMovie;
  }

  // ------------------------------------------------------------- context ---

  function toMovieMap(movies) {
    if (movies instanceof Map) return movies;
    const m = new Map();
    Object.keys(movies || {}).forEach((k) => { const mv = movies[k]; if (mv) m.set(Number(mv.id != null ? mv.id : k), mv); });
    return m;
  }

  function groupByMember(list) {
    const out = new Map();
    for (const item of list || []) {
      const ids = item.memberIds || [item.memberId];
      for (const id of ids) {
        if (!out.has(id)) out.set(id, []);
        out.get(id).push(item);
      }
    }
    return out;
  }

  function createContext(input) {
    const today = input.today || todayString();
    const movies = toMovieMap(input.movies);
    const members = input.members || [];
    const historyBy = groupByMember(input.history);
    const watchlistBy = groupByMember(input.watchlist);
    const dismissedBy = groupByMember(input.dismissed);
    const featCache = new Map();
    const tasteCache = new Map();
    const seenCache = new Map();
    let docFreq = null;

    const ctx = {
      today, movies, members,
      memberById: new Map(members.map((m) => [m.id, m])),
      reasonUses: new Map(),
      vec(movie) {
        let v = featCache.get(movie.id);
        if (!v) { v = featureVector(movie); featCache.set(movie.id, v); }
        return v;
      },
      // Rarer features make better explanations ("likes Pixar films" beats "likes adventure films").
      idf(feature) {
        if (!docFreq) {
          docFreq = new Map();
          movies.forEach((m) => { if (m && !m.stub) ctx.vec(m).forEach((_, f) => docFreq.set(f, (docFreq.get(f) || 0) + 1)); });
        }
        return Math.log(1 + movies.size / (docFreq.get(feature) || 1));
      },
      historyOf(id) { return historyBy.get(id) || []; },
      seen(id) {
        let s = seenCache.get(id);
        if (!s) { s = aggregateSeen(ctx.historyOf(id)); seenCache.set(id, s); }
        return s;
      },
      taste(member) {
        let t = tasteCache.get(member.id);
        if (!t) { t = buildTaste(ctx, member); tasteCache.set(member.id, t); }
        return t;
      },
      dismissedOf(id) { return dismissedBy.get(id) || []; },
      watchlistOf(id) { return watchlistBy.get(id) || []; },
    };
    return ctx;
  }

  function ageDays(ctx, date) {
    return date ? daysBetween(date, ctx.today) : TUNING.unknownAgeDays;
  }

  function buildTaste(ctx, member) {
    const halfLife = member.tasteHalfLifeDays || MEMBER_DEFAULTS.adult.tasteHalfLifeDays;
    const raw = new Map();
    let evidence = 0;
    const addMovie = (movieId, signal, date) => {
      const movie = ctx.movies.get(movieId);
      if (!movie || !signal) return;
      const w = signal * decay(ageDays(ctx, date), halfLife);
      addScaled(raw, ctx.vec(movie), w);
      evidence += Math.abs(w);
    };
    for (const e of ctx.historyOf(member.id)) addMovie(e.movieId, entrySignal(e), e.signalDate || e.watchedOn);
    for (const w of ctx.watchlistOf(member.id)) addMovie(w.movieId, TUNING.watchlistSignal, w.addedOn);
    for (const d of ctx.dismissedOf(member.id)) addMovie(d.movieId, TUNING.dismissSignal, d.date);
    return { raw, vec: unit(raw), evidence, conf: evidence / (evidence + TUNING.confidenceK) };
  }

  function memberScore(ctx, member, movie) {
    const taste = ctx.taste(member);
    const q = movie.quality == null ? 0.65 : movie.quality;
    let affinity = 0;
    if (taste.vec.size) affinity = dot(taste.vec, ctx.vec(movie)) * taste.conf * TUNING.stretch;
    affinity = Math.max(-1, Math.min(1, affinity));
    return (1 - TUNING.qualityWeight) * (0.5 + 0.5 * affinity) + TUNING.qualityWeight * q;
  }

  // Taste of the household when watching together, learned from shared watches.
  function groupTaste(ctx, viewerIds) {
    const raw = new Map();
    let evidence = 0;
    const seenKeys = new Set();
    for (const id of viewerIds) {
      for (const e of ctx.historyOf(id)) {
        if (!e.together) continue;
        const key = e.movieId + '|' + (e.watchedOn || '');
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const movie = ctx.movies.get(e.movieId);
        if (!movie) continue;
        const s = e.thumbs != null ? entrySignal(e) : entrySignal(Object.assign({}, e, { together: false }));
        const w = s * decay(ageDays(ctx, e.watchedOn || e.signalDate), 365);
        addScaled(raw, ctx.vec(movie), w);
        evidence += Math.abs(w);
      }
    }
    return { vec: unit(raw), conf: evidence / (evidence + TUNING.confidenceK), evidence };
  }

  // -------------------------------------------------------------- family ---

  // Equal shares, with `lean` (0..1) moved toward one person. Always sums to 1.
  function familyWeights(viewerIds, leanTo, lean) {
    const out = {};
    if (!viewerIds.length) return out;
    const base = 1 / viewerIds.length;
    const l = viewerIds.includes(leanTo) ? Math.max(0, Math.min(1, lean || 0)) : 0;
    viewerIds.forEach((id) => { out[id] = (1 - l) * base + (id === leanTo ? l : 0); });
    return out;
  }

  function ratingLimit(viewers) {
    if (!viewers.length) return 4;
    return Math.min.apply(null, viewers.map((v) => (v.maxRating == null ? 4 : v.maxRating)));
  }

  function onServices(movie, services) {
    const p = movie.providers;
    if (!p) return null; // unknown
    const ids = new Set(services.map(Number));
    return (p.flatrate || []).concat(p.free || [], p.ads || []).some((x) => ids.has(Number(x.id)));
  }

  function groupKey(ids) {
    return ids.slice().sort().join(',');
  }

  // Someone with no relevant history scores about 0.55, so that reads as "ok".
  function fitLevel(score) {
    return score >= 0.66 ? 'love' : score >= 0.5 ? 'ok' : 'meh';
  }

  // Greedy re-rank that trades a little score for variety.
  function diversify(ctx, items, k, lambda) {
    const pool = items.slice(0, Math.max(k * 5, 40));
    const picked = [];
    while (picked.length < k && pool.length) {
      let bestIdx = 0;
      let bestVal = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        let maxSim = 0;
        for (const p of picked) maxSim = Math.max(maxSim, dot(ctx.vec(pool[i].movie), ctx.vec(p.movie)));
        const val = pool[i].score - lambda * maxSim;
        if (val > bestVal) { bestVal = val; bestIdx = i; }
      }
      picked.push(pool.splice(bestIdx, 1)[0]);
    }
    return picked;
  }

  function sortByScore(list) {
    return list.sort((a, b) => b.score - a.score || (b.movie.votes || 0) - (a.movie.votes || 0));
  }

  /**
   * Build tonight's suggestions.
   * input: { members, history, watchlist, dismissed, movies, viewerIds, leanTo, lean,
   *          mode: 'new'|'mix'|'favourites', settings, today, k, rowK }
   */
  function recommend(input) {
    const ctx = createContext(input);
    const settings = resolveSettings(input.settings);
    const viewers = (input.viewerIds || []).map((id) => ctx.memberById.get(id)).filter(Boolean);
    const viewerIds = viewers.map((v) => v.id);
    const k = input.k || 6;
    const rowK = input.rowK || 12;
    const empty = { top: [], newRow: [], rewatchRow: [], weights: {}, limitLevel: 4, counts: {} };
    if (!viewers.length) return empty;

    const weights = familyWeights(viewerIds, input.leanTo, input.lean);
    const limitLevel = ratingLimit(viewers);
    const floor = MISERY_FLOORS[settings.strictness] || MISERY_FLOORS.normal;
    const lambda = VARIETY[settings.variety] == null ? VARIETY.normal : VARIETY[settings.variety];
    const useServices = settings.onlyMyServices && (settings.services || []).length > 0;
    const group = viewers.length >= 2 ? groupTaste(ctx, viewerIds) : null;
    const dismissed = new Set();
    viewers.forEach((v) => ctx.dismissedOf(v.id).forEach((d) => dismissed.add(d.movieId)));

    const counts = { considered: 0, hiddenByRating: 0, hiddenByService: 0, newCount: 0, rewatchCount: 0 };
    const newPool = [];
    const rewatchPool = [];

    ctx.movies.forEach((movie) => {
      if (!movie || movie.stub) return;
      counts.considered += 1;
      if (movieLevel(movie) > limitLevel) { counts.hiddenByRating += 1; return; }
      if (dismissed.has(movie.id)) return;

      const seers = [];
      for (const v of viewers) {
        const agg = ctx.seen(v.id).get(movie.id);
        if (agg) seers.push({ v, agg });
      }
      if (seers.some((s) => s.agg.disliked)) return; // someone watching already disliked it

      const unseen = viewers.length - seers.length;
      const isNew = seers.length === 0 || (settings.newMeans === 'most' && unseen > viewers.length / 2);
      if (!isNew && !seers.some((s) => s.agg.liked)) return;

      if (useServices && onServices(movie, settings.services) === false) { counts.hiddenByService += 1; return; }

      const perMember = {};
      let blended = 0;
      let worst = 1;
      for (const v of viewers) {
        const s = memberScore(ctx, v, movie);
        perMember[v.id] = s;
        blended += weights[v.id] * s;
        worst = Math.min(worst, s);
      }
      if (worst < floor) blended -= 2 * (floor - worst);
      if (group && group.vec.size) {
        const g = Math.max(-1, Math.min(1, dot(group.vec, ctx.vec(movie)) * group.conf * TUNING.stretch));
        blended = (1 - TUNING.familyNightWeight) * blended + TUNING.familyNightWeight * (0.5 + 0.5 * g);
      }

      // Readiness: 0 = just watched, 1 = long enough ago (or never seen).
      let readiness = 1;
      if (seers.length) {
        readiness = 0;
        for (const v of viewers) {
          const s = seers.find((x) => x.v.id === v.id);
          let r = 1;
          if (s && s.agg.lastWatched) {
            r = 1 - decay(daysBetween(s.agg.lastWatched, ctx.today), v.rewatchHalfLifeDays || MEMBER_DEFAULTS.adult.rewatchHalfLifeDays);
          }
          readiness += weights[v.id] * r;
        }
        if (readiness < TUNING.minReadiness) return;
      }

      const item = {
        movieId: movie.id,
        movie,
        score: blended * readiness,
        kind: isNew ? 'new' : 'rewatch',
        perMember,
        seenBy: seers.map((s) => ({
          memberId: s.v.id,
          name: s.v.name,
          daysAgo: s.agg.lastWatched ? daysBetween(s.agg.lastWatched, ctx.today) : null,
          liked: s.agg.liked,
        })),
        unseenBy: viewers.filter((v) => !seers.some((s) => s.v.id === v.id)).map((v) => v.name),
      };
      (isNew ? newPool : rewatchPool).push(item);
    });

    sortByScore(newPool);
    sortByScore(rewatchPool);
    counts.newCount = newPool.length;
    counts.rewatchCount = rewatchPool.length;

    // Variety decides which films make the cut; the list is then shown best-first.
    const pick = (pool, n) => sortByScore(diversify(ctx, pool, n, lambda));
    const mode = input.mode || 'mix';
    let top;
    if (mode === 'new') top = pick(newPool, k);
    else if (mode === 'favourites') top = pick(rewatchPool, k);
    else {
      const share = settings.mixShare == null ? 0.4 : settings.mixShare;
      let nRe = Math.min(Math.round(k * share), rewatchPool.length);
      const nNew = Math.min(k - nRe, newPool.length);
      nRe = Math.min(k - nNew, rewatchPool.length); // top up from favourites if new runs short
      top = sortByScore(pick(rewatchPool, nRe).concat(pick(newPool, nNew)));
    }
    const shown = new Set(top.map((x) => x.movieId));
    const newRow = pick(newPool.filter((x) => !shown.has(x.movieId)), rowK);
    const rewatchRow = pick(rewatchPool.filter((x) => !shown.has(x.movieId)), rowK);

    const decorate = (item) => {
      item.bestFor = bestViewer(item, viewers);
      item.reason = explain(ctx, item, viewers);
      item.fit = viewers.map((v) => ({ memberId: v.id, level: fitLevel(item.perMember[v.id]) }));
      return item;
    };
    return {
      top: top.map(decorate),
      newRow: newRow.map(decorate),
      rewatchRow: rewatchRow.map(decorate),
      weights,
      limitLevel,
      counts,
    };
  }

  // -------------------------------------------------------- explanations ---

  function bestViewer(item, viewers) {
    let best = viewers[0];
    for (const v of viewers) if (item.perMember[v.id] > item.perMember[best.id]) best = v;
    return best.id;
  }

  function likedFilms(ctx, member) {
    const out = [];
    ctx.seen(member.id).forEach((agg, movieId) => {
      const movie = ctx.movies.get(movieId);
      if (movie && agg.liked) out.push({ movie, agg });
    });
    return out;
  }

  function topSharedFeature(ctx, member, movie) {
    const taste = ctx.taste(member);
    let best = null;
    let bestVal = 0;
    ctx.vec(movie).forEach((x, f) => {
      const t = taste.vec.get(f) || 0;
      if (t < 0.08) return; // only features the person clearly likes
      const idf = ctx.idf(f);
      const val = x * t * idf * idf;
      if (val > bestVal) { bestVal = val; best = f; }
    });
    return best;
  }

  // The film this person liked that is most like the suggestion (if any is close enough).
  // Films already named on earlier cards count for a bit less, so reasons vary down a list.
  function similarLikedFilm(ctx, member, item, exclude) {
    let best = null;
    let bestVal = 0.3;
    for (const f of likedFilms(ctx, member)) {
      if (f.movie.id === item.movieId || exclude.has(f.movie.id)) continue;
      const sim = dot(ctx.vec(f.movie), ctx.vec(item.movie));
      const val = sim * Math.pow(0.85, ctx.reasonUses.get(f.movie.id) || 0);
      if (sim > 0.3 && val > bestVal) { bestVal = val; best = f; }
    }
    if (best) ctx.reasonUses.set(best.movie.id, (ctx.reasonUses.get(best.movie.id) || 0) + 1);
    return best;
  }

  // Up to two reasons: "Sam loved Spider-Verse", "Mum and Dad like sci-fi", "Ruby loved it".
  function explain(ctx, item, viewers) {
    const ranked = viewers.slice().sort((a, b) => item.perMember[b.id] - item.perMember[a.id]);
    const parts = [];
    const likes = [];
    const named = new Set();
    const usedFilms = new Set();

    const fans = item.seenBy.filter((s) => s.liked);
    if (fans.length) {
      parts.push(joinNames(fans.map((f) => f.name)) + ' loved it');
      fans.forEach((f) => named.add(f.memberId));
    }
    for (const v of ranked) {
      const total = parts.length + likes.length;
      if (named.has(v.id) || item.perMember[v.id] < (total ? 0.58 : 0.55)) continue;
      if (total < 2) {
        const film = similarLikedFilm(ctx, v, item, usedFilms);
        if (film) {
          parts.push(v.name + (film.agg.explicit === 1 ? ' loved ' : ' enjoyed ') + film.movie.title);
          usedFilms.add(film.movie.id);
          named.add(v.id);
          continue;
        }
      }
      const f = topSharedFeature(ctx, v, item.movie);
      if (!f) continue;
      const label = featureLabel(f);
      const same = likes.find((x) => x.label === label);
      if (same) same.names.push(v.name);
      else if (total < 2) likes.push({ label, names: [v.name] });
      else continue;
      named.add(v.id);
    }
    likes.forEach((x) => parts.push(joinNames(x.names) + (x.names.length > 1 ? ' like ' : ' likes ') + x.label));

    if (!parts.length) {
      const q = item.movie.quality || 0;
      return q >= 0.75 ? 'Highly rated, and nothing suggests anyone watching would dislike it' : 'Nothing suggests anyone watching would dislike it';
    }
    return 'Because ' + parts.join(' and ');
  }

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  // ------------------------------------------------------------- profile ---

  function tasteSummary(input, memberId, n) {
    const ctx = createContext(input);
    const member = ctx.memberById.get(memberId);
    if (!member) return { likes: [], dislikes: [], evidence: 0 };
    const t = ctx.taste(member);
    const entries = [];
    t.vec.forEach((x, f) => entries.push([f, x]));
    const count = n || 5;
    const likes = entries.filter((e) => e[1] > 0.05).sort((a, b) => b[1] - a[1]).slice(0, count).map((e) => featureLabel(e[0]));
    const dislikes = entries.filter((e) => e[1] < -0.05).sort((a, b) => a[1] - b[1]).slice(0, 3).map((e) => featureLabel(e[0]));
    return { likes, dislikes, evidence: t.evidence, confidence: t.conf };
  }

  // --------------------------------------------------------------- stats ---

  function computeStats(events, today) {
    const t = today || todayString();
    const within = (e, days) => daysBetween(e.date, t) <= days;
    const picks = events.filter((e) => e.type === 'pick');
    const checkins = events.filter((e) => e.type === 'checkin');
    const byPick = new Map(checkins.map((c) => [c.pickId, c]));
    const modes = {};
    let finished = 0;
    let up = 0;
    let down = 0;
    let rated = 0;
    for (const p of picks) {
      const m = (modes[p.mode] = modes[p.mode] || { picks: 0, checked: 0, finished: 0 });
      m.picks += 1;
      const c = byPick.get(p.id);
      if (!c) continue;
      m.checked += 1;
      if (c.completion >= 0.8) { m.finished += 1; finished += 1; }
      Object.values(c.thumbs || {}).forEach((th) => {
        if (th == null) return;
        rated += 1;
        if (th === 1) up += 1;
        if (th === -1) down += 1;
      });
    }
    const checked = picks.filter((p) => byPick.has(p.id)).length;
    return {
      picks: picks.length,
      picks30: picks.filter((p) => within(p, 30)).length,
      checked,
      finishRate: checked ? finished / checked : null,
      thumbsUpRate: rated ? up / rated : null,
      thumbsDownRate: rated ? down / rated : null,
      byMode: modes,
      byKind: {
        new: picks.filter((p) => p.kind === 'new').length,
        rewatch: picks.filter((p) => p.kind === 'rewatch').length,
      },
      alreadySeen30: events.filter((e) => e.type === 'already-seen' && within(e, 30)).length,
      notForUs30: events.filter((e) => e.type === 'not-for-us' && within(e, 30)).length,
    };
  }

  return {
    RATING_SCALES, COUNTRIES, CERT_LEVELS, UNKNOWN_RATING_LEVEL, SETTINGS_DEFAULTS, MISERY_FLOORS,
    VARIETY, TUNING, MEMBER_DEFAULTS,
    certLevel, ratingLabel, movieLevel, resolveSettings,
    dayString, todayString, daysBetween, decay,
    featureVector, featureLabel, entrySignal, aggregateSeen,
    familyWeights, ratingLimit, groupKey, fitLevel,
    recommend, tasteSummary, computeStats,
  };
});
