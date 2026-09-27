/*
 * Family Movie Night: the app screens.
 *
 * State lives in localStorage (this browser only). Rendering is plain template
 * strings; every piece of text that came from a person, a file or an API goes
 * through esc(). Clicks are handled by one listener using data-action.
 */
(function () {
  'use strict';

  const E = window.FMEngine;
  const I = window.FMImport;
  const S = window.FMServices;
  const D = window.FMDemo;

  const STATE_KEY = 'familyMovies.state.v1';
  const MOVIES_KEY = 'familyMovies.movies.v1';
  const KEYS_KEY = 'familyMovies.keys.v1';

  const EMOJIS = ['👩', '👨', '🧑', '👵', '👴', '🧒', '👧', '👦', '👶', '🧔', '👱', '🦸', '🐶', '🐱', '🦄', '🐼'];
  const REWATCH_CHOICES = [[14, '2 weeks'], [21, '3 weeks'], [30, '1 month'], [45, '6 weeks'], [90, '3 months'], [180, '6 months'], [365, '1 year']];
  const MEMORY_CHOICES = [[120, '4 months'], [180, '6 months'], [365, '1 year'], [730, '2 years']];
  const FIT_WORDS = { love: 'likely to love it', ok: 'probably fine with it', meh: 'might not enjoy it' };
  const TABS = [['tonight', 'Tonight'], ['people', 'People'], ['import', 'Add history'], ['settings', 'Settings'], ['stats', 'Stats']];

  // ---------------------------------------------------------------- storage

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function defaultState() {
    return {
      version: 1,
      members: [],
      history: [],
      watchlist: [],
      dismissed: [],
      events: [],
      pending: [],
      reviewQueue: [],
      prefs: { viewerIds: [], leanTo: null, lean: 0.5, modeByGroup: {} },
      settings: Object.assign({}, E.SETTINGS_DEFAULTS, { services: [], serviceNames: {}, providerOptions: [] }),
      demo: false,
      lastRefresh: {},
    };
  }

  function loadState() {
    const base = defaultState();
    const saved = readJson(STATE_KEY) || {};
    const s = Object.assign(base, saved);
    s.prefs = Object.assign(defaultState().prefs, saved.prefs || {});
    s.settings = Object.assign(defaultState().settings, saved.settings || {});
    return s;
  }

  let state = loadState();
  let movies = readJson(MOVIES_KEY) || {};
  let keys = readJson(KEYS_KEY) || {};

  const ui = {
    tab: 'tonight',
    seen: null, // open "Seen it" panel
    job: null, // import in progress
    busy: null, // background progress bar
    quick: null, // quick-rate screen
    historyFor: null, // history screen
    setupRows: null,
    toastAction: null,
  };

  function referencedIds() {
    const ids = new Set();
    state.history.forEach((h) => ids.add(h.movieId));
    state.watchlist.forEach((w) => ids.add(w.movieId));
    state.dismissed.forEach((d) => ids.add(d.movieId));
    state.pending.forEach((p) => ids.add(p.movieId));
    return ids;
  }

  // Drop the older half of the films nobody has watched, to make room.
  function pruneMovies() {
    const keep = referencedIds();
    const others = Object.values(movies).filter((m) => m && !keep.has(m.id))
      .sort((a, b) => String(a.fetchedAt || '').localeCompare(String(b.fetchedAt || '')));
    others.slice(0, Math.ceil(others.length / 2)).forEach((m) => { delete movies[m.id]; });
  }

  // The film cache is the thing that grows, so make room in it before giving up on the family data.
  function save() {
    let moviesOk = writeJson(MOVIES_KEY, movies);
    if (!moviesOk) { pruneMovies(); moviesOk = writeJson(MOVIES_KEY, movies); }
    let stateOk = writeJson(STATE_KEY, state);
    if (!stateOk) {
      pruneMovies();
      moviesOk = writeJson(MOVIES_KEY, movies);
      stateOk = writeJson(STATE_KEY, state);
    }
    if (!stateOk) toast("Couldn't save. This browser's storage may be full or turned off.");
    else if (!moviesOk) toast('The film cache is full, so some films were dropped.');
  }

  function saveKeys() {
    writeJson(KEYS_KEY, keys);
  }

  // --------------------------------------------------------------- helpers

  const main = document.getElementById('main');
  const tabsEl = document.getElementById('tabs');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function today() {
    return E.todayString();
  }

  function country() {
    return state.settings.country || 'AU';
  }

  function memberById(id) {
    return state.members.find((m) => m.id === id) || null;
  }

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function namesOf(ids) {
    return joinNames(ids.map(memberById).filter(Boolean).map((m) => m.name));
  }

  function usingCatalog() {
    return !keys.tmdb;
  }

  // Films the engine can suggest: the built-in list until TMDB is connected.
  function allMovies() {
    if (usingCatalog()) return Object.assign({}, D.MOVIES_BY_ID, movies);
    const out = Object.assign({}, movies);
    referencedIds().forEach((id) => { if (!out[id] && D.MOVIES_BY_ID[id]) out[id] = D.MOVIES_BY_ID[id]; });
    return out;
  }

  function movieById(id) {
    return movies[id] || D.MOVIES_BY_ID[id] || null;
  }

  function tmdbClient() {
    return keys.tmdb ? S.createTmdb({ key: keys.tmdb, country: country() }) : null;
  }

  function currentViewers() {
    return state.prefs.viewerIds.filter((id) => memberById(id));
  }

  function engineInput(extra) {
    return Object.assign({
      members: state.members,
      history: state.history,
      watchlist: state.watchlist,
      dismissed: state.dismissed,
      movies: allMovies(),
      settings: state.settings,
      today: today(),
    }, extra || {});
  }

  function fmtRuntime(min) {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm';
  }

  function fmtAgo(days) {
    if (days == null) return 'a while ago';
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return days + ' days ago';
    if (days < 60) return Math.round(days / 7) + ' weeks ago';
    if (days < 365) return Math.round(days / 30) + ' months ago';
    const years = Math.round(days / 365);
    return years === 1 ? 'a year ago' : years + ' years ago';
  }

  function fmtDate(day) {
    if (!day) return 'date unknown';
    const d = new Date(day + 'T00:00:00Z');
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function pct(x) {
    return x == null ? '–' : Math.round(x * 100) + '%';
  }

  function ratingOptions(selected) {
    const scale = E.RATING_SCALES[country()] || E.RATING_SCALES.AU;
    return scale.map((label, level) => `<option value="${level}" ${Number(selected) === level ? 'selected' : ''}>${esc(label)}${level === 4 ? ' (anything)' : ' and below'}</option>`).join('');
  }

  // ------------------------------------------------------------ rendering

  function render() {
    const scroll = {};
    document.querySelectorAll('[data-row]').forEach((el) => { scroll[el.dataset.row] = el.scrollLeft; });
    renderTabs();
    let html = ui.busy ? busyHtml() : '';
    if (!state.members.length && ui.tab !== 'settings') html += viewWelcome();
    else {
      const views = { tonight: viewTonight, people: viewPeople, import: viewImport, settings: viewSettings, stats: viewStats };
      html += (views[ui.tab] || viewTonight)();
    }
    main.innerHTML = html;
    document.querySelectorAll('[data-row]').forEach((el) => { if (scroll[el.dataset.row]) el.scrollLeft = scroll[el.dataset.row]; });
  }

  function renderTabs() {
    tabsEl.innerHTML = TABS.map(([id, label]) => {
      const count = id === 'import' && state.reviewQueue.length ? `<span class="count" aria-label="${state.reviewQueue.length} to check">${state.reviewQueue.length}</span>` : '';
      return `<button class="tab" role="tab" aria-selected="${ui.tab === id}" data-action="tab" data-tab="${id}">${label}${count}</button>`;
    }).join('');
  }

  function busyHtml() {
    const b = ui.busy;
    const w = b.total ? Math.round((b.done / b.total) * 100) : 15;
    return `<div class="banner info busy" id="busy"><span id="busy-label">${esc(b.label)}${b.total ? ` (${b.done} of ${b.total})` : ''}</span>
      <div class="progress"><div id="busy-bar" style="width:${w}%"></div></div></div>`;
  }

  function updateBusy() {
    const b = ui.busy;
    const label = document.getElementById('busy-label');
    const bar = document.getElementById('busy-bar');
    if (!b || !label || !bar) return;
    label.textContent = b.label + (b.total ? ` (${b.done} of ${b.total})` : '');
    bar.style.width = (b.total ? Math.round((b.done / b.total) * 100) : 15) + '%';
  }

  async function withBusy(label, fn) {
    ui.busy = { label, done: 0, total: 0 };
    render();
    try {
      return await fn((done, total, newLabel) => {
        if (!ui.busy) return;
        ui.busy.done = done;
        ui.busy.total = total;
        if (newLabel) ui.busy.label = newLabel;
        updateBusy();
      });
    } finally {
      ui.busy = null;
    }
  }

  let toastTimer = null;
  function toast(msg, action) {
    const el = document.getElementById('toast');
    el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button data-action="toast-action">${esc(action.label)}</button>` : '');
    ui.toastAction = action ? action.fn : null;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 8000 : 4000);
  }

  function posterHtml(m, size) {
    if (m && m.poster) {
      return `<div class="poster"><img src="${esc(S.posterUrl(m.poster, size || 'w185'))}" alt="" loading="lazy" onerror="this.remove()"></div>`;
    }
    const t = m && m.title ? m.title : '';
    return `<div class="poster" aria-hidden="true">${esc(t.length > 28 ? t.slice(0, 26) + '…' : t)}</div>`;
  }

  function ratingBadge(m) {
    if (!m.cert) return '<span class="badge" title="No age rating found. Hidden whenever a child is watching.">Unrated</span>';
    const title = m.certEstimated ? "Estimated from another country's rating" : 'Age rating';
    return `<span class="badge" title="${title}">${esc(m.cert)}${m.certEstimated ? '*' : ''}</span>`;
  }

  // --------------------------------------------------------------- welcome

  function viewWelcome() {
    if (!ui.setupRows) {
      ui.setupRows = [
        { emoji: '👩', name: '', isChild: false, maxRating: 4 },
        { emoji: '👨', name: '', isChild: false, maxRating: 4 },
        { emoji: '🧒', name: '', isChild: true, maxRating: 1 },
        { emoji: '👧', name: '', isChild: true, maxRating: 1 },
      ];
    }
    const rows = ui.setupRows.map((r, i) => `
      <div class="form-grid" style="margin-bottom:0.75rem">
        <div class="field"><label for="setup-name-${i}">Name</label>
          <input type="text" id="setup-name-${i}" value="${esc(r.name)}" placeholder="${r.isChild ? 'e.g. Ruby (6)' : 'e.g. Mum'}" data-input="setup-field" data-index="${i}" data-field="name"></div>
        <div class="field"><label for="setup-emoji-${i}">Picture</label>
          <select id="setup-emoji-${i}" data-change="setup-field" data-index="${i}" data-field="emoji">${EMOJIS.map((e) => `<option ${e === r.emoji ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
        <div class="field"><label for="setup-kind-${i}">Adult or child</label>
          <select id="setup-kind-${i}" data-change="setup-field" data-index="${i}" data-field="isChild">
            <option value="false" ${!r.isChild ? 'selected' : ''}>Adult</option><option value="true" ${r.isChild ? 'selected' : ''}>Child</option></select></div>
        <div class="field"><label for="setup-rating-${i}">Films they can watch</label>
          <select id="setup-rating-${i}" data-change="setup-field" data-index="${i}" data-field="maxRating">${ratingOptions(r.maxRating)}</select></div>
      </div>`).join('');
    return `<section class="panel">
      <h1>Welcome to Family Movie Night</h1>
      <p>Add the people in your family. Everyone gets their own taste profile, and each night's picks blend whoever is watching. You can lean the picks toward one person, and choose new films or favourites.</p>
      <h2>Your family</h2>${rows}
      <div class="btn-row"><button class="btn small" data-action="setup-add">＋ Another person</button></div>
      <div class="btn-row"><button class="btn primary" data-action="setup-save">Save family</button>
      <button class="btn" data-action="setup-demo">Try a demo family first</button></div>
      <p class="hint">Everything is saved in this browser only.</p>
    </section>`;
  }

  // --------------------------------------------------------------- tonight

  function modeHint(mode) {
    if (mode === 'new') return state.settings.newMeans === 'most' ? 'Films at most one of you has seen.' : 'Only films nobody watching has seen.';
    if (mode === 'favourites') return 'Films someone loved, once enough time has passed since they last watched.';
    return `Mostly new films, with about ${Math.round((state.settings.mixShare || 0.4) * 100)}% favourites to watch again.`;
  }

  function leanHint(viewerIds, leanTo, lean) {
    const w = E.familyWeights(viewerIds, leanTo, lean);
    const who = memberById(leanTo);
    const others = viewerIds.filter((id) => id !== leanTo);
    const otherPct = others.length ? Math.round(w[others[0]] * 100) : 0;
    return `${who.name} counts for ${Math.round(w[leanTo] * 100)}%${others.length ? `, everyone else ${otherPct}% each` : ''}. Picks still stay within the age limit and avoid anything someone watching would dislike.`;
  }

  function seenLine(item) {
    if (!item.seenBy.length) return 'New to everyone watching';
    if (item.kind === 'new') {
      return `New to ${joinNames(item.unseenBy)} · ${joinNames(item.seenBy.map((s) => s.name))} saw it ${fmtAgo(item.seenBy[0].daysAgo)}`;
    }
    const seen = 'Seen by ' + item.seenBy.map((s) => `${s.name} (${fmtAgo(s.daysAgo)})`).join(', ');
    return item.unseenBy.length ? `${seen} · new to ${joinNames(item.unseenBy)}` : seen;
  }

  function whereHtml(m) {
    const p = m.providers;
    if (!p) return '';
    const mine = new Set((state.settings.services || []).map(Number));
    const stream = (p.flatrate || []).concat(p.free || [], p.ads || []);
    const names = (list) => Array.from(new Set(list.map((x) => x.name))).slice(0, 3);
    const link = /^https:\/\//i.test(p.link || '') ? ` <a href="${esc(p.link)}" target="_blank" rel="noopener">details</a>` : '';
    const onMine = stream.filter((x) => mine.has(Number(x.id)));
    if (onMine.length) return `<p class="where">On ${esc(joinNames(names(onMine)))}${link}</p>`;
    if (stream.length) return `<p class="where off">Streaming on ${esc(joinNames(names(stream)))}${link}</p>`;
    if ((p.rent || []).length) return `<p class="where off">Rent on ${esc(joinNames(names(p.rent)))}${link}</p>`;
    return `<p class="where off">Not streaming in ${esc(E.COUNTRIES[country()] || country())} right now</p>`;
  }

  function savedByAll(movieId, viewerIds) {
    return viewerIds.length > 0 && viewerIds.every((id) => state.watchlist.some((w) => w.memberId === id && w.movieId === movieId));
  }

  function cardHtml(item, context, viewerIds) {
    const m = item.movie;
    const open = ui.seen && ui.seen.movieId === m.id && ui.seen.context === context;
    const saved = savedByAll(m.id, viewerIds);
    const fit = item.fit.map((f) => {
      const v = memberById(f.memberId);
      return `<span class="${f.level}" title="${esc(v.name + ': ' + FIT_WORDS[f.level])}">${esc(v.emoji)}<span class="sr-only"> ${esc(v.name + ': ' + FIT_WORDS[f.level])}</span> ●</span>`;
    }).join('');
    return `<article class="card">
      <div class="card-top">
        ${posterHtml(m)}
        <div class="card-info">
          <h3>${esc(m.title)} ${m.year ? `<span class="year">(${esc(m.year)})</span>` : ''}</h3>
          <div class="meta">${ratingBadge(m)}<span class="badge ${item.kind}">${item.kind === 'new' ? 'New' : 'Watch again'}</span>${m.runtime ? `<span>${fmtRuntime(m.runtime)}</span>` : ''}</div>
          <p class="seen-line">${esc(seenLine(item))}</p>
          <p class="reason">${esc(item.reason)}</p>
          <div class="fit">${fit}</div>
          ${whereHtml(m)}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn primary small" data-action="watch" data-movie="${esc(m.id)}" data-kind="${item.kind}" data-context="${context}">▶ Watch this</button>
        <button class="btn small" data-action="seen-open" data-movie="${esc(m.id)}" data-context="${context}" aria-expanded="${open}">✓ Seen it</button>
        <button class="btn small" data-action="not-for-us" data-movie="${esc(m.id)}">👎 Not for us</button>
        <button class="btn small" data-action="later" data-movie="${esc(m.id)}" aria-pressed="${saved}">${saved ? '★ Saved' : '＋ Later'}</button>
      </div>
      ${open ? seenPanelHtml() : ''}
    </article>`;
  }

  function seenPanelHtml() {
    const s = ui.seen;
    const chip = (action, value, pressed, label) => `<button class="chip" aria-pressed="${pressed}" data-action="${action}" data-value="${esc(value)}">${label}</button>`;
    return `<div class="inline-panel">
      <span class="control-label">Who's seen it?</span>
      <div class="chips">${state.members.map((v) => chip('seen-who', v.id, s.who.includes(v.id), `<span class="emoji">${esc(v.emoji)}</span>${esc(v.name)}`)).join('')}</div>
      <span class="control-label">How was it?</span>
      <div class="chips">${[['1', '😍 Loved it'], ['0', '🙂 It was OK'], ['-1', '😕 Didn’t like it'], ['', '🤷 Not sure']].map(([v, l]) => chip('seen-how', v, s.how === v, l)).join('')}</div>
      <span class="control-label">When?</span>
      <div class="chips">${[['recent', 'Recently'], ['while', 'A while ago']].map(([v, l]) => chip('seen-when', v, s.when === v, l)).join('')}</div>
      <div class="btn-row"><button class="btn blue small" data-action="seen-save">Save</button><button class="btn small" data-action="seen-cancel">Cancel</button></div>
    </div>`;
  }

  function checkinHtml(p) {
    const m = movieById(p.movieId);
    if (!m) return '';
    const viewers = p.viewerIds.map(memberById).filter(Boolean);
    const thumbs = (v) => [['1', '👍', 'Liked it'], ['0', '😐', 'It was OK'], ['-1', '👎', 'Didn’t like it']].map(([val, icon, label]) =>
      `<button aria-pressed="${String(p.thumbs[v.id]) === val}" aria-label="${esc(v.name)}: ${label}" title="${label}" data-action="ci-thumb" data-pick="${esc(p.pickId)}" data-member="${esc(v.id)}" data-value="${val}">${icon}</button>`).join('');
    return `<section class="panel checkin">
      <h3>How was ${esc(m.title)}?</h3>
      <p class="muted small">Picked ${esc(fmtDate(p.date))} for ${esc(joinNames(viewers.map((v) => v.name)))}. Answer after the film and the next picks get better.</p>
      <span class="control-label">Did you finish it?</span>
      <div class="chips">
        <button class="chip" aria-pressed="${p.finished === true}" data-action="ci-finished" data-pick="${esc(p.pickId)}" data-value="yes">Yes, all of it</button>
        <button class="chip" aria-pressed="${p.finished === false}" data-action="ci-finished" data-pick="${esc(p.pickId)}" data-value="no">We stopped partway</button>
      </div>
      ${p.finished === false ? `<div class="lean-amount"><label for="part-${esc(p.pickId)}">About how much did you watch?</label>
        <input id="part-${esc(p.pickId)}" type="range" min="10" max="90" step="10" value="${Math.round(p.part * 100)}" data-input="ci-part" data-change="ci-part" data-pick="${esc(p.pickId)}">
        <strong id="part-label-${esc(p.pickId)}">${Math.round(p.part * 100)}%</strong></div>` : ''}
      <span class="control-label">What did each person think?</span>
      ${viewers.map((v) => `<div class="person-row"><span>${esc(v.emoji)} ${esc(v.name)}</span><div class="thumbs" role="group" aria-label="${esc(v.name)}">${thumbs(v)}</div></div>`).join('')}
      <div class="btn-row"><button class="btn blue" data-action="ci-save" data-pick="${esc(p.pickId)}">Save</button>
      <button class="btn" data-action="ci-cancel" data-pick="${esc(p.pickId)}">We didn’t watch it</button></div>
    </section>`;
  }

  function viewTonight() {
    const members = state.members;
    const viewerIds = currentViewers();
    const viewers = viewerIds.map(memberById);
    const group = E.groupKey(viewerIds);
    const mode = state.prefs.modeByGroup[group] || 'mix';
    const leanTo = viewerIds.includes(state.prefs.leanTo) ? state.prefs.leanTo : null;
    let out = '';

    if (state.demo) {
      out += `<div class="banner info">This is a demo family with made-up history. <button class="btn small" data-action="start-own">Set up your own family</button></div>`;
    }
    if (usingCatalog()) {
      out += `<div class="banner">Using a small built-in film list (${D.MOVIES.length} films, approximate details). Add a free TMDB key in <a href="#" data-action="tab" data-tab="settings">Settings</a> for the full catalogue, local age ratings and where to watch.</div>`;
    }
    if (!state.demo && state.history.length < 10) {
      out += `<div class="banner info">The more history, the better the picks. <button class="btn small" data-action="tab" data-tab="people">Quick-rate films</button> <button class="btn small" data-action="tab" data-tab="import">Import history</button></div>`;
    }
    out += state.pending.map(checkinHtml).join('');

    out += `<section class="panel">
      <span class="control-label">Who's watching tonight?</span>
      <div class="chips">${members.map((m) => `<button class="chip" aria-pressed="${viewerIds.includes(m.id)}" data-action="toggle-viewer" data-id="${esc(m.id)}"><span class="emoji">${esc(m.emoji)}</span>${esc(m.name)}</button>`).join('')}</div>`;
    if (viewerIds.length > 1) {
      out += `<span class="control-label">Lean the picks toward</span>
        <div class="chips"><button class="chip lean" aria-pressed="${!leanTo}" data-action="lean-to" data-id="">Nobody (equal)</button>
        ${viewers.map((v) => `<button class="chip lean" aria-pressed="${leanTo === v.id}" data-action="lean-to" data-id="${esc(v.id)}"><span class="emoji">${esc(v.emoji)}</span>${esc(v.name)}</button>`).join('')}</div>`;
      if (leanTo) {
        const l = Math.round(state.prefs.lean * 100);
        out += `<div class="lean-amount"><label for="lean">How much?</label>
          <input id="lean" type="range" min="10" max="100" step="10" value="${l}" data-input="lean-amount" data-change="lean-commit">
          <strong id="lean-val">${l}%</strong></div>
          <p class="hint" id="lean-hint">${esc(leanHint(viewerIds, leanTo, state.prefs.lean))}</p>`;
      }
    }
    out += `<span class="control-label">New films or favourites?</span>
      <div class="segmented" role="group" aria-label="New films or favourites">
        ${[['new', 'New only'], ['mix', 'Mix'], ['favourites', 'Favourites']].map(([k, l]) => `<button aria-pressed="${mode === k}" data-action="mode" data-mode="${k}">${l}</button>`).join('')}
      </div><p class="hint">${esc(modeHint(mode))}</p>`;

    if (!viewerIds.length) return out + '<p class="hint">Tap who’s watching to see suggestions.</p></section>';

    const rec = E.recommend(engineInput({ viewerIds, leanTo, lean: state.prefs.lean, mode, k: 6, rowK: 12 }));
    const pendingIds = new Set(state.pending.map((p) => p.movieId));
    const visible = (list) => list.filter((x) => !pendingIds.has(x.movieId));

    if (rec.limitLevel < 4) {
      const strictest = viewers.filter((v) => (v.maxRating == null ? 4 : v.maxRating) === rec.limitLevel).map((v) => v.name);
      const labels = (E.RATING_SCALES[country()] || E.RATING_SCALES.AU).slice(0, rec.limitLevel + 1);
      out += `<p class="hint">Showing ${esc(joinNames(labels))} films only, because ${esc(joinNames(strictest))} ${strictest.length > 1 ? 'are' : 'is'} watching.</p>`;
    }
    if (state.settings.onlyMyServices && rec.counts.hiddenByService) {
      out += `<p class="hint">${rec.counts.hiddenByService} films hidden because they aren't on your services.</p>`;
    }
    out += '</section>';

    const top = visible(rec.top);
    out += `<h2>Tonight's picks</h2>`;
    if (top.length) out += `<div class="grid">${top.map((x) => cardHtml(x, 'top', viewerIds)).join('')}</div>`;
    else if (mode === 'favourites') out += '<p class="muted">No favourites are ready yet. A film becomes a favourite after a 👍 or a finished watch, and comes back once enough time has passed.</p>';
    else out += `<p class="muted">Nothing fits yet. ${usingCatalog() ? 'Add a TMDB key for many more films, or' : 'Try “Find more films”, or'} add some history.</p>`;

    const newRow = visible(rec.newRow);
    const reRow = visible(rec.rewatchRow);
    const newTitle = state.settings.newMeans === 'most' ? 'New to most of you' : 'New for all of you';
    if (newRow.length) out += `<h2>${newTitle}</h2><div class="row" data-row="new">${newRow.map((x) => cardHtml(x, 'new', viewerIds)).join('')}</div>`;
    if (reRow.length) out += `<h2>Favourites to watch again</h2><div class="row" data-row="rewatch">${reRow.map((x) => cardHtml(x, 'rewatch', viewerIds)).join('')}</div>`;

    if (!usingCatalog()) {
      const last = state.lastRefresh[group];
      out += `<div class="btn-row"><button class="btn" data-action="find-more" ${ui.busy ? 'disabled' : ''}>🔎 Find more films</button></div>
        <p class="hint">${last ? 'Last searched ' + esc(fmtAgo(E.daysBetween(last, today()))) + ' for this group.' : ''} Uses TMDB recommendations from everyone's favourites.</p>`;
      if (rec.counts.newCount < 15 && last !== today() && !ui.busy) setTimeout(() => findMore(true), 0);
    }
    return out;
  }

  // ---------------------------------------------------------------- people

  function confidenceWord(c) {
    if (!c || c < 0.3) return 'just getting started';
    if (c < 0.6) return 'getting there';
    return 'well known';
  }

  function memberCard(m, input) {
    const summary = E.tasteSummary(input, m.id);
    const count = state.history.filter((h) => h.memberId === m.id).length;
    const sel = (field, choices, value) => {
      // Show the real value even if it isn't one of the usual choices.
      const all = choices.some(([v]) => v === Number(value)) ? choices : [[Number(value), Number(value) + ' days']].concat(choices);
      return `<select id="${field}-${esc(m.id)}" data-change="member-field" data-id="${esc(m.id)}" data-field="${field}">
        ${all.map(([v, l]) => `<option value="${v}" ${Number(value) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    };
    return `<section class="panel member-card">
      <div class="head"><span class="emoji" aria-hidden="true">${esc(m.emoji)}</span>
        <div><h3>${esc(m.name)}</h3><p class="muted small">${count} film${count === 1 ? '' : 's'} in history · taste ${confidenceWord(summary.confidence)}</p></div></div>
      <p class="likes">${summary.likes.length ? '<strong>Likes:</strong> ' + esc(summary.likes.join(', ')) : 'No likes known yet. Quick-rate a few films to start.'}</p>
      ${summary.dislikes.length ? `<p class="likes"><strong>Not keen on:</strong> ${esc(summary.dislikes.join(', '))}</p>` : ''}
      <div class="btn-row">
        <button class="btn primary small" data-action="quick-rate" data-id="${esc(m.id)}">⚡ Quick rate films</button>
        <button class="btn small" data-action="history-open" data-id="${esc(m.id)}">History</button>
      </div>
      <details style="margin-top:0.75rem"><summary>Edit ${esc(m.name)}</summary>
        <div class="form-grid" style="margin-top:0.75rem">
          <div class="field"><label for="name-${esc(m.id)}">Name</label>
            <input type="text" id="name-${esc(m.id)}" value="${esc(m.name)}" data-change="member-field" data-id="${esc(m.id)}" data-field="name"></div>
          <div class="field"><label for="emoji-${esc(m.id)}">Picture</label>
            <select id="emoji-${esc(m.id)}" data-change="member-field" data-id="${esc(m.id)}" data-field="emoji">${EMOJIS.map((e) => `<option ${e === m.emoji ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
          <div class="field"><label for="maxRating-${esc(m.id)}">Films they can watch</label>
            <select id="maxRating-${esc(m.id)}" data-change="member-field" data-id="${esc(m.id)}" data-field="maxRating">${ratingOptions(m.maxRating == null ? 4 : m.maxRating)}</select></div>
          <div class="field"><label for="rewatchHalfLifeDays-${esc(m.id)}">Favourites come back after about</label>${sel('rewatchHalfLifeDays', REWATCH_CHOICES, m.rewatchHalfLifeDays)}</div>
          <div class="field"><label for="tasteHalfLifeDays-${esc(m.id)}">Older watches fade after about</label>${sel('tasteHalfLifeDays', MEMORY_CHOICES, m.tasteHalfLifeDays)}</div>
        </div>
        <label class="check"><input type="checkbox" ${m.isChild ? 'checked' : ''} data-change="member-field" data-id="${esc(m.id)}" data-field="isChild"> Child (shorter cooldowns, tastes change faster)</label>
        <div class="btn-row"><button class="btn danger small" data-action="member-remove" data-id="${esc(m.id)}">Remove ${esc(m.name)}</button></div>
      </details>
    </section>`;
  }

  function viewPeople() {
    if (ui.quick) return viewQuickRate();
    if (ui.historyFor) return viewHistory();
    const input = engineInput();
    return `<h1>People</h1>
      <p class="muted">Everyone has their own taste profile. Tonight's picks blend whoever is watching.</p>
      <div class="grid" style="margin-top:1rem">${state.members.map((m) => memberCard(m, input)).join('')}</div>
      <div class="btn-row"><button class="btn" data-action="member-add">＋ Add a person</button></div>`;
  }

  function viewQuickRate() {
    const q = ui.quick;
    const m = memberById(q.memberId);
    if (!m) { ui.quick = null; return viewPeople(); }
    const kid = m.isChild;
    const buttons = kid
      ? [['1', '😍', 'Loved it'], ['0', '🙂', 'It was OK'], ['-1', '😕', 'Didn’t like it'], ['skip', '🤷', 'Haven’t seen it']]
      : [['1', '😍 Loved it', 'Loved it'], ['0', '🙂 OK', 'It was OK'], ['-1', '😕 Didn’t like', 'Didn’t like it'], ['skip', '🤷 Not seen', 'Haven’t seen it']];
    const cards = q.items.map((it) => `<div class="qr-card">
        ${posterHtml(it, 'w342')}
        <div class="title">${esc(it.title)}${it.year ? ` (${esc(it.year)})` : ''}</div>
        <div class="qr-buttons">${buttons.map(([v, label, aria]) => `<button data-action="qr-rate" data-movie="${esc(it.id)}" data-value="${v}" aria-label="${esc(aria)}: ${esc(it.title)}" title="${esc(aria)}">${label}</button>`).join('')}</div>
      </div>`).join('');
    return `<h1>Quick rate for ${esc(m.emoji)} ${esc(m.name)}</h1>
      <p class="muted">Tap what ${esc(m.name)} thought of each film. Skip anything ${esc(m.name)} hasn't seen. ${q.rated} rated so far.</p>
      <div class="btn-row"><button class="btn blue" data-action="qr-close">Done</button></div>
      ${q.error ? `<div class="banner error">${esc(q.error)}</div>` : ''}
      <div class="qr-grid ${kid ? 'kid' : ''}" style="margin-top:1rem">${cards}</div>
      ${q.loading ? '<p class="muted">Loading films…</p>' : ''}
      <div class="btn-row"><button class="btn" data-action="qr-more" ${q.loading ? 'disabled' : ''}>Show more films</button><button class="btn blue" data-action="qr-close">Done</button></div>`;
  }

  function viewHistory() {
    const m = memberById(ui.historyFor);
    if (!m) { ui.historyFor = null; return viewPeople(); }
    const entries = state.history.filter((h) => h.memberId === m.id)
      .sort((a, b) => String(b.watchedOn || b.signalDate || '').localeCompare(String(a.watchedOn || a.signalDate || '')));
    const shown = entries.slice(0, ui.historyLimit || 100);
    const how = (h) => {
      const bits = [];
      if (h.thumbs === 1) bits.push('😍 loved');
      else if (h.thumbs === 0) bits.push('🙂 OK');
      else if (h.thumbs === -1) bits.push('😕 didn’t like');
      if (h.completion != null) bits.push(h.completion >= 0.8 ? 'finished' : 'watched ' + Math.round(h.completion * 100) + '%');
      if (h.owned) bits.push('owns it');
      if (h.together) bits.push('together');
      return bits.join(' · ') || 'watched';
    };
    return `<h1>${esc(m.emoji)} ${esc(m.name)}'s history</h1>
      <div class="btn-row"><button class="btn" data-action="history-close">← Back to people</button></div>
      <section class="panel" style="margin-top:1rem">
      ${entries.length ? `<table class="simple"><thead><tr><th>Film</th><th>When</th><th>How</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>
        ${shown.map((h) => { const mv = movieById(h.movieId); return `<tr><td>${esc(mv ? mv.title : 'Film #' + h.movieId)}</td><td>${esc(h.watchedOn ? fmtDate(h.watchedOn) : 'a while ago')}</td><td>${esc(how(h))}<br><span class="muted small">${esc(h.source || '')}</span></td>
          <td><button class="btn small" data-action="history-remove" data-entry="${esc(h.id)}" aria-label="Remove ${esc(mv ? mv.title : 'entry')}">Remove</button></td></tr>`; }).join('')}
        </tbody></table>${entries.length > shown.length ? `<div class="btn-row"><button class="btn small" data-action="history-more">Show more (${entries.length - shown.length} left)</button></div>` : ''}`
        : '<p class="muted">Nothing yet. Quick-rate some films or import history.</p>'}
      </section>`;
  }

  // ---------------------------------------------------------------- import

  const SOURCES = [
    { id: 'netflix', icon: '🟥', name: 'Netflix', blurb: 'Every profile, with how much of each film was watched.' },
    { id: 'letterboxd', icon: '🟢', name: 'Letterboxd', blurb: 'Diary, star ratings, likes and watchlist.' },
    { id: 'imdb', icon: '🟨', name: 'IMDb ratings', blurb: 'Your 1–10 ratings, matched exactly.' },
    { id: 'trakt', icon: '🔴', name: 'Trakt', blurb: 'History logged automatically by apps and media players.' },
    { id: 'screen', icon: '📱', name: 'Screenshot (AI)', blurb: 'Any app without an export: Disney+, Prime Video, Stan, Binge, Apple TV…' },
    { id: 'shelf', icon: '📀', name: 'Shelf photo (AI)', blurb: 'Photograph your DVDs and Blu-rays. Films you own count as strong likes.' },
    { id: 'quick', icon: '⚡', name: 'Quick rate', blurb: 'Two minutes per person: Loved / OK / Didn’t like on well-known films.' },
    { id: 'csv', icon: '📄', name: 'Any spreadsheet (CSV)', blurb: 'Amazon or Disney+ data requests, or your own list.' },
    { id: 'list', icon: '✍️', name: 'Type or paste a list', blurb: 'One film per line, with the year if you know it.' },
    { id: 'jellyfin', icon: '🟪', name: 'Jellyfin', blurb: 'Played films from your own media server.' },
    { id: 'plex', icon: '🟧', name: 'Plex', blurb: 'Watch history from your Plex server.' },
  ];

  function fileInput(accept, multiple, label) {
    return `<div class="field"><label for="history-file">${label}</label>
      <input type="file" id="history-file" accept="${accept}" ${multiple ? 'multiple' : ''} data-file="history" class="input"></div>`;
  }

  function mixedContentWarning(server) {
    return location.protocol === 'https:' && /^http:/i.test(String(server || '').trim());
  }

  function sourcePanel(id) {
    const j = ui.job || {};
    if (id === 'netflix') {
      return `<h3>Netflix</h3>
        <p><strong>Best: the full data download</strong> covers every profile and shows how far into each film people got.</p>
        <ol class="steps"><li>On a computer, go to <a href="https://www.netflix.com/account/getmyinfo" target="_blank" rel="noopener">netflix.com/account/getmyinfo</a> and request your data.</li>
        <li>Netflix emails a download link when it's ready (this can take a while).</li>
        <li>Add the zip here, or just <code>CONTENT_INTERACTION/ViewingActivity.csv</code> from inside it.</li></ol>
        <p><strong>Quicker, one profile at a time:</strong> go to <a href="https://www.netflix.com/viewingactivity" target="_blank" rel="noopener">netflix.com/viewingactivity</a> while using that profile, scroll to the bottom and choose <em>Download all</em>.</p>
        ${fileInput('.zip,.csv', true, 'Netflix zip or CSV files')}`;
    }
    if (id === 'letterboxd') {
      return `<h3>Letterboxd</h3>
        <ol class="steps"><li>In Letterboxd, open Settings and choose <em>Export your data</em>.</li><li>Add the zip here (or the CSV files from inside it).</li></ol>
        ${fileInput('.zip,.csv', true, 'Letterboxd zip or CSV files')}`;
    }
    if (id === 'imdb') {
      return `<h3>IMDb ratings</h3>
        <ol class="steps"><li>On IMDb, open <em>Your ratings</em> and choose <em>Export</em>.</li><li>Add the CSV file here.</li></ol>
        ${fileInput('.csv', true, 'IMDb ratings CSV')}`;
    }
    if (id === 'csv') {
      return `<h3>Any spreadsheet</h3>
        <p>Works with anything saved as CSV: Amazon's <em>Request your data</em> (Prime Video viewing history), a Disney+ privacy request, or your own list. You'll match the columns next.</p>
        ${fileInput('.csv,.tsv', false, 'CSV file')}`;
    }
    if (id === 'list') {
      return `<h3>Type or paste a list</h3>
        <div class="field"><label for="list-text">One film per line</label>
        <textarea id="list-text" placeholder="Toy Story (1995)&#10;Moana&#10;Spider-Man: Into the Spider-Verse">${esc(j.listText || '')}</textarea></div>
        <div class="btn-row"><button class="btn blue" data-action="job-list">Continue</button></div>`;
    }
    if (id === 'screen' || id === 'shelf') {
      const intro = id === 'screen'
        ? '<p>Take screenshots of an app’s viewing history, “Continue watching” row or watchlist. The AI reads the titles; you check them before anything is saved.</p>'
        : '<p>Photograph your DVD and Blu-ray shelves, spines facing the camera. The AI reads the titles; you check them before anything is saved.</p>';
      if (!keys.anthropic) {
        return `<h3>${id === 'screen' ? 'Screenshot' : 'Shelf photo'} (AI)</h3>${intro}
          <div class="banner">This needs an Anthropic API key. Add one in <a href="#" data-action="tab" data-tab="settings">Settings</a>.</div>`;
      }
      return `<h3>${id === 'screen' ? 'Screenshot' : 'Shelf photo'} (AI)</h3>${intro}
        <p class="hint">Photos are sent to Anthropic's API to read the titles, and cost a few cents each on your Anthropic account.</p>
        <div class="field"><label for="photo-file">Photos</label>
        <input type="file" id="photo-file" accept="image/*" multiple data-file="photos" data-purpose="${id}" class="input"></div>`;
    }
    if (id === 'quick') {
      return `<h3>Quick rate</h3><p>Pick a person. You'll see well-known films suited to their age; tap Loved, OK or Didn't like, and skip anything they haven't seen.</p>
        <div class="chips">${state.members.map((m) => `<button class="chip" data-action="quick-rate" data-id="${esc(m.id)}"><span class="emoji">${esc(m.emoji)}</span>${esc(m.name)}</button>`).join('')}</div>`;
    }
    if (id === 'trakt') {
      return `<h3>Trakt</h3>
        <ol class="steps"><li>Make sure the Trakt profile is public (Trakt settings → Privacy).</li>
        <li>Create a free app at <a href="https://trakt.tv/oauth/applications" target="_blank" rel="noopener">trakt.tv/oauth/applications</a> (use <code>urn:ietf:wg:oauth:2.0:oob</code> as the redirect URI) and copy its Client ID.</li></ol>
        <div class="form-grid">
          <div class="field"><label for="trakt-user">Trakt username</label><input type="text" id="trakt-user" value="${esc(j.traktUser || '')}"></div>
          <div class="field"><label for="trakt-id">Client ID</label><input type="password" id="trakt-id" value="${esc(keys.traktClientId || '')}" autocomplete="off"></div>
        </div>
        <div class="btn-row"><button class="btn blue" data-action="job-trakt">Get history</button></div>`;
    }
    if (id === 'jellyfin' || id === 'plex') {
      const isPlex = id === 'plex';
      const server = j.server || '';
      return `<h3>${isPlex ? 'Plex' : 'Jellyfin'}</h3>
        <ol class="steps">${isPlex
          ? '<li>Find your Plex token (Plex support article “Finding an authentication token”).</li><li>Use your server’s https address, for example the <code>…plex.direct:32400</code> address.</li>'
          : '<li>In Jellyfin, open Dashboard → API Keys and create a key.</li><li>Use your server’s address, for example <code>https://jellyfin.example.com</code>.</li>'}
          <li>Your server must allow requests from this page (CORS). If it refuses, export the history to CSV instead.</li></ol>
        <div class="form-grid">
          <div class="field"><label for="server-url">Server address</label><input type="url" id="server-url" value="${esc(server)}" placeholder="https://"></div>
          <div class="field"><label for="server-key">${isPlex ? 'Plex token' : 'API key'}</label><input type="password" id="server-key" value="${esc(j.serverKey || '')}" autocomplete="off"></div>
        </div>
        ${mixedContentWarning(server) ? '<div class="banner error">This page uses https, so the browser will block an http:// server address. Use an https address.</div>' : ''}
        <div class="btn-row"><button class="btn blue" data-action="job-connect" data-source="${id}">Connect</button></div>`;
    }
    return '';
  }

  function jobHtml() {
    const j = ui.job;
    if (!j) return '';
    return (j.error ? `<div class="banner error">${esc(j.error)}</div>` : '') + jobStepHtml(j);
  }

  function jobStepHtml(j) {
    if (j.step === 'working') {
      const w = j.total ? Math.round((j.done / j.total) * 100) : 10;
      return `<section class="panel"><p>${esc(j.label || 'Working…')}${j.total ? ` (${j.done} of ${j.total})` : ''}</p><div class="progress"><div style="width:${w}%"></div></div></section>`;
    }
    if (j.step === 'columns') {
      const g = j.generic;
      const opts = (sel, allowNone) => (allowNone ? '<option value="">(none)</option>' : '') + g.headers.map((h) => `<option ${h === sel ? 'selected' : ''}>${esc(h)}</option>`).join('');
      const field = (key, label, allowNone) => `<div class="field"><label for="map-${key}">${label}</label><select id="map-${key}" data-change="map-field" data-field="${key}">${opts(g.mapping[key], allowNone)}</select></div>`;
      const preview = g.rows.slice(0, 3).map((r) => `<tr>${g.headers.map((h) => `<td>${esc(r[h])}</td>`).join('')}</tr>`).join('');
      return `<section class="panel"><h3>Match the columns</h3>
        <div class="form-grid">${field('title', 'Film title', false)}${field('year', 'Year', true)}${field('date', 'Date watched', true)}${field('rating', 'Rating or like', true)}${field('profile', 'Person or profile', true)}
        <div class="field"><label for="map-scale">Rating scale</label><select id="map-scale" data-change="map-field" data-field="scale">
          ${[['auto', 'Work it out'], ['5', 'Out of 5'], ['10', 'Out of 10'], ['100', 'Out of 100'], ['thumbs', 'Yes / No, like / dislike']].map(([v, l]) => `<option value="${v}" ${g.mapping.scale === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div style="overflow-x:auto"><table class="simple"><thead><tr>${g.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${preview}</tbody></table></div>
        <div class="btn-row"><button class="btn blue" data-action="job-columns">Continue</button><button class="btn" data-action="job-cancel">Cancel</button></div></section>`;
    }
    if (j.step === 'people') {
      let body = '';
      const included = j.records.filter((r) => r.include !== false).length;
      if (j.profiles && j.profiles.length) {
        body += `<p>Who is each ${j.source === 'netflix' ? 'Netflix profile' : 'account'}?</p>` + j.profiles.map((p) => `<div class="field"><label for="pm-${esc(p)}">“${esc(p)}”</label>
          <select id="pm-${esc(p)}" data-change="profile-map" data-profile="${esc(p)}">
            ${state.members.map((m) => `<option value="${esc(m.id)}" ${j.profileMap[p] === m.id ? 'selected' : ''}>${esc(m.emoji)} ${esc(m.name)}</option>`).join('')}
            <option value="all" ${j.profileMap[p] === 'all' ? 'selected' : ''}>Everyone (a shared profile)</option>
            <option value="skip" ${j.profileMap[p] === 'skip' ? 'selected' : ''}>Skip this one</option>
          </select></div>`).join('');
      } else {
        body += `<p>Whose history is this?</p><div class="chips">${state.members.map((m) => `<button class="chip" aria-pressed="${j.who.includes(m.id)}" data-action="job-who" data-id="${esc(m.id)}"><span class="emoji">${esc(m.emoji)}</span>${esc(m.name)}</button>`).join('')}</div>
          <p class="hint">Choosing more than one person records the films as watched together.</p>`;
      }
      if (j.showTitles) {
        body += `<h3 style="margin-top:1rem">Titles found (<span id="titles-count">${included}</span> of ${j.records.length} selected)</h3><p class="hint">Untick anything that was read wrongly.</p>
          <div style="max-height:320px;overflow:auto">${j.records.map((r, i) => `<label class="check"><input type="checkbox" ${r.include !== false ? 'checked' : ''} data-change="job-record" data-index="${i}"> ${esc(r.title)}${r.year ? ` (${esc(r.year)})` : ''}</label>`).join('')}</div>`;
      } else if (j.records) {
        body += `<p class="hint">${j.records.length} film entries found.</p>`;
      }
      return `<section class="panel"><h3>Step 2: who watched?</h3>${body}
        <div class="btn-row"><button class="btn blue" data-action="job-people">Add to history</button><button class="btn" data-action="job-cancel">Cancel</button></div></section>`;
    }
    if (j.step === 'done') {
      const s = j.summary;
      return `<section class="panel"><h3>Done</h3>
        <p>Added <strong>${s.added}</strong> entries (${s.films} different films) for ${esc(s.people || 'your family')}.</p>
        ${s.review ? `<p>${s.review} title${s.review === 1 ? '' : 's'} matched more than one film. Check ${s.review === 1 ? 'it' : 'them'} below.</p>` : ''}
        ${s.notFound.length ? `<details><summary>${s.notFound.length} not found</summary><p class="muted small">${esc(s.notFound.slice(0, 60).join(', '))}${s.notFound.length > 60 ? '…' : ''}</p>
          <p class="hint">Usually TV shows, or spelled very differently. You can add them with “Type or paste a list”.</p></details>` : ''}
        <div class="btn-row"><button class="btn blue" data-action="tab" data-tab="tonight">See tonight's picks</button><button class="btn" data-action="job-cancel">Add more history</button></div></section>`;
    }
    return '';
  }

  function reviewHtml() {
    const q = state.reviewQueue;
    if (!q.length) return '';
    return `<section class="panel"><h2>Did you mean…?</h2>
      <p class="muted">${q.length} imported title${q.length === 1 ? '' : 's'} matched more than one film. Pick the right one, or skip it.</p>
      ${q.slice(0, 15).map((item) => `<div class="review-item">
        <div><strong>“${esc(item.title)}”</strong>${item.year ? ` (${esc(item.year)})` : ''} <span class="muted small">for ${esc(namesOf(item.memberIds))}${item.records.length > 1 ? ` · ${item.records.length} entries` : ''}</span></div>
        <div class="options">${item.options.map((o) => `<button class="option" data-action="review-pick" data-review="${esc(item.id)}" data-movie="${esc(o.id)}">${posterHtml(o, 'w92')}<span>${esc(o.title)}${o.year ? ` (${esc(o.year)})` : ''}</span></button>`).join('')}
        <button class="btn small" data-action="review-skip" data-review="${esc(item.id)}">None of these</button></div></div>`).join('')}
      ${q.length > 15 ? `<p class="hint">${q.length - 15} more after these.</p>` : ''}
    </section>`;
  }

  function viewImport() {
    const active = ui.job && ui.job.source;
    let out = `<h1>Add watch history</h1>
      <p class="muted">More history means better picks. Start with whatever is easiest. Files are read in this browser; only film titles are looked up online.</p>`;
    if (ui.job && ui.job.step !== 'input') {
      out += jobHtml();
    } else {
      out += `<div class="sources" style="margin-top:1rem">${SOURCES.map((s) => `<button class="source" aria-pressed="${active === s.id}" data-action="import-source" data-source="${s.id}">
          <span class="icon" aria-hidden="true">${s.icon}</span><span><strong>${esc(s.name)}</strong><span>${esc(s.blurb)}</span></span></button>`).join('')}</div>`;
      if (active) out += `<section class="panel" style="margin-top:1rem">${sourcePanel(active)}${ui.job.error ? `<div class="banner error">${esc(ui.job.error)}</div>` : ''}</section>`;
    }
    out += reviewHtml();
    return out;
  }

  // -------------------------------------------------------------- settings

  function viewSettings() {
    const st = state.settings;
    const providers = st.providerOptions || [];
    const radio = (name, value, label, checked) => `<label class="check"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} data-change="setting" data-field="${name}"> ${label}</label>`;
    const select = (field, choices, value) => `<select id="set-${field}" data-change="setting" data-field="${field}">${choices.map(([v, l]) => `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<h1>Settings</h1>
      <section class="panel"><h2>Film data (TMDB)</h2>
        <p>A free TMDB key gives the full film catalogue, local age ratings, posters and where to watch. Create an account at <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">themoviedb.org</a>, then go to Settings → API and copy the <em>API Read Access Token</em> (or the API key).</p>
        <div class="field" style="margin-top:0.75rem"><label for="tmdb-key">TMDB key or token</label>
          <input type="password" id="tmdb-key" value="${esc(keys.tmdb || '')}" autocomplete="off" placeholder="Paste it here"></div>
        <div class="btn-row"><button class="btn blue" data-action="tmdb-save">Save and test</button>${keys.tmdb ? '<button class="btn" data-action="tmdb-remove">Remove key</button>' : ''}</div>
        <div class="field" style="margin-top:1rem"><label for="set-country">Country (for age ratings and services)</label>
          ${select('country', Object.entries(E.COUNTRIES), country())}</div>
        <h3 style="margin-top:1rem">Your streaming services</h3>
        ${keys.tmdb ? (providers.length
          ? `<div class="form-grid">${providers.map((p) => `<label class="check"><input type="checkbox" ${st.services.map(Number).includes(Number(p.id)) ? 'checked' : ''} data-change="service-toggle" data-id="${esc(p.id)}" data-name="${esc(p.name)}"> ${esc(p.name)}</label>`).join('')}</div>`
          : '<div class="btn-row"><button class="btn" data-action="load-services">Load services for my country</button></div>')
          : '<p class="muted">Add a TMDB key first.</p>'}
        <label class="check" style="margin-top:0.75rem"><input type="checkbox" ${st.onlyMyServices ? 'checked' : ''} data-change="setting" data-field="onlyMyServices"> Only suggest films streaming on our services</label>
      </section>

      <section class="panel"><h2>Suggestions</h2>
        <span class="control-label">“New” means</span>
        ${radio('newMeans', 'everyone', 'New to everyone watching', st.newMeans !== 'most')}
        ${radio('newMeans', 'most', 'New to most of us (fine if one person watching has seen it)', st.newMeans === 'most')}
        <div class="form-grid" style="margin-top:0.75rem">
          <div class="field"><label for="set-mixShare">In “Mix”, favourites make up</label>${select('mixShare', [[0.2, '20%'], [0.3, '30%'], [0.4, '40%'], [0.5, '50%'], [0.6, '60%']], st.mixShare)}</div>
          <div class="field"><label for="set-strictness">Avoiding films someone would dislike</label>${select('strictness', [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['strict', 'Strict']], st.strictness)}</div>
          <div class="field"><label for="set-variety">Variety in each list</label>${select('variety', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], st.variety)}</div>
        </div>
      </section>

      <section class="panel"><h2>Reading photos with AI (optional)</h2>
        <p>Screenshot and shelf-photo import use Claude (<code>${esc(S.VISION_MODEL)}</code>) to read film titles. Get an API key at <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>. Each photo costs a few cents on your Anthropic account.</p>
        <p class="hint">The key is stored only in this browser and sent only to Anthropic when you read a photo. Anyone using this browser could see it, so only add it on your own device.</p>
        <div class="field" style="margin-top:0.75rem"><label for="anthropic-key">Anthropic API key</label>
          <input type="password" id="anthropic-key" value="${esc(keys.anthropic || '')}" autocomplete="off" placeholder="sk-ant-…"></div>
        <div class="btn-row"><button class="btn blue" data-action="anthropic-save">Save</button>${keys.anthropic ? '<button class="btn" data-action="anthropic-remove">Remove key</button>' : ''}</div>
      </section>

      <section class="panel"><h2>Your data</h2>
        <p>Everything is stored in this browser. Export a backup to move it to another device. Backups don't include your keys.</p>
        <div class="btn-row">
          <button class="btn" data-action="export-backup">⬇ Export backup</button>
          <label class="btn" for="backup-file">⬆ Import backup</label>
          <input type="file" id="backup-file" accept=".json,application/json" data-file="backup" class="sr-only">
        </div>
        <div class="btn-row">
          <button class="btn" data-action="setup-demo">Try the demo family</button>
          <button class="btn" data-action="start-own">Start a new family</button>
          <button class="btn danger" data-action="reset-all">Delete everything</button>
        </div>
      </section>`;
  }

  // ----------------------------------------------------------------- stats

  function viewStats() {
    const s = E.computeStats(state.events, today());
    const input = engineInput();
    const modeRows = Object.entries(s.byMode).map(([mode, m]) => `<tr><td>${esc({ new: 'New only', mix: 'Mix', favourites: 'Favourites' }[mode] || mode)}</td><td>${m.picks}</td><td>${m.checked ? pct(m.finished / m.checked) : '–'}</td></tr>`).join('');
    const people = state.members.map((m) => {
      const t = E.tasteSummary(input, m.id);
      return `<tr><td>${esc(m.emoji)} ${esc(m.name)}</td><td>${state.history.filter((h) => h.memberId === m.id).length}</td><td>${esc(confidenceWord(t.confidence))}</td></tr>`;
    }).join('');
    const stat = (num, label) => `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`;
    return `<h1>How the picks are doing</h1>
      <p class="muted">Tracked from “Watch this” and the check-in afterwards. If these numbers drop after a change, the change didn't help.</p>
      <div class="stat-grid" style="margin-top:1rem">
        ${stat(s.picks30, 'films picked in the last 30 days')}
        ${stat(pct(s.finishRate), 'of checked-in picks were finished')}
        ${stat(pct(s.thumbsUpRate), 'of reactions were 👍')}
        ${stat(s.alreadySeen30, 'suggestions already seen (30 days)')}
        ${stat(s.notForUs30, 'marked “Not for us” (30 days)')}
      </div>
      <h2>By mode</h2>
      <section class="panel">${modeRows ? `<table class="simple"><thead><tr><th>Mode</th><th>Picks</th><th>Finished</th></tr></thead><tbody>${modeRows}</tbody></table>` : '<p class="muted">No picks yet. Press “Watch this” on a suggestion to start tracking.</p>'}</section>
      <h2>What the app knows</h2>
      <section class="panel"><table class="simple"><thead><tr><th>Person</th><th>Films in history</th><th>Taste</th></tr></thead><tbody>${people}</tbody></table>
      <p class="hint">Lots of “already seen” means history is missing: import more. Lots of “not for us” means tastes need more ratings: try quick rate.</p></section>`;
  }

  // ------------------------------------------------------------ data changes

  function addHistory(entry) {
    state.history.push(Object.assign({ id: uid(), together: false, owned: false, completion: null, thumbs: null, watchedOn: null, signalDate: today() }, entry));
  }

  // Save one imported record for the given people. Returns how many entries were added.
  function commitRecord(rec, movieId, memberIds, together) {
    const movie = movieById(movieId);
    if (rec.watchlist) {
      memberIds.forEach((id) => {
        if (!state.watchlist.some((w) => w.memberId === id && w.movieId === movieId)) state.watchlist.push({ memberId: id, movieId, addedOn: rec.ratedOn || today() });
      });
      return 0;
    }
    const completion = I.completionFor(rec, movie && movie.runtime);
    let added = 0;
    for (const id of memberIds) {
      const watchedOn = rec.watchedOn || null;
      const dup = state.history.find((h) => h.memberId === id && h.movieId === movieId && (h.watchedOn || null) === watchedOn);
      if (dup) {
        if (dup.thumbs == null && rec.thumbs != null) dup.thumbs = rec.thumbs;
        if (rec.owned) dup.owned = true;
        continue;
      }
      addHistory({
        memberId: id, movieId, watchedOn,
        signalDate: rec.watchedOn || rec.ratedOn || today(),
        completion, thumbs: rec.thumbs == null ? null : rec.thumbs,
        together: !!together, owned: !!rec.owned, source: rec.source || 'import',
      });
      added += 1;
    }
    return added;
  }

  function guessProfile(name) {
    const n = String(name).toLowerCase();
    const hit = state.members.find((m) => {
      const mn = m.name.toLowerCase().replace(/\s*\(.*\)$/, '');
      return mn === n || n.startsWith(mn) || mn.startsWith(n);
    });
    if (hit) return hit.id;
    if (/family|kids|shared|everyone|home/.test(n)) return 'all';
    return 'skip';
  }

  function toPeopleStep(job, records, profiles) {
    job.records = records;
    job.profiles = profiles || [];
    job.profileMap = {};
    job.profiles.forEach((p) => { job.profileMap[p] = guessProfile(p); });
    job.who = state.members.length === 1 ? [state.members[0].id] : [];
    job.showTitles = ['list', 'screen', 'shelf'].includes(job.source) && records.length <= 300;
    job.step = 'people';
    job.error = null;
  }

  function memberIdsFor(job, rec) {
    if (job.profiles.length) {
      const target = job.profileMap[rec.profile];
      if (!target || target === 'skip') return { ids: [], together: false };
      if (target === 'all') return { ids: state.members.map((m) => m.id), together: true };
      return { ids: [target], together: false };
    }
    return { ids: job.who.slice(), together: job.who.length > 1 };
  }

  async function runMatching(job) {
    const assigned = [];
    for (const r of job.records) {
      if (r.include === false) continue;
      const a = memberIdsFor(job, r);
      if (a.ids.length) assigned.push({ r, ids: a.ids, together: a.together });
    }
    if (!assigned.length) {
      job.step = 'people';
      job.error = job.records.length
        ? 'Nothing to add: choose who watched (every profile is set to “Skip”).'
        : 'No played films were found for the people chosen.';
      render();
      return;
    }
    job.error = null;
    job.step = 'working';
    job.label = 'Looking up films';
    job.done = 0;
    job.total = 0;
    render();
    const progress = (label) => (done, total) => { job.label = label; job.done = done; job.total = total; render(); };
    const tmdb = tmdbClient();
    try {
      const byRecord = new Map(assigned.map((a) => [a.r, a]));
      const res = await S.matchRecords(assigned.map((a) => a.r), { tmdb, catalog: D.MOVIES, onProgress: progress('Looking up films') });
      if (tmdb) await S.ensureDetails(tmdb, res.matched.map((x) => x.movieId), movies, { onProgress: progress('Getting film details') });
      let added = 0;
      for (const x of res.matched) {
        const a = byRecord.get(x.record);
        added += commitRecord(x.record, x.movieId, a.ids, a.together);
      }
      const groups = new Map();
      for (const x of res.review) {
        const a = byRecord.get(x.record);
        const key = I.recordKey(x.record) + '|' + a.ids.join(',');
        if (!groups.has(key)) groups.set(key, { id: uid(), title: x.record.title, year: x.record.year || null, records: [], memberIds: a.ids, together: a.together, options: x.options });
        groups.get(key).records.push(x.record);
      }
      groups.forEach((g) => state.reviewQueue.push(g));
      const people = Array.from(new Set(assigned.flatMap((a) => a.ids)));
      job.summary = {
        added,
        films: new Set(res.matched.map((x) => x.movieId)).size,
        review: groups.size,
        notFound: Array.from(new Set(res.notFound.map((r) => r.title))),
        people: namesOf(people),
      };
      job.step = 'done';
      save();
    } catch (err) {
      job.step = 'input';
      job.error = err.message || 'Something went wrong while matching.';
    }
    render();
  }

  async function readHistoryFiles(fileList) {
    const job = ui.job;
    const records = [];
    const profiles = new Set();
    let generic = null;
    const opts = { country: country() };
    const take = (p) => {
      if (p.records) {
        records.push.apply(records, p.records);
        p.profiles.forEach((x) => profiles.add(x));
      } else if (p.format === 'generic' && !generic) {
        generic = { headers: p.headers, rows: p.rows, mapping: I.guessMapping(p.headers) };
      }
    };
    try {
      for (const file of Array.from(fileList)) {
        if (/\.zip$/i.test(file.name)) {
          const entries = await I.readZip(await file.arrayBuffer());
          const wanted = entries.filter((e) => I.interestingZipEntry(e.name));
          if (!wanted.length) throw new Error(`No viewing history found inside ${file.name}.`);
          for (const e of wanted) take(I.parseFile(e.name, await e.text(), opts));
        } else {
          take(I.parseFile(file.name, await file.text(), opts));
        }
      }
    } catch (err) {
      job.error = err.message || "That file couldn't be read.";
      render();
      return;
    }
    if (!records.length && generic) {
      job.generic = generic;
      job.step = 'columns';
    } else if (!records.length) {
      job.error = "No films were found in that file. If it's a spreadsheet, try “Any spreadsheet (CSV)”.";
    } else {
      toPeopleStep(job, I.mergeRecords(records), Array.from(profiles));
    }
    render();
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // Shrink to the model's 2576px limit and re-encode as JPEG.
  async function prepareImage(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (err) {
      throw new Error(`${file.name} couldn't be opened. Try a JPEG or PNG (for example a screenshot).`);
    }
    const max = 2576;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return { base64: await blobToBase64(blob), mediaType: 'image/jpeg' };
  }

  async function readPhotos(fileList, purpose) {
    const job = ui.job;
    const files = Array.from(fileList);
    const records = [];
    job.step = 'working';
    try {
      for (let i = 0; i < files.length; i++) {
        job.label = `Reading titles from photo ${i + 1} of ${files.length}`;
        job.done = i;
        job.total = files.length;
        render();
        const img = await prepareImage(files[i]);
        const titles = await S.extractTitlesFromImage({ apiKey: keys.anthropic, base64: img.base64, mediaType: img.mediaType, purpose });
        titles.forEach((t) => records.push({ source: purpose === 'shelf' ? 'shelf photo' : 'screenshot', title: t.title, year: t.year, owned: purpose === 'shelf', completion: null }));
      }
    } catch (err) {
      job.step = 'input';
      job.error = err.message;
      render();
      return;
    }
    if (!records.length) {
      job.step = 'input';
      job.error = 'No film titles could be read. Try a closer, sharper photo.';
    } else toPeopleStep(job, I.mergeRecords(records), []);
    render();
  }

  // -------------------------------------------------------- TMDB background

  async function refreshKnownFilms() {
    const tmdb = tmdbClient();
    if (!tmdb) return;
    try {
      await withBusy('Getting details for your films', (progress) =>
        S.ensureDetails(tmdb, Array.from(referencedIds()), movies, { onProgress: (d, t) => progress(d, t) }));
      save();
    } catch (err) {
      toast(err.message);
    }
    render();
  }

  async function findMore(auto) {
    const tmdb = tmdbClient();
    const viewerIds = currentViewers();
    if (!tmdb || !viewerIds.length || ui.busy) return;
    const group = E.groupKey(viewerIds);
    state.lastRefresh[group] = today();
    const viewers = viewerIds.map(memberById);
    try {
      const res = await withBusy('Finding films for ' + joinNames(viewers.map((v) => v.name)), (progress) =>
        S.findCandidates({
          tmdb, members: state.members, history: state.history, movies, viewerIds,
          limitLevel: E.ratingLimit(viewers), settings: state.settings,
          onProgress: (d, t) => progress(d, t, 'Getting film details'),
        }));
      save();
      if (!auto) toast(`Found ${res.found} films to consider.`);
    } catch (err) {
      toast(err.message || "Couldn't reach TMDB.");
    }
    render();
  }

  async function loadQuickRate() {
    const q = ui.quick;
    const m = memberById(q.memberId);
    q.loading = true;
    q.error = null;
    render();
    const seen = new Set(state.history.filter((h) => h.memberId === m.id).map((h) => h.movieId));
    const exclude = new Set(Array.from(seen).concat(Array.from(q.skipped), q.items.map((i) => i.id)));
    try {
      const tmdb = tmdbClient();
      let batch = [];
      for (let tries = 0; tries < 3 && batch.length < 8; tries++) {
        if (tmdb) {
          q.page += 1;
          batch = batch.concat(await S.quickRateBatch({ tmdb, member: m, page: q.page, exclude }));
        } else {
          const kidFriendly = (x) => (x.genres.includes('Family') || x.genres.includes('Animation') ? 1 : 0);
          batch = D.MOVIES.filter((x) => x.ratingLevel <= (m.maxRating == null ? 4 : m.maxRating) && !exclude.has(x.id))
            .sort((a, b) => (m.isChild ? kidFriendly(b) - kidFriendly(a) : 0) || b.votes - a.votes)
            .slice(0, 12);
          break;
        }
      }
      q.items = q.items.concat(batch.map((x) => ({ id: x.id, title: x.title, year: x.year, poster: x.poster })));
      if (!q.items.length) q.error = 'No more films to rate right now.';
    } catch (err) {
      q.error = err.message;
    }
    q.loading = false;
    render();
  }

  let detailTimer = null;
  const detailQueue = new Set();
  function queueDetails(id) {
    const tmdb = tmdbClient();
    if (!tmdb) return;
    detailQueue.add(id);
    clearTimeout(detailTimer);
    detailTimer = setTimeout(async () => {
      const ids = Array.from(detailQueue);
      detailQueue.clear();
      try {
        await S.ensureDetails(tmdb, ids, movies);
        save();
      } catch (err) {
        toast(err.message);
      }
    }, 1200);
  }

  // ----------------------------------------------------------------- backup

  function exportBackup() {
    const data = { app: 'family-movie-night', version: 1, exportedAt: new Date().toISOString(), state, movies };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-movie-night-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // A backup is untrusted input: keep only films with numeric IDs, and numeric years.
  function cleanMovies(raw) {
    const out = {};
    Object.values(raw).forEach((m) => {
      const id = Number(m && m.id);
      if (!m || !Number.isFinite(id)) return;
      const year = Number(m.year);
      out[id] = Object.assign({}, m, { id, title: String(m.title || ''), year: Number.isFinite(year) && year > 0 ? year : null });
    });
    return out;
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'family-movie-night' || !data.state || !Array.isArray(data.state.members)) throw new Error('bad');
      if (state.members.length && !confirm('Replace your current family and history with this backup?')) return;
      state = Object.assign(defaultState(), data.state);
      state.prefs = Object.assign(defaultState().prefs, data.state.prefs || {});
      state.settings = Object.assign(defaultState().settings, data.state.settings || {});
      movies = cleanMovies(data.movies || {});
      state.history.forEach((h) => { h.movieId = Number(h.movieId); });
      save();
      toast('Backup restored.');
      ui.tab = 'tonight';
    } catch (err) {
      toast("That file isn't a Family Movie Night backup.");
    }
    render();
  }

  function loadDemo() {
    if (state.members.length && !state.demo && !confirm('Replace your family with the demo family? Export a backup first if you want to keep it.')) return;
    const demo = D.buildDemoState(today());
    const settings = state.settings;
    state = Object.assign(defaultState(), demo, { demo: true, settings });
    state.prefs.viewerIds = demo.members.map((m) => m.id);
    ui.setupRows = null;
    ui.tab = 'tonight';
    save();
    render();
  }

  // ---------------------------------------------------------------- actions

  function findPending(el) {
    return state.pending.find((p) => p.pickId === el.dataset.pick);
  }

  const actions = {
    tab(el) {
      ui.tab = el.dataset.tab;
      ui.seen = null;
      if (ui.tab !== 'people') { ui.quick = null; ui.historyFor = null; }
      render();
      window.scrollTo(0, 0);
    },
    'toast-action'() {
      const fn = ui.toastAction;
      ui.toastAction = null;
      document.getElementById('toast').classList.remove('show');
      if (fn) fn();
    },

    // welcome
    'setup-add'() {
      ui.setupRows.push({ emoji: '🧑', name: '', isChild: false, maxRating: 4 });
      render();
    },
    'setup-save'() {
      const rows = ui.setupRows.filter((r) => r.name.trim());
      if (!rows.length) { toast('Add at least one name.'); return; }
      state.members = rows.map((r) => {
        const d = r.isChild ? E.MEMBER_DEFAULTS.child : E.MEMBER_DEFAULTS.adult;
        return { id: uid(), name: r.name.trim(), emoji: r.emoji, isChild: r.isChild, maxRating: Number(r.maxRating), tasteHalfLifeDays: d.tasteHalfLifeDays, rewatchHalfLifeDays: d.rewatchHalfLifeDays };
      });
      state.prefs.viewerIds = state.members.map((m) => m.id);
      state.demo = false;
      ui.setupRows = null;
      ui.tab = 'tonight';
      save();
      render();
    },
    'setup-demo'() { loadDemo(); },
    'start-own'() {
      if (state.members.length && !state.demo && !confirm('Start a new family? This clears your current family and history (keys and settings stay). Export a backup first if you want to keep it.')) return;
      const settings = state.settings;
      state = Object.assign(defaultState(), { settings });
      ui.setupRows = null;
      ui.tab = 'tonight';
      save();
      render();
    },

    // tonight
    'toggle-viewer'(el) {
      const id = el.dataset.id;
      const ids = state.prefs.viewerIds;
      state.prefs.viewerIds = ids.includes(id) ? ids.filter((x) => x !== id) : state.members.map((m) => m.id).filter((x) => x === id || ids.includes(x));
      state.prefs.viewersChosen = true;
      save();
      render();
    },
    'lean-to'(el) {
      state.prefs.leanTo = el.dataset.id || null;
      save();
      render();
    },
    mode(el) {
      state.prefs.modeByGroup[E.groupKey(currentViewers())] = el.dataset.mode;
      save();
      render();
    },
    watch(el) {
      const movieId = Number(el.dataset.movie);
      if (state.pending.some((p) => p.movieId === movieId)) return;
      const viewerIds = currentViewers();
      const pickId = uid();
      const group = E.groupKey(viewerIds);
      state.events.push({
        type: 'pick', id: pickId, date: today(), movieId, viewerIds,
        mode: state.prefs.modeByGroup[group] || 'mix', kind: el.dataset.kind, context: el.dataset.context,
        leanTo: viewerIds.includes(state.prefs.leanTo) ? state.prefs.leanTo : null, lean: state.prefs.lean,
      });
      state.pending.push({ pickId, movieId, viewerIds, date: today(), finished: null, part: 0.5, thumbs: {} });
      save();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('Enjoy the film! Tell us how it went when it’s over.');
    },
    'seen-open'(el) {
      const movieId = Number(el.dataset.movie);
      if (ui.seen && ui.seen.movieId === movieId && ui.seen.context === el.dataset.context) ui.seen = null;
      else ui.seen = { movieId, context: el.dataset.context, who: currentViewers(), how: '', when: 'while' };
      render();
    },
    'seen-who'(el) {
      const id = el.dataset.value;
      ui.seen.who = ui.seen.who.includes(id) ? ui.seen.who.filter((x) => x !== id) : ui.seen.who.concat(id);
      render();
    },
    'seen-how'(el) { ui.seen.how = el.dataset.value; render(); },
    'seen-when'(el) { ui.seen.when = el.dataset.value; render(); },
    'seen-cancel'() { ui.seen = null; render(); },
    'seen-save'() {
      const s = ui.seen;
      if (!s.who.length) { toast("Choose who's seen it."); return; }
      for (const id of s.who) {
        addHistory({
          memberId: id, movieId: s.movieId,
          watchedOn: s.when === 'recent' ? today() : null,
          thumbs: s.how === '' ? null : Number(s.how),
          source: 'seen it',
        });
      }
      state.events.push({ type: 'already-seen', date: today(), movieId: s.movieId });
      ui.seen = null;
      save();
      render();
      toast('Saved. That helps the next picks.');
    },
    'not-for-us'(el) {
      const movieId = Number(el.dataset.movie);
      const entry = { movieId, memberIds: currentViewers(), date: today() };
      state.dismissed.push(entry);
      const event = { type: 'not-for-us', date: today(), movieId };
      state.events.push(event);
      save();
      render();
      const m = movieById(movieId);
      toast(`Hidden ${m ? m.title : 'that film'}.`, {
        label: 'Undo',
        fn() {
          state.dismissed = state.dismissed.filter((d) => d !== entry);
          state.events = state.events.filter((e) => e !== event);
          save();
          render();
        },
      });
    },
    later(el) {
      const movieId = Number(el.dataset.movie);
      const viewerIds = currentViewers();
      if (savedByAll(movieId, viewerIds)) {
        state.watchlist = state.watchlist.filter((w) => !(w.movieId === movieId && viewerIds.includes(w.memberId)));
      } else {
        viewerIds.forEach((id) => {
          if (!state.watchlist.some((w) => w.memberId === id && w.movieId === movieId)) state.watchlist.push({ memberId: id, movieId, addedOn: today() });
        });
      }
      save();
      render();
    },
    'find-more'() { findMore(false); },

    // check-in
    'ci-finished'(el) { const p = findPending(el); if (p) { p.finished = el.dataset.value === 'yes'; save(); render(); } },
    'ci-thumb'(el) {
      const p = findPending(el);
      if (!p) return;
      const v = Number(el.dataset.value);
      if (p.thumbs[el.dataset.member] === v) delete p.thumbs[el.dataset.member];
      else p.thumbs[el.dataset.member] = v;
      save();
      render();
    },
    'ci-save'(el) {
      const p = findPending(el);
      if (!p) return;
      if (p.finished == null) { toast('Did you finish it? Choose one first.'); return; }
      const completion = p.finished ? 1 : p.part;
      const together = p.viewerIds.length > 1;
      p.viewerIds.forEach((id) => {
        addHistory({
          memberId: id, movieId: p.movieId, watchedOn: p.date, completion,
          thumbs: p.thumbs[id] == null ? null : p.thumbs[id], together, source: 'check-in',
        });
      });
      state.events.push({ type: 'checkin', pickId: p.pickId, date: today(), completion, thumbs: Object.assign({}, p.thumbs) });
      state.pending = state.pending.filter((x) => x !== p);
      save();
      render();
      toast('Thanks! The next picks will use that.');
    },
    'ci-cancel'(el) {
      const p = findPending(el);
      if (!p) return;
      state.pending = state.pending.filter((x) => x !== p);
      state.events = state.events.filter((e) => !(e.type === 'pick' && e.id === p.pickId));
      save();
      render();
    },

    // people
    'member-add'() {
      const d = E.MEMBER_DEFAULTS.adult;
      const m = { id: uid(), name: 'New person', emoji: '🧑', isChild: false, maxRating: 4, tasteHalfLifeDays: d.tasteHalfLifeDays, rewatchHalfLifeDays: d.rewatchHalfLifeDays };
      state.members.push(m);
      save();
      render();
      const input = document.getElementById('name-' + m.id);
      if (input) { input.closest('details').open = true; input.focus(); input.select(); }
    },
    'member-remove'(el) {
      const m = memberById(el.dataset.id);
      if (!m || !confirm(`Remove ${m.name} and all of ${m.name}'s history?`)) return;
      state.members = state.members.filter((x) => x.id !== m.id);
      state.history = state.history.filter((h) => h.memberId !== m.id);
      state.watchlist = state.watchlist.filter((w) => w.memberId !== m.id);
      state.dismissed.forEach((d) => { d.memberIds = d.memberIds.filter((id) => id !== m.id); });
      state.dismissed = state.dismissed.filter((d) => d.memberIds.length);
      state.prefs.viewerIds = state.prefs.viewerIds.filter((id) => id !== m.id);
      if (state.prefs.leanTo === m.id) state.prefs.leanTo = null;
      state.pending.forEach((p) => { p.viewerIds = p.viewerIds.filter((id) => id !== m.id); delete p.thumbs[m.id]; });
      state.pending = state.pending.filter((p) => p.viewerIds.length);
      state.reviewQueue.forEach((r) => { r.memberIds = r.memberIds.filter((id) => id !== m.id); });
      state.reviewQueue = state.reviewQueue.filter((r) => r.memberIds.length);
      save();
      render();
    },
    'quick-rate'(el) {
      ui.tab = 'people';
      ui.historyFor = null;
      ui.quick = { memberId: el.dataset.id, items: [], page: 0, rated: 0, skipped: new Set(), loading: false, error: null };
      loadQuickRate();
      window.scrollTo(0, 0);
    },
    'qr-rate'(el) {
      const q = ui.quick;
      const id = Number(el.dataset.movie);
      const item = q.items.find((x) => x.id === id);
      q.items = q.items.filter((x) => x.id !== id);
      if (el.dataset.value === 'skip') q.skipped.add(id);
      else {
        if (!movieById(id) && item) movies[id] = { id, title: item.title, year: item.year, poster: item.poster, stub: true };
        addHistory({ memberId: q.memberId, movieId: id, thumbs: Number(el.dataset.value), source: 'quick rate' });
        q.rated += 1;
        queueDetails(id);
        save();
      }
      if (q.items.length < 4 && !q.loading) loadQuickRate();
      else render();
    },
    'qr-more'() { loadQuickRate(); },
    'qr-close'() { ui.quick = null; render(); },
    'history-open'(el) { ui.historyFor = el.dataset.id; ui.historyLimit = 100; render(); window.scrollTo(0, 0); },
    'history-close'() { ui.historyFor = null; render(); },
    'history-more'() { ui.historyLimit = (ui.historyLimit || 100) + 200; render(); },
    'history-remove'(el) {
      state.history = state.history.filter((h) => h.id !== el.dataset.entry);
      save();
      render();
    },

    // import
    'import-source'(el) {
      ui.job = { source: el.dataset.source, step: 'input', error: null };
      render();
    },
    'job-cancel'() { ui.job = null; render(); },
    'job-list'() {
      const text = (document.getElementById('list-text') || {}).value || '';
      ui.job.listText = text;
      const records = I.parseTitleList(text);
      if (!records.length) { ui.job.error = 'Type at least one film title.'; render(); return; }
      toPeopleStep(ui.job, I.mergeRecords(records), []);
      render();
    },
    'job-columns'() {
      const job = ui.job;
      const g = job.generic;
      if (!g.mapping.title) { toast('Choose the column with film titles.'); return; }
      const records = I.parseGeneric(g.rows, g.mapping, country());
      const profiles = g.mapping.profile ? Array.from(new Set(records.map((r) => r.profile).filter(Boolean))) : [];
      toPeopleStep(job, I.mergeRecords(records), profiles);
      render();
    },
    'job-who'(el) {
      const id = el.dataset.id;
      const who = ui.job.who;
      ui.job.who = who.includes(id) ? who.filter((x) => x !== id) : who.concat(id);
      render();
    },
    async 'job-people'() {
      const job = ui.job;
      if (!job.profiles.length && !job.who.length) { toast('Choose who watched first.'); return; }
      if (job.profiles.length && job.profiles.every((p) => job.profileMap[p] === 'skip')) {
        job.error = 'Every profile is set to “Skip”. Choose who at least one of them is.';
        render();
        return;
      }
      if (job.source === 'jellyfin' || job.source === 'plex') {
        job.step = 'working';
        job.label = 'Getting history from your server';
        render();
        try {
          const records = [];
          for (const u of job.users) {
            const target = job.profileMap[u.name];
            if (!target || target === 'skip') continue;
            const list = job.source === 'jellyfin'
              ? await S.jellyfinHistory({ server: job.server, apiKey: job.serverKey, userId: u.id })
              : await S.plexHistory({ server: job.server, token: job.serverKey, accountId: u.id });
            list.forEach((r) => { r.profile = u.name; records.push(r); });
          }
          job.records = I.mergeRecords(records);
        } catch (err) {
          job.step = 'input';
          job.error = err.message;
          render();
          return;
        }
      }
      runMatching(job);
    },
    async 'job-trakt'() {
      const job = ui.job;
      const user = document.getElementById('trakt-user').value.trim();
      const clientId = document.getElementById('trakt-id').value.trim();
      job.traktUser = user;
      if (!user || !clientId) { job.error = 'Enter the username and Client ID.'; render(); return; }
      keys.traktClientId = clientId;
      saveKeys();
      job.step = 'working';
      job.label = 'Getting Trakt history';
      render();
      try {
        const records = await S.fetchTrakt({ clientId, username: user });
        if (!records.length) throw new Error('No films found on that Trakt profile.');
        toPeopleStep(job, I.mergeRecords(records), []);
      } catch (err) {
        job.step = 'input';
        job.error = err.message;
      }
      render();
    },
    async 'job-connect'(el) {
      const job = ui.job;
      job.server = document.getElementById('server-url').value.trim();
      job.serverKey = document.getElementById('server-key').value.trim();
      if (!job.server || !job.serverKey) { job.error = 'Enter the server address and key.'; render(); return; }
      if (mixedContentWarning(job.server)) { job.error = 'Use an https:// server address; the browser blocks http:// from this page.'; render(); return; }
      job.step = 'working';
      job.label = 'Connecting';
      render();
      try {
        const users = el.dataset.source === 'plex'
          ? await S.plexAccounts({ server: job.server, token: job.serverKey })
          : await S.jellyfinUsers({ server: job.server, apiKey: job.serverKey });
        if (!users.length) throw new Error('No users found on that server.');
        job.users = users;
        toPeopleStep(job, [], users.map((u) => u.name));
      } catch (err) {
        job.step = 'input';
        job.error = err.message;
      }
      render();
    },
    async 'review-pick'(el) {
      const item = state.reviewQueue.find((r) => r.id === el.dataset.review);
      if (!item) return;
      const movieId = Number(el.dataset.movie);
      const tmdb = tmdbClient();
      if (tmdb) {
        try {
          await S.ensureDetails(tmdb, [movieId], movies);
        } catch (err) {
          toast(err.message);
          return;
        }
      }
      item.records.forEach((r) => commitRecord(r, movieId, item.memberIds, item.together));
      state.reviewQueue = state.reviewQueue.filter((r) => r !== item);
      save();
      render();
    },
    'review-skip'(el) {
      state.reviewQueue = state.reviewQueue.filter((r) => r.id !== el.dataset.review);
      save();
      render();
    },

    // settings
    async 'tmdb-save'() {
      const key = document.getElementById('tmdb-key').value.trim();
      if (!key) { toast('Paste your TMDB key first.'); return; }
      try {
        await S.createTmdb({ key, country: country() }).test();
      } catch (err) {
        toast(err.message || "Couldn't reach TMDB.");
        return;
      }
      keys.tmdb = key;
      saveKeys();
      toast('TMDB connected.');
      render();
      await refreshKnownFilms();
    },
    'tmdb-remove'() {
      delete keys.tmdb;
      saveKeys();
      render();
    },
    async 'load-services'() {
      const tmdb = tmdbClient();
      try {
        const res = await tmdb.providers();
        const c = country();
        const list = (res.results || [])
          .sort((a, b) => ((a.display_priorities && a.display_priorities[c]) || a.display_priority || 999) - ((b.display_priorities && b.display_priorities[c]) || b.display_priority || 999))
          .slice(0, 40)
          .map((p) => ({ id: p.provider_id, name: p.provider_name }));
        state.settings.providerOptions = list;
        save();
      } catch (err) {
        toast(err.message);
      }
      render();
    },
    'anthropic-save'() {
      const key = document.getElementById('anthropic-key').value.trim();
      if (!key) { toast('Paste your Anthropic API key first.'); return; }
      keys.anthropic = key;
      saveKeys();
      toast('Saved.');
      render();
    },
    'anthropic-remove'() {
      delete keys.anthropic;
      saveKeys();
      render();
    },
    'export-backup'() { exportBackup(); },
    'reset-all'() {
      if (!confirm('Delete your family, history, settings and keys from this browser?')) return;
      try {
        localStorage.removeItem(STATE_KEY);
        localStorage.removeItem(MOVIES_KEY);
        localStorage.removeItem(KEYS_KEY);
      } catch (err) { /* storage blocked: nothing to clear */ }
      state = defaultState();
      movies = {};
      keys = {};
      ui.setupRows = null;
      ui.tab = 'tonight';
      render();
    },
  };

  // Text inputs and sliders that update without a full re-render.
  const inputs = {
    'setup-field'(el) {
      ui.setupRows[Number(el.dataset.index)][el.dataset.field] = el.value;
    },
    'lean-amount'(el) {
      state.prefs.lean = Number(el.value) / 100;
      const label = document.getElementById('lean-val');
      if (label) label.textContent = el.value + '%';
      const hint = document.getElementById('lean-hint');
      const viewerIds = currentViewers();
      if (hint && state.prefs.leanTo) hint.textContent = leanHint(viewerIds, state.prefs.leanTo, state.prefs.lean);
    },
    'ci-part'(el) {
      const p = findPending(el);
      if (!p) return;
      p.part = Number(el.value) / 100;
      const label = document.getElementById('part-label-' + p.pickId);
      if (label) label.textContent = el.value + '%';
    },
  };

  const changes = {
    'lean-commit'() { save(); render(); },
    'ci-part'() { save(); },
    'setup-field'(el) {
      const row = ui.setupRows[Number(el.dataset.index)];
      const field = el.dataset.field;
      if (field === 'isChild') {
        row.isChild = el.value === 'true';
        row.maxRating = row.isChild ? E.MEMBER_DEFAULTS.child.maxRating : E.MEMBER_DEFAULTS.adult.maxRating;
        render();
      } else if (field === 'maxRating') row.maxRating = Number(el.value);
      else row[field] = el.value;
    },
    'member-field'(el) {
      const m = memberById(el.dataset.id);
      if (!m) return;
      const field = el.dataset.field;
      if (field === 'name') m.name = el.value.trim() || m.name;
      else if (field === 'emoji') m.emoji = el.value;
      else if (field === 'isChild') {
        m.isChild = el.checked;
        const d = m.isChild ? E.MEMBER_DEFAULTS.child : E.MEMBER_DEFAULTS.adult;
        m.tasteHalfLifeDays = d.tasteHalfLifeDays;
        m.rewatchHalfLifeDays = d.rewatchHalfLifeDays;
        if (m.isChild && (m.maxRating == null || m.maxRating > 1)) m.maxRating = d.maxRating;
      } else m[field] = Number(el.value);
      save();
      render();
    },
    setting(el) {
      const field = el.dataset.field;
      const st = state.settings;
      if (field === 'onlyMyServices') st.onlyMyServices = el.checked;
      else if (field === 'mixShare') st.mixShare = Number(el.value);
      else if (field === 'country') {
        st.country = el.value;
        st.providerOptions = [];
        st.services = [];
        Object.values(movies).forEach((m) => { if (m) m.fetchedAt = null; }); // ratings and services differ by country
        save();
        render();
        refreshKnownFilms();
        return;
      } else st[field] = el.value;
      save();
      render();
    },
    'service-toggle'(el) {
      const id = Number(el.dataset.id);
      const st = state.settings;
      st.services = el.checked ? Array.from(new Set(st.services.map(Number).concat(id))) : st.services.map(Number).filter((x) => x !== id);
      st.serviceNames[id] = el.dataset.name;
      save();
    },
    'map-field'(el) {
      ui.job.generic.mapping[el.dataset.field] = el.value;
    },
    'profile-map'(el) {
      ui.job.profileMap[el.dataset.profile] = el.value;
    },
    'job-record'(el) {
      ui.job.records[Number(el.dataset.index)].include = el.checked;
      const label = document.getElementById('titles-count');
      if (label) label.textContent = ui.job.records.filter((r) => r.include !== false).length;
    },
  };

  const fileHandlers = {
    history(files) { if (files.length) readHistoryFiles(files); },
    photos(files, el) { if (files.length) readPhotos(files, el.dataset.purpose); },
    backup(files) { if (files.length) importBackup(files[0]); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(el, e)).catch((err) => toast((err && err.message) || 'Something went wrong.'));
  });

  document.addEventListener('input', (e) => {
    const key = e.target.dataset && e.target.dataset.input;
    if (key && inputs[key]) inputs[key](e.target, e);
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type === 'file' && el.dataset.file) {
      const files = Array.from(el.files || []);
      el.value = '';
      fileHandlers[el.dataset.file](files, el);
      return;
    }
    const key = el.dataset && el.dataset.change;
    if (key && changes[key]) changes[key](el, e);
  });

  if (state.members.length && !state.prefs.viewerIds.length && !state.prefs.viewersChosen) {
    state.prefs.viewerIds = state.members.map((m) => m.id);
  }
  render();
})();
