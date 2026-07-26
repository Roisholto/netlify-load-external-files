# Changelog

## 1.1.0

First release with tests. Several of these are behaviour changes rather than pure
fixes, so read the "may now fail your build" list before upgrading.

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

- Setting `localPath` now logs a warning. It has never had any effect, but the old
  README's example included it, so configs copied from that example said nothing.
- `failPlugin` messages now name the offending entry index.

### May now fail your build

All of these previously "succeeded" while doing something wrong, so a build that
starts failing is surfacing a pre-existing problem rather than a regression:

- a config with no `baseURL` (it used to request the literal string
  `undefined/favicon.ico` and report `0 of N saved`)
- an `extFile` of `""` or one ending in `/`
- two entries resolving to the same destination

Per-file download failures still never fail the build.

### Added

- Test suite on Node's built-in runner (`node --test`), no devDependencies. 100% line,
  branch and function coverage.
- `engines: node >=18`, for `node:test` and `stream/promises`.
- A `files` allowlist, so the published tarball no longer ships the test directory.
- A README that documents configuration, where files land, and the failure model. The
  previous one's only example was invalid JSON.

### Removed

- `test.js` and `test/index.js`, two dead scripts. One could not run at all — it
  required `request`, which is not a dependency — and the other hit a live Azure Blob
  endpoint while asserting nothing.

## 1.0.2

Earlier releases predate this changelog.
