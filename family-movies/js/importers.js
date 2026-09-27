/*
 * Family Movie Night: turning exported watch history into records.
 *
 * Every importer produces "records" in one shape, so matching and saving work
 * the same way whatever the source:
 *   { source, profile?, title, year?, tmdbId?, imdbId?, watchedOn?, ratedOn?,
 *     completion?, positionMin?, durationMin?, thumbs?, owned?, watchlist? }
 *
 * No DOM, no network: runs in the browser (window.FMImport) and in Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FMImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ------------------------------------------------------------------ CSV ---

  function detectDelimiter(text) {
    const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQuotes = false;
    for (const c of firstLine) {
      if (c === '"') inQuotes = !inQuotes;
      else if (!inQuotes && c in counts) counts[c] += 1;
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  function parseCSV(text, delimiter) {
    text = String(text).replace(/^﻿/, '');
    const d = delimiter || detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === d) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  }

  function csvObjects(text) {
    const rows = parseCSV(text);
    if (!rows.length) return { headers: [], rows: [] };
    const headers = rows[0].map((h) => h.trim());
    const out = rows.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i] == null ? '' : r[i].trim(); });
      return o;
    });
    return { headers, rows: out };
  }

  // --------------------------------------------------------------- helpers ---

  function normalizeTitle(t) {
    return String(t || '')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^(the|a|an) /, '');
  }

  function hmsToMinutes(s) {
    const m = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
  }

  // Netflix exports mix films and TV. TV titles look like
  // "Show: Season 1: Episode" or "Show: Limited Series: Part 2".
  function isLikelyTv(title) {
    const t = String(title || '');
    if (/:\s*(Season|Series|Limited Series|Volume|Vol\.|Collection|Book|Temporada|Staffel|Saison)\b/i.test(t)) return true;
    if ((t.match(/: /g) || []).length >= 2) return true;
    return /\bEpisode\s+\d+/i.test(t);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function validYmd(y, m, d) {
    if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  function fullYear(y) {
    y = Number(y);
    if (y >= 100) return y;
    const now = new Date().getUTCFullYear() % 100;
    return y <= now + 1 ? 2000 + y : 1900 + y;
  }

  // order: 'DMY' | 'MDY'. ISO dates are always read as year-month-day.
  function parseDate(s, order) {
    const str = String(s || '').trim();
    if (!str) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str);
    if (m) return validYmd(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/.exec(str);
    if (m) {
      const a = +m[1];
      const b = +m[2];
      const y = fullYear(m[3]);
      return order === 'MDY' ? validYmd(y, a, b) : validYmd(y, b, a);
    }
    const t = Date.parse(str);
    return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
  }

  // Looks for a day above 12 to settle whether dates are day-first or month-first.
  function detectDateOrder(values, fallback) {
    for (const v of values) {
      const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{2,4}/.exec(String(v || '').trim());
      if (!m) continue;
      if (+m[1] > 12) return 'DMY';
      if (+m[2] > 12) return 'MDY';
    }
    return fallback || 'DMY';
  }

  function toNumber(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Any rating scale to thumbs: top quarter = loved, bottom 40% = disliked, else OK.
  function thumbsFromScore(value, max) {
    const n = toNumber(value);
    if (n == null || !max) return null;
    const r = n / max;
    if (r >= 0.75) return 1;
    if (r <= 0.4) return -1;
    return 0;
  }

  function thumbsFromText(v) {
    const s = String(v || '').trim().toLowerCase();
    if (!s) return null;
    if (/^(1|yes|y|up|like|liked|love|loved|👍|😍|thumbs up|true)$/.test(s)) return 1;
    if (/^(-1|no|n|down|dislike|disliked|👎|thumbs down|false)$/.test(s)) return -1;
    if (/^(0|ok|okay|meh|fine|😐|neutral)$/.test(s)) return 0;
    return null;
  }

  // ---------------------------------------------------------- recognition ---

  function detectFormat(headers, filename) {
    const h = new Set(headers.map((x) => x.trim()));
    const name = String(filename || '').toLowerCase();
    if (h.has('Profile Name') && h.has('Start Time') && h.has('Title') && h.has('Duration')) return 'netflix-activity';
    if (headers.length === 2 && h.has('Title') && h.has('Date')) return 'netflix-history';
    if (h.has('Letterboxd URI')) return 'letterboxd';
    if (h.has('Const') && h.has('Your Rating')) return 'imdb-ratings';
    if (h.has('Const') && h.has('Title Type') && /watchlist/.test(name)) return 'imdb-watchlist';
    return 'generic';
  }

  const FORMAT_NAMES = {
    'netflix-activity': 'Netflix full data download (all profiles)',
    'netflix-history': 'Netflix viewing activity (one profile)',
    letterboxd: 'Letterboxd export',
    'imdb-ratings': 'IMDb ratings',
    'imdb-watchlist': 'IMDb watchlist',
    generic: 'Spreadsheet (CSV)',
    list: 'List of titles',
  };

  // --------------------------------------------------------------- Netflix ---

  /**
   * ViewingActivity.csv from Netflix's "Download your personal information".
   * One row per viewing session, for every profile. Sessions of the same film
   * within two weeks are one watch; the furthest bookmark shows how far they got.
   */
  function parseNetflixActivity(rows) {
    const groups = new Map();
    for (const r of rows) {
      if ((r['Supplemental Video Type'] || '').trim()) continue; // trailers, previews
      const title = r.Title;
      if (!title || isLikelyTv(title)) continue;
      const start = (r['Start Time'] || '').trim();
      const day = start.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const key = (r['Profile Name'] || '') + '|' + normalizeTitle(title);
      if (!groups.has(key)) groups.set(key, { profile: r['Profile Name'] || '', title, sessions: [] });
      groups.get(key).sessions.push({
        start,
        day,
        durationMin: hmsToMinutes(r.Duration) || 0,
        positionMin: hmsToMinutes(r.Bookmark),
      });
    }
    const out = [];
    groups.forEach((g) => {
      g.sessions.sort((a, b) => (a.start < b.start ? -1 : 1));
      let cur = null;
      const flush = () => { if (cur) out.push(cur); };
      for (const s of g.sessions) {
        const gap = cur ? (Date.parse(s.day) - Date.parse(cur.watchedOn)) / 86400000 : Infinity;
        if (!cur || gap > 14) {
          flush();
          cur = { source: 'netflix', profile: g.profile, title: g.title, watchedOn: s.day, durationMin: 0, positionMin: 0 };
        }
        cur.watchedOn = s.day;
        cur.durationMin += s.durationMin;
        if (s.positionMin != null) cur.positionMin = Math.max(cur.positionMin, s.positionMin);
      }
      flush();
    });
    return out;
  }

  // NetflixViewingHistory.csv from a single profile's "Viewing activity" page.
  function parseNetflixHistory(rows, country) {
    const order = detectDateOrder(rows.map((r) => r.Date), country === 'US' ? 'MDY' : 'DMY');
    return rows
      .filter((r) => r.Title && !isLikelyTv(r.Title))
      .map((r) => ({ source: 'netflix', title: r.Title, watchedOn: parseDate(r.Date, order), completion: null }));
  }

  // Share of the film watched, once the runtime is known.
  function completionFor(record, runtime) {
    if (record.completion != null) return record.completion;
    const pos = record.positionMin || 0;
    const dur = record.durationMin || 0;
    if (!pos && !dur) return null;
    if (runtime) {
      const c = Math.max(pos, dur * 0.9) / runtime;
      return c >= 0.9 ? 1 : Math.round(Math.min(1, c) * 100) / 100;
    }
    const best = Math.max(pos, dur);
    return best >= 70 ? 0.85 : best >= 35 ? 0.5 : 0.2;
  }

  // ------------------------------------------------------------ Letterboxd ---

  // Letterboxd ratings run 0.5-5 stars.
  function parseLetterboxd(rows, filename) {
    const name = String(filename || '').toLowerCase();
    const isWatchlist = /watchlist/.test(name);
    const isLikes = /likes/.test(name);
    return rows.filter((r) => r.Name).map((r) => {
      const rec = { source: 'letterboxd', title: r.Name, year: toNumber(r.Year) };
      if (isWatchlist) { rec.watchlist = true; rec.ratedOn = parseDate(r.Date); return rec; }
      if (r['Watched Date']) rec.watchedOn = parseDate(r['Watched Date']);
      else rec.ratedOn = parseDate(r.Date);
      if (r.Rating) rec.thumbs = thumbsFromScore(r.Rating, 5);
      if (isLikes) rec.thumbs = 1;
      rec.completion = null;
      return rec;
    });
  }

  // ------------------------------------------------------------------ IMDb ---

  function isImdbFilm(type) {
    return !type || /movie|film|video/i.test(type) && !/series|episode|short|game/i.test(type);
  }

  function parseImdbRatings(rows) {
    return rows.filter((r) => r.Const && isImdbFilm(r['Title Type'])).map((r) => ({
      source: 'imdb',
      imdbId: r.Const,
      title: r.Title,
      year: toNumber(r.Year),
      thumbs: thumbsFromScore(r['Your Rating'], 10),
      ratedOn: parseDate(r['Date Rated']),
      completion: null,
    }));
  }

  function parseImdbWatchlist(rows) {
    return rows.filter((r) => r.Const && isImdbFilm(r['Title Type'])).map((r) => ({
      source: 'imdb', imdbId: r.Const, title: r.Title, year: toNumber(r.Year), watchlist: true,
      ratedOn: parseDate(r.Created || r['Date Added']),
    }));
  }

  // --------------------------------------------------------------- generic ---

  // Best guess at which column is which, for the column-matching step.
  function guessMapping(headers) {
    const find = (re) => headers.find((h) => re.test(h)) || '';
    return {
      title: find(/^(title|name|film|movie)$/i) || find(/title|name|film|movie/i),
      year: find(/^(year|release year)$/i),
      date: find(/watched|date|when|viewed/i),
      rating: find(/rating|score|stars|thumbs|liked?/i),
      profile: find(/profile|person|who|user/i),
      scale: 'auto',
    };
  }

  // mapping: { title, year?, date?, rating?, profile?, scale: 'auto'|'5'|'10'|'100'|'thumbs' }
  function parseGeneric(rows, mapping, country) {
    const order = mapping.date ? detectDateOrder(rows.map((r) => r[mapping.date]), country === 'US' ? 'MDY' : 'DMY') : 'DMY';
    let scale = mapping.scale || 'auto';
    if (mapping.rating && scale === 'auto') {
      const nums = rows.map((r) => toNumber(r[mapping.rating])).filter((n) => n != null);
      if (!nums.length) scale = 'thumbs';
      else {
        const max = Math.max.apply(null, nums);
        scale = max <= 1 && Math.min.apply(null, nums) < 0 ? 'thumbs' : max <= 5 ? '5' : max <= 10 ? '10' : '100';
      }
    }
    return rows.filter((r) => (r[mapping.title] || '').trim()).map((r) => {
      const rec = { source: 'csv', title: r[mapping.title].trim(), completion: null };
      if (mapping.year) rec.year = toNumber(r[mapping.year]);
      if (mapping.date) rec.watchedOn = parseDate(r[mapping.date], order);
      if (mapping.profile) rec.profile = r[mapping.profile] || '';
      if (mapping.rating) {
        const v = r[mapping.rating];
        rec.thumbs = scale === 'thumbs' ? thumbsFromText(v) : thumbsFromScore(v, Number(scale));
      }
      return rec;
    });
  }

  // "Moana (2016)", "1. Toy Story", "- Frozen 2013" ... one per line.
  function parseTitleList(text) {
    return String(text || '').split(/\r?\n/).map((line) => {
      let t = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
      if (!t) return null;
      let year = null;
      const m = /^(.*?)[\s,]*[([]?((?:19|20)\d{2})[)\]]?\s*$/.exec(t);
      if (m && m[1].trim()) { t = m[1].trim(); year = Number(m[2]); }
      return { source: 'list', title: t, year, completion: null };
    }).filter(Boolean);
  }

  // ------------------------------------------------------------ connectors ---

  // Trakt history marks a film as watched after about 80% of it.
  function parseTraktHistory(items) {
    return (items || []).filter((i) => i && i.type === 'movie' && i.movie).map((i) => ({
      source: 'trakt',
      title: i.movie.title,
      year: i.movie.year || null,
      tmdbId: (i.movie.ids && i.movie.ids.tmdb) || null,
      imdbId: (i.movie.ids && i.movie.ids.imdb) || null,
      watchedOn: i.watched_at ? i.watched_at.slice(0, 10) : null,
      completion: 0.9,
    }));
  }

  function parseTraktRatings(items) {
    return (items || []).filter((i) => i && i.type === 'movie' && i.movie).map((i) => ({
      source: 'trakt',
      title: i.movie.title,
      year: i.movie.year || null,
      tmdbId: (i.movie.ids && i.movie.ids.tmdb) || null,
      imdbId: (i.movie.ids && i.movie.ids.imdb) || null,
      thumbs: thumbsFromScore(i.rating, 10),
      ratedOn: i.rated_at ? i.rated_at.slice(0, 10) : null,
      completion: null,
    }));
  }

  function parseJellyfinItems(json) {
    return ((json && json.Items) || []).filter((it) => !it.Type || it.Type === 'Movie').map((it) => {
      const ud = it.UserData || {};
      const ids = it.ProviderIds || {};
      return {
        source: 'jellyfin',
        title: it.Name,
        year: it.ProductionYear || null,
        tmdbId: ids.Tmdb ? Number(ids.Tmdb) : null,
        imdbId: ids.Imdb || null,
        watchedOn: ud.LastPlayedDate ? ud.LastPlayedDate.slice(0, 10) : null,
        completion: ud.Played ? 1 : ud.PlayedPercentage != null ? ud.PlayedPercentage / 100 : null,
        thumbs: ud.IsFavorite ? 1 : null,
      };
    });
  }

  // Plex history lists each completed view (Plex marks a film watched at about 90%).
  function parsePlexHistory(json) {
    const items = (json && json.MediaContainer && json.MediaContainer.Metadata) || [];
    return items.filter((m) => m.type === 'movie').map((m) => ({
      source: 'plex',
      title: m.title,
      year: m.year || (m.originallyAvailableAt ? Number(m.originallyAvailableAt.slice(0, 4)) : null),
      watchedOn: m.viewedAt ? new Date(m.viewedAt * 1000).toISOString().slice(0, 10) : null,
      completion: 0.9,
      ratingKey: m.ratingKey,
      accountId: m.accountID,
    }));
  }

  function parsePlexGuids(json) {
    const meta = json && json.MediaContainer && json.MediaContainer.Metadata && json.MediaContainer.Metadata[0];
    const out = { tmdbId: null, imdbId: null, year: (meta && meta.year) || null };
    ((meta && meta.Guid) || []).forEach((g) => {
      const m = /^(tmdb|imdb):\/\/(.+)$/.exec(g.id || '');
      if (m && m[1] === 'tmdb') out.tmdbId = Number(m[2]);
      if (m && m[1] === 'imdb') out.imdbId = m[2];
    });
    return out;
  }

  // ------------------------------------------------------------ merging ---

  function recordKey(r) {
    if (r.tmdbId) return 't:' + r.tmdbId;
    if (r.imdbId) return 'i:' + r.imdbId;
    return 'n:' + normalizeTitle(r.title) + '|' + (r.year || '');
  }

  /**
   * Letterboxd and similar exports list the same film in several files
   * (diary, ratings, watched). Keep one record per dated watch, and fold
   * undated ratings into the latest dated watch.
   */
  function mergeRecords(records) {
    const groups = new Map();
    for (const r of records) {
      const k = (r.profile || '') + '#' + recordKey(r) + (r.watchlist ? '#wl' : '');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const out = [];
    groups.forEach((list) => {
      if (list[0].watchlist) { out.push(list[0]); return; }
      const dated = new Map();
      const undated = [];
      for (const r of list) {
        if (r.watchedOn) {
          const prev = dated.get(r.watchedOn);
          dated.set(r.watchedOn, prev ? Object.assign({}, prev, pickDefined(r)) : Object.assign({}, r));
        } else undated.push(r);
      }
      const rated = undated.filter((r) => r.thumbs != null).sort((a, b) => ((a.ratedOn || '') < (b.ratedOn || '') ? 1 : -1))[0];
      if (dated.size) {
        const latest = Array.from(dated.keys()).sort().pop();
        const target = dated.get(latest);
        if (target.thumbs == null && rated) target.thumbs = rated.thumbs;
        if (undated.some((r) => r.owned)) target.owned = true;
        dated.forEach((r) => out.push(r));
      } else {
        const merged = Object.assign({}, undated[0]);
        if (rated) { merged.thumbs = rated.thumbs; merged.ratedOn = rated.ratedOn; }
        if (undated.some((r) => r.owned)) merged.owned = true;
        out.push(merged);
      }
    });
    return out;
  }

  function pickDefined(r) {
    const o = {};
    Object.keys(r).forEach((k) => { if (r[k] != null) o[k] = r[k]; });
    return o;
  }

  // ------------------------------------------------------------------ zip ---

  // Minimal zip reader (stored and deflated entries), enough for Netflix and
  // Letterboxd downloads. Uses the browser's built-in DecompressionStream.
  async function readZip(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This file is not a zip archive.');
    const count = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const entries = [];
    for (let n = 0; n < count; n++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error('The zip file looks damaged.');
      const method = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
      ptr += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const data = bytes.subarray(start, start + compSize);
      entries.push({
        name,
        async bytes() {
          if (method === 0) return data;
          if (method !== 8) throw new Error('Unsupported compression in ' + name);
          const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(stream).arrayBuffer());
        },
        async text() { return decoder.decode(await this.bytes()); },
      });
    }
    return entries;
  }

  // ------------------------------------------------------------- one call ---

  /**
   * Parse one uploaded text file. Returns { format, records, profiles, headers, rows }.
   * Generic CSVs come back with records: null until a column mapping is chosen.
   */
  function parseFile(name, text, options) {
    const opts = options || {};
    const lower = String(name || '').toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.tsv')) {
      const records = parseTitleList(text);
      return { format: 'list', records, profiles: [] };
    }
    const { headers, rows } = csvObjects(text);
    const format = detectFormat(headers, name);
    let records = null;
    if (format === 'netflix-activity') records = parseNetflixActivity(rows);
    else if (format === 'netflix-history') records = parseNetflixHistory(rows, opts.country);
    else if (format === 'letterboxd') records = parseLetterboxd(rows, name);
    else if (format === 'imdb-ratings') records = parseImdbRatings(rows);
    else if (format === 'imdb-watchlist') records = parseImdbWatchlist(rows);
    const profiles = records ? Array.from(new Set(records.map((r) => r.profile).filter(Boolean))) : [];
    return { format, records, profiles, headers, rows };
  }

  // Which files inside a Netflix or Letterboxd zip are worth reading.
  function interestingZipEntry(name) {
    const n = name.toLowerCase();
    if (/(^|\/)(deleted|orphaned)\//.test(n)) return false; // Letterboxd's removed entries
    if (/(^|\/)viewingactivity\.csv$/.test(n)) return true;
    if (/(^|\/)(diary|ratings|watched|watchlist)\.csv$/.test(n)) return true;
    if (/(^|\/)likes\/films\.csv$/.test(n)) return true;
    return false;
  }

  return {
    parseCSV, csvObjects, normalizeTitle, hmsToMinutes, isLikelyTv, parseDate, detectDateOrder,
    thumbsFromScore, thumbsFromText, detectFormat, FORMAT_NAMES,
    parseNetflixActivity, parseNetflixHistory, completionFor,
    parseLetterboxd, parseImdbRatings, parseImdbWatchlist,
    guessMapping, parseGeneric, parseTitleList,
    parseTraktHistory, parseTraktRatings, parseJellyfinItems, parsePlexHistory, parsePlexGuids,
    recordKey, mergeRecords, readZip, parseFile, interestingZipEntry,
  };
});
