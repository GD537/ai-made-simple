# Family Movie Night

Film suggestions for the whole family. Each person has their own taste profile. Each night's picks blend whoever is watching, can lean toward one person, and can be new films, favourites to watch again, or a mix.

Open `family-movies/index.html` through any web server (GitHub Pages, or `python3 -m http.server` from the repo root, then `http://localhost:8000/family-movies/`). There is no build step. Everything is saved in the browser's localStorage.

## How the picks work

The logic lives in `js/engine.js`:

- **Each person's taste** is learned from their own history: 👍/👎, how much of each film they watched (giving up early counts as a dislike), rewatches, "Later" and "Not for us". Old signals fade, faster for children. Each profile is scaled to the same size, so the heaviest watcher doesn't take over.
- **Family score.** Every film is scored for each person watching, then blended with equal shares. The "Lean the picks toward" slider moves weight to one person: at 60% toward one of four people, that person counts for 70% and everyone else 10%. The weights always add up to 100%.
- **No one hates it.** A film that anyone watching would dislike is pushed down hard, even at a 100% lean. Having no history about a film counts as neutral, not as a dislike.
- **Age rating is a hard filter**, set by the strictest person watching. A film with no known rating is treated as MA15+, so it's hidden whenever a child is watching.
- **Watching together** counts for everyone present at 60% strength (full strength if they give their own 👍/👎). It also adds a small "family night" signal.
- **New or favourites.** A three-way switch (New only · Mix · Favourites), remembered for each group of viewers, plus two rows that are always visible. A favourite comes back only after a cooldown for each person who has seen it (about 1 month for children, 6 months for adults by default). Anything anyone disliked never comes back. Settings can switch "new" from "new to everyone" to "new to most of us".
- **Each card explains itself**, for example "Because Ruby loved Moana and Sam enjoyed Paddington 2". It also shows who has seen the film and when, a coloured dot per person for how well it suits them, and where to watch it.

## Getting watch history in (`js/importers.js`, `js/services.js`)

| Source | What it gives |
|---|---|
| Netflix "Download your personal information" (zip or `ViewingActivity.csv`) | Every profile, dates, and how far into each film (from bookmarks) |
| Netflix per-profile "Download all" CSV | Titles and dates for one profile |
| Letterboxd export (zip or CSVs) | Diary, star ratings, likes, watchlist |
| IMDb ratings CSV | 1–10 ratings, matched exactly by IMDb ID |
| Trakt (public profile + app Client ID) | History logged by apps and media players |
| Jellyfin / Plex (server address + key) | Played films per user |
| Screenshot or shelf photo | Titles read by Claude (`claude-opus-5`); shelf films count as owned |
| Any CSV | Column matching step (Amazon or Disney+ data requests, spreadsheets) |
| Pasted list | One title per line |
| Quick rate | Well-known films within each person's age limit |

Every import is matched to a TMDB ID. Uncertain titles go to a **"Did you mean…?"** list instead of being guessed. TV episodes are dropped. After a film, a check-in asks whether it was finished and gets 👍/😐/👎 from each viewer.

## Keys (all optional, stored only in this browser)

- **TMDB** (free): the full catalogue, local age ratings, posters, where to watch and "Find more films". Without it the app uses a built-in list of 67 films with approximate details.
- **Anthropic API key**: only for screenshot and shelf-photo import. The official SDK (`@anthropic-ai/sdk@0.128.0`) is loaded from jsDelivr when needed. Requests use `claude-opus-5` with structured JSON output and server-side refusal fallbacks (`fallbacks: "default"`).

Backups (Settings → Export) never include keys.

## Tests

```bash
node --test 'family-movies/tests/*.test.js'
```

The photo-reading test needs the SDK installed somewhere. Point `ANTHROPIC_SDK_DIR` at that folder, or the test is skipped:

```bash
ANTHROPIC_SDK_DIR=/path/with/node_modules node --test 'family-movies/tests/*.test.js'
```
