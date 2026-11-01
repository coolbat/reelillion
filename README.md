# Reelillion

A daily movie game for uncommon answers. Seven prompts, twenty seconds per prompt, and up to 700 points. The frontend is Astro + Preact; a Cloudflare Worker serves the API and static assets, with D1 storing sessions and locked answers.

The product uses English copy and a shared New York daily schedule. Full rules are in [`docs/api.md`](docs/api.md) and the source requirements document. [`docs/requirements-coverage.md`](docs/requirements-coverage.md) records implemented, pending and planned scope without treating development as production acceptance.

## v1.3 — the end-credits cinema

The home page is the game: an original pixel cinema with a central screen. Starting, answering and viewing results happen in place. Rare answers advance a separate credits roll; the seven-question, five-tier scoring model and server deadlines are unchanged. Ten cumulative milestones end at the Post-Credits Scene (600+ on completion), with a special 700-point ending. Motion can be skipped or reduced, and spoiler-free sharing includes the final milestone, seven answers and the selected mode/time.

The implementation contract is [`docs/requirements-v1.3.md`](docs/requirements-v1.3.md); design rationale is in [`docs/design-research.md`](docs/design-research.md). [`docs/browser-review-v1.3.md`](docs/browser-review-v1.3.md) records three review rounds, real browser interactions and verification limits. No D1 migration or rescoring of historical games is needed.

## Run locally

Use **Node.js 24** (see `.nvmrc`). Python 3 is required for source-data refreshes and the data-tool checks.

```sh
nvm install
nvm use
npm ci
npm run db:local
npm run build
npm run preview
```

Open `http://127.0.0.1:8787/`. This uses Wrangler's local D1 state under ignored `.wrangler/` and the compiled Astro `dist/` assets. It does not publish a production Worker or mutate production D1.

`npm run dev` runs Astro at its development URL for frontend work. The Worker API is provided by the Wrangler preview, so use the full preview above for gameplay acceptance. After frontend changes, rebuild before checking that preview.

## Checks

```sh
npm run check
npm test
npm run data:check
python3 tests/data_tools_test.py
npm run build
npx wrangler deploy --dry-run
```

Tests cover all cumulative credits boundaries, zero/completed/perfect endings, spoiler-free seven-answer sharing, matching and aliases, remakes and sequel numbers, score thresholds, the 200-answer prior, New York/DST resets, SQL session ownership and locking, mode isolation, date expiry, deterministic schedules and the deployment gate. They do not replace a real production D1 test, editorial review, or real-player score calibration.

The GitHub [`Quality` workflow](.github/workflows/quality.yml) runs these checks on Node 24 for pushes and pull requests to `main`. The dry run is a build/configuration check, not a deployment.

## Data sources and refresh

Gameplay reads a committed, versioned snapshot rather than calling third-party data services during a round.

- Movie facts and English Wikipedia sitelinks: [Wikidata Query Service](https://query.wikidata.org/) and [CC0 licensing](https://www.wikidata.org/wiki/Wikidata:Licensing).
- Familiarity estimates: [Wikimedia article pageviews](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html). The launch snapshot uses twelve complete months from October 2025 through September 2026.
- Unavailable pageview requests use a separately tagged Wikidata sitelink estimate. Estimated familiarity is never presented as an actual player count.
- IMDb, TMDB, movie posters, film frames and Wikipedia article prose are not imported.

```sh
python3 scripts/data-refresh.py
npm run data:check
npm test
npm run check
npm run build
```

Refresh requires network access and can take time. The fetcher caches source responses in ignored `.data-cache/` and can resume. Review the final `src/data/metadata.json`, `provenance.json`, `quality.json`, rejected low-answer sources and `schedule.json` before committing. The first thirty sets begin on October 30, 2026, using New York dates. The runtime selector is deterministic beyond that window.

See [`docs/data-provenance.md`](docs/data-provenance.md) for query limits, fallback weights, runtime/genre caveats and refresh details. The catalog is bounded; an unrecognized film may exist outside this snapshot. Automated checks are not independent human editorial approval. The source script's fixed pageview dates must be updated deliberately for a later snapshot.

Do not commit production D1 contents, request caches, secrets, private environment files or runtime state. Source refresh only changes the reviewed catalog; it must not overwrite player records.

## Production release contract

Every initial launch, update, urgent fix and rollback follows the same order:

1. Commit and push all required code, content, assets, migrations and configuration to GitHub.
2. Wait for the required GitHub `Quality` check to succeed for that exact commit.
3. Let the configured Cloudflare Git build execute its gated automatic deployment.
4. Match the GitHub SHA, check result, Cloudflare deployment record and live behavior before calling the release complete.

Cloudflare build command:

```sh
npm run check && npm test && npm run data:check && npm run build
```

Cloudflare deploy command, **only inside the configured automated Cloudflare build environment**:

```sh
npm run deploy:ci
```

That script first runs [`scripts/verify-github-checks.mjs`](scripts/verify-github-checks.mjs). The gate checks the checkout SHA against supplied Cloudflare commit variables and independently verifies the latest GitHub Actions `Quality` run and check-suite SHA in the public `coolbat/reelillion` repository. It accepts only `success`, polls pending checks for at most 120 seconds, and fails closed for failed checks, HTTP errors, incomplete evidence or mismatched commits. It ignores Cloudflare's own deployment check to avoid a circular wait.

Workers Builds supplies [`WORKERS_CI_COMMIT_SHA`](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables). The gate also recognizes Pages' `CF_PAGES_COMMIT_SHA` and an explicit `CF_BUILD_COMMIT_SHA` integration alias; any supplied SHA must agree with `git rev-parse HEAD`.

After this gate succeeds, the automated command applies the tracked D1 migrations remotely and deploys the Worker. A timeout is a blocked release: retry the automated build after GitHub CI succeeds, without skipping the gate.

**Never run `npm run deploy:ci`, `wrangler deploy`, `wrangler pages deploy`, a wrapper around those commands or a manual dashboard upload from a local machine to publish production.** Local build, preview, local D1 migrations and `--dry-run` are allowed. A broken automatic pipeline must be repaired rather than bypassed.

## D1 migrations

The `DB` binding and database identifier are in `wrangler.jsonc`; schema migrations are in `migrations/`. The production migration step belongs to the same checked commit and runs in the automated Cloudflare pipeline after the gate.

`npm run db:local` targets the local database only. Do not use a local `--remote` migration as a substitute for the release pipeline. For a later schema change, preserve existing sessions and scores, assess compatibility with the previous Worker, and plan a reversible rollout before altering production data. Source catalog refreshes are not database migrations.

## Domain setup and release evidence

The production site is [reelillion.com](https://reelillion.com/); [www.reelillion.com](https://www.reelillion.com/) is also bound to this Worker. Both returned HTTPS 200 on October 31, 2026. Spaceship delegates DNS to `gerardo.ns.cloudflare.com` and `ullis.ns.cloudflare.com`. The two discovered registrar-parking A records were retained under `_parking-backup-1` and `_parking-backup-2` for reversible restoration; the apex and `www` use Cloudflare Worker custom domains.

The first application release is commit [`61b6c3d`](https://github.com/coolbat/reelillion/commit/61b6c3d5ad00a6ac5557670105c0dbdf6c9ca805), after its [GitHub Quality check](https://github.com/coolbat/reelillion/actions/runs/41153602890) passed. [Cloudflare Git build d8315962](https://dash.cloudflare.com/a8076357128d3e8be7dca72dbda3e8bf/workers/services/view/reelillion/production/builds/d8315962-6ead-4b2c-9b0d-365c0c27fd7e) independently verified the same SHA, applied the tracked D1 migration and deployed version `4104fda9-2114-4382-87e3-66da2a6d7b2c`.

Production acceptance completed a seven-answer, 40-second Practice session, unknown-title retry and repeated persisted-result read. Daily rarity data was not populated by those acceptance answers. Production CSS, game JavaScript and the Astro client bytes matched the local build. See [`docs/release-evidence.md`](docs/release-evidence.md) for the release and its remaining validation limits. Subsequent documentation, test and data-tool changes continue through the same exact-commit gate.

## Current product boundaries

Daily, recent archive replay, free general practice, results and spoiler-free sharing are implemented. Dedicated paid Unlimited, advertisement unlocks, paid history and the five fully playable theme packs are not connected; their pages say they are in development. There is no payment checkout, subscription or advertising SDK in this release.

The game uses a browser device identifier, local streak and D1 game records. Short-lived hashed network identifiers support request throttling. Clearing browser data can create a new device identity; the game does not claim strict one-person enforcement. See `/privacy/` and [`docs/api.md`](docs/api.md).

Independent editorial review, 50–100-player calibration, outreach, directory submissions, Rarest Answers content publication, real retention measurement and further theme brands remain separate work. See the full coverage ledger for all boundaries.
