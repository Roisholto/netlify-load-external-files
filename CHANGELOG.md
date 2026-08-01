# Changelog

## 2.0.0

First release with tests. Major rather than minor for two reasons: the minimum Node
version went up, and several configurations that used to deploy green now fail the
build. Read the breaking changes before upgrading.

### Breaking

- **Requires Node 18 or newer; Node 20+ recommended.** Downloads now use the built-in
  `fetch`, which does not exist before Node 18. On an older runtime this release fails
  with `ReferenceError: fetch is not defined` rather than degrading gracefully, where
  1.0.2 ran anywhere axios did. `engines` is set to `>=20` because `fetch` is only
  stable from Node 21 — Node 18 and 20 work but log an `ExperimentalWarning`. Netlify's
  build image defaults to Node 24, so this only bites if you pin an older version via
  `.nvmrc` or `NODE_VERSION`.
- **Configurations that previously "succeeded" now fail the build.** Each of these was
  already producing a corrupt or missing asset while reporting success, so a build that
  starts failing is surfacing a pre-existing problem rather than a regression:
  - two entries resolving to the same destination
  - an `extFile` of `""`, or one ending in `/`
  - a config with no `baseURL`
  - a `null` entry, or a non-string `saveAt`

  Per-file download failures still never fail the build.

### Fixed

- **Downloads are now actually awaited.** `onPreBuild` awaited the `WriteStream`
  returned by `pipe()` rather than its `finish` event. A `WriteStream` is not a
  thenable, so the await resolved on the next microtask and `Promise.all` settled
  before any bytes reached disk. Two consequences: a fully successful run reported
  `0 of N saved`, and the hook could return control to Netlify mid-write.
- **Write errors are handled.** There was no `'error'` listener on the write stream, so
  a failure such as `EISDIR` surfaced as an unhandled event.
- **The success count no longer accumulates.** It lived in module-level state, so a
  second run in the same process kept counting up from the first.
- **A config with no `files` array no longer crashes the build.** It threw a
  `TypeError` straight out of the hook without calling `failPlugin`. The same applied
  to a `null` entry and to a non-string `saveAt`.
- **Query strings are stripped from saved filenames.** A pre-signed URL previously
  produced a file literally named `favicon.ico?sv=2020&sig=abc`.
- **Colliding destinations no longer corrupt a file.** Two entries resolving to the
  same path raced two write streams over it. With bodies of different sizes the result
  was a corrupt file containing part of each, while the summary claimed both were
  saved.
- **`extFile` values that name no file are rejected.** `""` previously wrote a file
  named after the last segment of `baseURL`, and `"icons/"` wrote a *file* called
  `icons` that then blocked any entry wanting `icons/` as a directory. Both reported
  success.

### Changed

- **Dropped the `axios` dependency for the built-in `fetch`.** The package now has **no
  dependencies at all**, which removes both sources of its outstanding vulnerability
  alerts (`axios` and its pinned `follow-redirects`) and the upgrade treadmill along
  with them. Streaming to disk, redirect following and empty-body handling were
  verified equivalent before the swap. Two behaviours improve: every non-200 status now
  takes the same code path, so a 404 logs `skipped … (status 404)` instead of being
  reported as a transport error; and an unparseable `baseURL` now says
  `Failed to parse URL` rather than axios's misleading attempt to connect to `::1:80`.
- Setting `localPath` now logs a warning. It has never had any effect, but the old
  README's example included it, so configs copied from that example said nothing.
- `failPlugin` messages now name the offending entry index.

### Added

- Test suite on Node's built-in runner (`node --test`), no devDependencies. 100% line,
  branch and function coverage.
- `engines: node >=20`, for `node:test`, `stream/promises` and the built-in `fetch`.
- A `files` allowlist, so the published tarball no longer ships the test directory.
- A README that documents configuration, where files land, and the failure model. The
  previous one's only example was invalid JSON.

### Removed

- `test.js` and `test/index.js`, two dead scripts. One could not run at all — it
  required `request`, which is not a dependency — and the other hit a live Azure Blob
  endpoint while asserting nothing.

## 1.0.2

Earlier releases predate this changelog.
