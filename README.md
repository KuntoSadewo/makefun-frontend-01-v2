# Frontpage — a fast make.fun frontend

![make.fun bounty](https://make.fun/badge/makefun-frontend-01.svg)
![rank](https://make.fun/badge/makefun-frontend-01/KuntoSadewo/makefun-frontend-01-v2/rank.svg)
![reward](https://make.fun/badge/makefun-frontend-01/KuntoSadewo/makefun-frontend-01-v2/reward.svg)

Frontpage is a read-only, dependency-free frontend for [make.fun](https://make.fun/c/makefun-frontend-01),
built for the [Build the best make.fun frontend](https://make.fun/c/makefun-frontend-01) bounty.
It is plain static files — vanilla JavaScript ES modules and one stylesheet,
no framework, no build step — reading only make.fun's public API.

## The four surfaces

Each surface has its own hash route and is reachable by links in the app:

| Route | Surface |
| --- | --- |
| `#/` | Bounty board — every live bounty with its live pot, entry fee, deadline/time left and entry count; closed bounties are told apart by deadline, not by the API's status |
| `#/bounty/<slug>` | Bounty page — summary, description and rules (rendered Markdown), the live rewards table (base + fee share from `rewardsNow`), dates and status |
| `#/bounty/<slug>/leaderboard` | Leaderboard — rank, avatar, entrant (linked to their profile), entry title, judge win rate and W–L record, paginated 50 at a time with search |
| `#/u/<handle>` | Public profile — avatar, bio, links, record (entered / placed / won / podiums / best place / prizes) and the full list of the account's entries |

## Performance choices

- **ETag revalidation.** The API binds its ETags to the minute, so repeat
  fetches send `If-None-Match` and are answered `304` inside the minute —
  revisits and the board's once-a-minute self-refresh cost almost no bytes.
  Concurrent requests for the same path share one fetch.
- **Small first load.** The entry module statically imports only the API
  cache and the formatters; the views load lazily via `import()` on the
  first route. No framework, system font stack, one stylesheet.
- **Updates without rebuilds.** Countdown labels tick in place every 20 s;
  leaderboard paging and board filtering re-render only their list element.
- **Avatars** load lazily with `crossorigin="anonymous"` (the API sends
  `Cross-Origin-Resource-Policy: same-origin`) and fall back to a monogram
  when a handle has no picture.

`window.__shotReady` is `false` while a route loads and `true` once its data
has rendered — the hook the screenshot script waits for. The three captures
in `screenshots/` are named by `shots.json`; the first is the cover.

## Running it

Serve `app/` with any static file server, for example:

```sh
python3 -m http.server 8080 --directory app
```

then open `http://localhost:8080/`.

## Handing it in

`main.ts` (Node 22, standard library only) copies `app/` and `screenshots/`
to the output directory (`/output`, or `$MAKEFUN_OUTPUT_DIR` outside the
grader) and writes `dossier.json` with `buildDossier` from
`vendor/makefun-frontend.ts`, the kit's library, copied unchanged. Two runs
write the same bytes.

## License

MIT — see `LICENSE`.
