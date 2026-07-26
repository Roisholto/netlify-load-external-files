# get-netlify-build-assets-for-deploy

A Netlify build plugin that downloads assets from external storage into your site's
`public/` directory before the build runs.

## Why

It exists for white-labelling. One shared codebase gets deployed as many separately
branded Netlify sites, and each site needs its own logo, favicons, and app icons.

Rather than committing every tenant's branding to the repo (or maintaining a branch
per tenant), you keep each tenant's assets in object storage — Azure Blob, S3,
anything that serves files over HTTPS — and give each Netlify site one environment
variable pointing at its own set. Reskinning a site becomes an env-var change and a
redeploy, with no code change at all.

## How it fits into the build

The plugin runs on `onPreBuild`, so files land **before** your build command starts.
A framework that copies `public/` into its output directory picks them up as if they
had been committed.

That means **`./public` must be your framework's static directory** — the output root
is currently hardcoded. Vue CLI, Nuxt 3, Create React App, and Gatsby all use
`public/`. If your project serves static files from somewhere else (Nuxt 2's
`static/`, Jekyll's `assets/`), the plugin will report files as saved and your build
will ship without them. That mismatch is the first thing to check if the build
summary looks right but the assets are missing.

## Requirements

- Node 18 or newer (the version in Netlify's build image, unless you've pinned an older one)
- Assets reachable over HTTPS **without auth headers**. The plugin sends no
  credentials, so for a private container use a pre-signed URL (an Azure SAS token,
  an S3 signed URL) as the `extFile` value — query strings are supported, and are
  stripped from the saved filename.

## Installation

```bash
npm install --save-dev get-netlify-build-assets-for-deploy
```

Then register it in `netlify.toml`:

```toml
[[plugins]]
package = "get-netlify-build-assets-for-deploy"
```

## Configuration

All configuration comes from a single environment variable,
`LOAD_EXTERNAL_FILES_CONFIG`, holding a **JSON string**. Set it per site in the
Netlify UI (Site configuration → Environment variables), which is what makes one
codebase serve many brands.

| Key | Required | Description |
| --- | --- | --- |
| `baseURL` | yes | Prefix every file is fetched from. A trailing slash is tolerated but not needed. |
| `files` | yes | Array of files to download. An empty array is a no-op. |
| `files[].extFile` | yes | Path appended to `baseURL`. May include a query string. Must name a file — `""` and `"icons/"` are rejected. |
| `files[].saveAt` | no | Directory under `public/` to save into. `""` or omitted means `public/` itself. |
| `localPath` | no | **Accepted but ignored.** Logs a warning if you set it — see [Not implemented yet](#not-implemented-yet). |

No two entries may resolve to the same file. Since the filename comes from
`extFile` and the directory from `saveAt`, `{"extFile": "v1/logo.png", "saveAt": "img"}`
and `{"extFile": "v2/logo.png", "saveAt": "img"}` both target `public/img/logo.png`,
and that fails the build rather than racing two downloads over one path.

### Example

```json
{
  "baseURL": "https://example.blob.core.windows.net/assets",
  "files": [
    { "extFile": "favicon.ico", "saveAt": "" },
    { "extFile": "logo.png", "saveAt": "img" },
    { "extFile": "favicon-16x16.png", "saveAt": "img/icons" },
    { "extFile": "apple-icon-152x152.png", "saveAt": "img/icons" },
    { "extFile": "ms-icon-144x144.png", "saveAt": "img/icons" }
  ]
}
```

Environment variables hold a single line, so this is what you actually paste:

```
{"baseURL":"https://example.blob.core.windows.net/assets","files":[{"extFile":"favicon.ico","saveAt":""},{"extFile":"logo.png","saveAt":"img"},{"extFile":"favicon-16x16.png","saveAt":"img/icons"},{"extFile":"apple-icon-152x152.png","saveAt":"img/icons"},{"extFile":"ms-icon-144x144.png","saveAt":"img/icons"}]}
```

It must be strict JSON: double-quoted keys, no comments, no trailing commas.

### Where files land

```
./public/<saveAt>/<filename>
```

The filename comes from the last path segment of the URL, with any query string
removed. So `saveAt` chooses the directory but never renames the file —
`{"extFile": "logo.png?sig=abc", "saveAt": "img"}` produces `public/img/logo.png`.

The example above produces:

```
public/
├── favicon.ico
└── img/
    ├── logo.png
    └── icons/
        ├── favicon-16x16.png
        ├── apple-icon-152x152.png
        └── ms-icon-144x144.png
```

## When things go wrong

**Download problems never fail the build.** An unreachable host, a 404, a non-200
response, an unwritable destination — each is logged and counted, and the build
continues. The reasoning is that a missing favicon shouldn't take a deploy down.

So the count in the Netlify build summary is the thing to watch:

```
File download complete
3 of 5 saved
```

Anything other than `N of N` means assets are missing, and the build log has a line
per failure explaining why.

**Malformed configuration does fail the build**, via `failPlugin`, because it's
always a mistake worth fixing rather than a transient problem. That covers:

- JSON that won't parse
- no `files` array, or a missing `baseURL`
- an entry without a string `extFile`, or with a non-string `saveAt`
- an `extFile` that names no file, such as `""` or `"icons/"`
- two entries that resolve to the same destination

Messages name the offending index, so `files[2] "extFile" does not name a file: ""`
tells you which entry to go and look at.

**An unset `LOAD_EXTERNAL_FILES_CONFIG` is a silent no-op** — the plugin logs that it
has nothing to do and gets out of the way, so it's safe to install on a site before
configuring it.

## Not implemented yet

Config surface that is either accepted and ignored today, or that you might
reasonably expect and won't find. Nothing here works; treat it as the roadmap.

- [ ] **`localPath`** — accepted but ignored. It was intended as a global override for
      each entry's `saveAt`, and the old README documented it that way, but it has
      never been read by the code. `saveAt` always wins. Setting it logs a warning, so
      configs copied from that old example say so out loud instead of silently.
- [ ] **Configurable output root** — `./public` is hardcoded. Should honour Netlify's
      `PUBLISH_DIR` constant, with an explicit override for projects that use
      `static/` or similar.
- [ ] **`files[].saveAs`** — renaming on download. The filename always comes from
      `extFile`, so two assets sharing a basename can't both go in one directory; the
      build fails instead, and you have to split them across `saveAt` directories.
- [ ] **`headers`** — sending auth or custom headers, so private storage could be read
      without a pre-signed URL.
- [ ] **`timeout` and `retries`** — a hung host currently stalls the build until
      Netlify's own timeout fires, and a transient failure is never retried.
- [ ] **`concurrency`** — every file is fetched at once. Fine for a few dozen icons,
      not for hundreds of large assets.
- [ ] **`failBuild`** — opting in to failing the build when a download fails, for sites
      where a missing asset is worse than a failed deploy.

## Known limitations

Things that are unlikely to change, as opposed to the roadmap above:

- No path validation on `saveAt` or `extFile`. A `saveAt` of `../..` will escape
  `public/`; the config is trusted.
- A download that fails partway through can leave a truncated file behind.

## Development

```bash
npm install --no-package-lock   # this repo's lockfile is yarn.lock
npm test
```

Tests use Node's built-in runner (`node --test`), so there are no devDependencies.
Nothing is stubbed: a throwaway HTTP server on `127.0.0.1` serves real bytes and the
real filesystem receives them in a temp directory. That's what lets the suite catch
ordering bugs — such as resolving before the bytes are flushed — that a fake write
stream would hide. Run `VERBOSE=1 npm test` to see the plugin's own log output when a
failure isn't self-explanatory.

## License

ISC
