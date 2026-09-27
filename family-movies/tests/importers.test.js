// Run: node --test 'family-movies/tests/*.test.js'
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/importers.js');

test('CSV: quotes, embedded commas and newlines, BOM, CRLF, semicolons', () => {
  const rows = I.parseCSV('﻿Title,Date\r\n"Spider-Man: Into the Spider-Verse","1/2/2024"\r\n"He said ""hi"", twice","a\nb"\r\n');
  assert.deepEqual(rows, [['Title', 'Date'], ['Spider-Man: Into the Spider-Verse', '1/2/2024'], ['He said "hi", twice', 'a\nb']]);
  assert.deepEqual(I.parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('dates: ISO, day-first, month-first, two-digit years, invalid', () => {
  assert.equal(I.parseDate('2024-03-05 20:11:00'), '2024-03-05');
  assert.equal(I.parseDate('05/03/2024', 'DMY'), '2024-03-05');
  assert.equal(I.parseDate('03/05/2024', 'MDY'), '2024-03-05');
  assert.equal(I.parseDate('5/3/24', 'DMY'), '2024-03-05');
  assert.equal(I.parseDate('31/02/2024', 'DMY'), null);
  assert.equal(I.detectDateOrder(['1/2/24', '25/12/23'], 'MDY'), 'DMY');
  assert.equal(I.detectDateOrder(['12/25/23'], 'DMY'), 'MDY');
  assert.equal(I.detectDateOrder(['1/2/24'], 'MDY'), 'MDY');
});

test('TV titles are told apart from films', () => {
  const tv = ['Stranger Things: Stranger Things 3: Chapter One', 'Bluey: Season 1: Hammerbarn',
    "The Queen's Gambit: Limited Series: Openings", 'Some Show: Episode 4'];
  const films = ['Spider-Man: Into the Spider-Verse', 'Harry Potter and the Deathly Hallows: Part 1', 'John Wick: Chapter 2', 'Moana'];
  tv.forEach((t) => assert.equal(I.isLikelyTv(t), true, t));
  films.forEach((t) => assert.equal(I.isLikelyTv(t), false, t));
});

test('Netflix full download: sessions become watches per profile, trailers and TV skipped', () => {
  const csv = [
    'Profile Name,Start Time,Duration,Attributes,Title,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country',
    'Garrath,2024-05-01 19:00:00,00:50:00,,Inception,,TV,00:50:00,Not latest view,AU (Australia)',
    'Garrath,2024-05-02 19:00:00,01:40:00,,Inception,,TV,02:25:00,02:25:00,AU (Australia)',
    'Garrath,2024-05-02 18:00:00,00:01:30,,Inception,TRAILER,TV,00:01:30,00:01:30,AU (Australia)',
    'Ruby,2024-06-10 08:00:00,00:07:00,,Bluey: Season 1: Hammerbarn,,iPad,00:07:00,00:07:00,AU (Australia)',
    'Ruby,2024-06-11 08:00:00,00:20:00,,Frozen,,iPad,00:20:00,00:20:00,AU (Australia)',
    'Ruby,2024-09-11 08:00:00,01:40:00,,Frozen,,iPad,01:40:00,01:40:00,AU (Australia)',
  ].join('\n');
  const parsed = I.parseFile('ViewingActivity.csv', csv);
  assert.equal(parsed.format, 'netflix-activity');
  assert.deepEqual(parsed.profiles.sort(), ['Garrath', 'Ruby']);
  const inception = parsed.records.filter((r) => r.title === 'Inception');
  assert.equal(inception.length, 1, 'two sessions a day apart are one watch');
  assert.equal(inception[0].watchedOn, '2024-05-02');
  assert.equal(inception[0].positionMin, 145);
  assert.equal(I.completionFor(inception[0], 148), 1);
  const frozen = parsed.records.filter((r) => r.title === 'Frozen');
  assert.equal(frozen.length, 2, 'three months apart is a rewatch');
  assert.ok(I.completionFor(frozen[0], 102) < 0.4, 'first try was abandoned');
  assert.ok(!parsed.records.some((r) => /Bluey/.test(r.title)));
});

test('Netflix one-profile history: date order detected, TV skipped', () => {
  const parsed = I.parseFile('NetflixViewingHistory.csv', 'Title,Date\n"Moana","25/12/2023"\n"Bluey: Season 2: Dance Mode","26/12/2023"\n"Coco","3/1/2024"\n');
  assert.equal(parsed.format, 'netflix-history');
  assert.deepEqual(parsed.records.map((r) => [r.title, r.watchedOn]), [['Moana', '2023-12-25'], ['Coco', '2024-01-03']]);
});

test('Letterboxd: stars to thumbs, diary and ratings merged into one watch', () => {
  const diary = I.parseFile('diary.csv', 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-01-05,Arrival,2016,https://boxd.it/x,4.5,,,2024-01-04\n');
  const ratings = I.parseFile('ratings.csv', 'Date,Name,Year,Letterboxd URI,Rating\n2024-01-05,Arrival,2016,https://boxd.it/x,4.5\n2023-02-01,Cats,2019,https://boxd.it/y,1\n');
  const watchlist = I.parseFile('watchlist.csv', 'Date,Name,Year,Letterboxd URI\n2024-02-01,Dune,2021,https://boxd.it/z\n');
  assert.equal(diary.format, 'letterboxd');
  const merged = I.mergeRecords(diary.records.concat(ratings.records, watchlist.records));
  const arrival = merged.filter((r) => r.title === 'Arrival');
  assert.equal(arrival.length, 1);
  assert.equal(arrival[0].watchedOn, '2024-01-04');
  assert.equal(arrival[0].thumbs, 1);
  assert.equal(merged.find((r) => r.title === 'Cats').thumbs, -1);
  assert.equal(merged.find((r) => r.title === 'Dune').watchlist, true);
});

test('IMDb ratings: 1-10 to thumbs, TV series dropped', () => {
  const csv = 'Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\n' +
    'tt0133093,9,2023-04-01,The Matrix,The Matrix,https://imdb.com,Movie,8.7,136,1999,Action,2000000,1999-03-31,Wachowski\n' +
    'tt0903747,10,2023-04-02,Breaking Bad,Breaking Bad,https://imdb.com,TV Series,9.5,49,2008,Drama,2000000,2008-01-20,\n' +
    'tt1234567,6,2023-04-03,Some Film,Some Film,https://imdb.com,Movie,6.0,100,2010,Drama,1000,2010-01-01,X\n' +
    'tt7654321,3,2023-04-04,Bad Film,Bad Film,https://imdb.com,TV Movie,4.0,90,2011,Drama,1000,2011-01-01,Y\n';
  const parsed = I.parseFile('ratings.csv', csv);
  assert.equal(parsed.format, 'imdb-ratings');
  assert.deepEqual(parsed.records.map((r) => [r.imdbId, r.thumbs]), [['tt0133093', 1], ['tt1234567', 0], ['tt7654321', -1]]);
});

test('any spreadsheet: columns guessed, rating scale detected', () => {
  const parsed = I.parseFile('my films.csv', 'Film,Year,Watched on,Score (out of 10)\nUp,2009,2024-02-03,9\nCats,2019,2024-02-04,2\nHugo,2011,2024-02-05,6\n');
  assert.equal(parsed.format, 'generic');
  assert.equal(parsed.records, null, 'needs a column mapping first');
  const mapping = I.guessMapping(parsed.headers);
  assert.equal(mapping.title, 'Film');
  assert.equal(mapping.date, 'Watched on');
  assert.equal(mapping.rating, 'Score (out of 10)');
  const recs = I.parseGeneric(parsed.rows, mapping, 'AU');
  assert.deepEqual(recs.map((r) => [r.title, r.year, r.watchedOn, r.thumbs]), [
    ['Up', 2009, '2024-02-03', 1], ['Cats', 2019, '2024-02-04', -1], ['Hugo', 2011, '2024-02-05', 0],
  ]);
  const thumbs = I.parseGeneric([{ T: 'Up', L: 'yes' }, { T: 'Cats', L: '👎' }], { title: 'T', rating: 'L', scale: 'thumbs' });
  assert.deepEqual(thumbs.map((r) => r.thumbs), [1, -1]);
});

test('pasted lists: bullets, numbering and years', () => {
  const recs = I.parseTitleList('1. Toy Story (1995)\n- Frozen 2013\n* Spider-Man: Into the Spider-Verse\n\n  Coco [2017]  \n2001: A Space Odyssey');
  assert.deepEqual(recs.map((r) => [r.title, r.year]), [
    ['Toy Story', 1995], ['Frozen', 2013], ['Spider-Man: Into the Spider-Verse', null], ['Coco', 2017], ['2001: A Space Odyssey', null],
  ]);
});

test('Trakt, Jellyfin and Plex responses', () => {
  const trakt = I.parseTraktHistory([
    { id: 1, watched_at: '2024-03-01T20:00:00.000Z', type: 'movie', movie: { title: 'Up', year: 2009, ids: { tmdb: 14160, imdb: 'tt1049413' } } },
    { id: 2, watched_at: '2024-03-02T20:00:00.000Z', type: 'episode', episode: {} },
  ]);
  assert.deepEqual(trakt.map((r) => [r.tmdbId, r.watchedOn]), [[14160, '2024-03-01']]);
  const rated = I.parseTraktRatings([{ rated_at: '2024-03-05T00:00:00Z', rating: 9, type: 'movie', movie: { title: 'Up', year: 2009, ids: { tmdb: 14160 } } }]);
  assert.equal(rated[0].thumbs, 1);

  const jf = I.parseJellyfinItems({ Items: [
    { Name: 'Coco', ProductionYear: 2017, Type: 'Movie', ProviderIds: { Tmdb: '354912', Imdb: 'tt2380307' }, UserData: { Played: true, LastPlayedDate: '2024-04-01T10:00:00Z', IsFavorite: true } },
  ] });
  assert.deepEqual([jf[0].tmdbId, jf[0].watchedOn, jf[0].completion, jf[0].thumbs], [354912, '2024-04-01', 1, 1]);

  const plex = I.parsePlexHistory({ MediaContainer: { Metadata: [
    { type: 'movie', title: 'Moana', viewedAt: 1717200000, ratingKey: '55', accountID: 1 },
    { type: 'episode', title: 'Pilot', viewedAt: 1717200000 },
  ] } });
  assert.equal(plex.length, 1);
  assert.equal(plex[0].watchedOn, '2024-06-01');
  assert.deepEqual(I.parsePlexGuids({ MediaContainer: { Metadata: [{ year: 2016, Guid: [{ id: 'imdb://tt3521164' }, { id: 'tmdb://277834' }] }] } }),
    { tmdbId: 277834, imdbId: 'tt3521164', year: 2016 });
});

// Builds a zip in memory (one stored entry, one deflated entry) to test the reader.
async function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = enc.encode(f.text);
    let data = raw;
    if (f.deflate) {
      const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, f.deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, f.deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const parts = locals.concat(centrals, [end]);
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  parts.forEach((x) => { out.set(x, p); p += x.length; });
  return out;
}

test('zip reader: stored and deflated entries (Netflix / Letterboxd downloads)', async () => {
  const zip = await makeZip([
    { name: 'CONTENT_INTERACTION/ViewingActivity.csv', text: 'Profile Name,Start Time\nA,2024-01-01', deflate: true },
    { name: 'README.txt', text: 'hello' },
    { name: 'likes/films.csv', text: 'Date,Name,Year,Letterboxd URI\n2024-01-01,Up,2009,x', deflate: true },
  ]);
  const entries = await I.readZip(zip.buffer);
  assert.deepEqual(entries.map((e) => e.name), ['CONTENT_INTERACTION/ViewingActivity.csv', 'README.txt', 'likes/films.csv']);
  assert.equal(await entries[0].text(), 'Profile Name,Start Time\nA,2024-01-01');
  assert.equal(await entries[1].text(), 'hello');
  assert.deepEqual(entries.filter((e) => I.interestingZipEntry(e.name)).map((e) => e.name),
    ['CONTENT_INTERACTION/ViewingActivity.csv', 'likes/films.csv']);
  const liked = I.parseFile('likes/films.csv', await entries[2].text());
  assert.equal(liked.records[0].thumbs, 1);
  await assert.rejects(I.readZip(new Uint8Array(40).buffer), /not a zip/);
});
