'use strict';

// These tests run sequentially, and must stay that way. The plugin writes to
// './public', relative to the process working directory, so each test chdir()s
// into its own temp dir -- and cwd is process-wide, so concurrent tests would
// clobber each other. No test here may use { concurrency: true }.
//
// Nothing is stubbed: a throwaway HTTP server on 127.0.0.1 serves real bytes
// and the real filesystem receives them. That is deliberate. The bug this suite
// exists to pin is "the plugin resolves before the bytes land", which a fake
// write stream would hide.

const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const plugin = require('../index.js');

const ROOT = process.cwd();
const ENV_KEY = 'LOAD_EXTERNAL_FILES_CONFIG';
const realLog = console.log;

let routes;       // pathname -> { status, body, delayMs }
let received;     // every request the host got, in order
let logs;         // everything the plugin logged during the test
let server;
let host;         // base URL of the fake asset host
let tmpDir;
let savedEnv;

before(async () => {
  server = http.createServer((req, res) => {
    const { pathname, search } = new URL(req.url, 'http://127.0.0.1');
    received.push({ pathname, search });

    const route = routes.get(pathname);
    if (!route) {
      res.writeHead(404).end();
      return;
    }

    const { status = 200, body = '', delayMs = 0 } = route;
    res.writeHead(status);
    if (status === 204 || body === '') {
      res.end();
    } else if (delayMs) {
      // Split the body so the write cannot have finished by the time
      // onPreBuild resolves unless the plugin genuinely waits for it.
      const half = Math.ceil(body.length / 2);
      res.write(body.slice(0, half));
      setTimeout(() => res.end(body.slice(half)), delayMs);
    } else {
      res.end(body);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  host = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  routes = new Map();
  received = [];
  logs = [];
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlef-'));
  process.chdir(tmpDir);
  // Collected rather than discarded: download failures never fail the build, so
  // the log is the only place a user learns an asset is missing. That makes it
  // part of the contract, not noise.
  console.log = (...args) => {
    logs.push(args.map(String).join(' '));
    if (process.env.VERBOSE) realLog(...args);
  };
});

afterEach(() => {
  console.log = realLog;
  // chdir out before removing: deleting the cwd breaks every later relative path.
  process.chdir(ROOT);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

// The real utils.build.failPlugin throws to halt the build; this one records,
// which also proves onPreBuild returns cleanly on its own after calling it.
function makeUtils() {
  const failures = [];
  const statuses = [];
  return {
    failures,
    statuses,
    build: { failPlugin: (m) => failures.push(m) },
    status: { show: (s) => statuses.push(s) },
  };
}

function serve(pathname, route) {
  routes.set(pathname, route);
}

function setConfig(config) {
  process.env[ENV_KEY] = JSON.stringify(config);
}

function config(files, overrides = {}) {
  return { baseURL: `${host}/assets`, files, ...overrides };
}

const paths = () => received.map((r) => r.pathname);
const logged = (pattern) => logs.filter((line) => pattern.test(line));

test('downloads every file, creating nested saveAt directories', async () => {
  serve('/assets/favicon.ico', { body: 'ico' });
  serve('/assets/logo.png', { body: 'logo' });
  serve('/assets/favicon-16x16.png', { body: 'small' });
  setConfig(config([
    { extFile: 'favicon.ico', saveAt: '' },
    { extFile: 'logo.png', saveAt: 'img' },
    { extFile: 'favicon-16x16.png', saveAt: 'img/icons' },
  ]));

  await plugin.onPreBuild({ utils: makeUtils() });

  assert.ok(fs.existsSync('public/favicon.ico'));
  assert.ok(fs.existsSync('public/img/logo.png'));
  assert.ok(fs.existsSync('public/img/icons/favicon-16x16.png'));
});

// Regression test for the core bug: onPreBuild used to await the WriteStream
// itself, so it resolved before any bytes were flushed. The delayed second
// chunk is what makes this fail reliably against the old code instead of
// occasionally -- a flaky regression test would be worse than none.
test('waits for the whole body to be flushed before resolving', async () => {
  const body = 'first-half-of-the-body|second-half-of-the-body';
  serve('/assets/favicon.ico', { body, delayMs: 50 });
  setConfig(config([{ extFile: 'favicon.ico', saveAt: '' }]));

  await plugin.onPreBuild({ utils: makeUtils() });

  assert.equal(fs.readFileSync('public/favicon.ico', 'utf8'), body);
});

test('reports an accurate count in the build status', async () => {
  serve('/assets/a.png', { body: 'a' });
  serve('/assets/b.png', { body: 'b' });
  serve('/assets/c.png', { body: 'c' });
  setConfig(config([
    { extFile: 'a.png', saveAt: 'img' },
    { extFile: 'b.png', saveAt: 'img' },
    { extFile: 'c.png', saveAt: 'img' },
  ]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.deepEqual(utils.statuses, [
    { title: 'File download complete', summary: '3 of 3 saved' },
  ]);
});

test('an empty saveAt writes to the publish root', async () => {
  serve('/assets/favicon.ico', { body: 'ico' });
  setConfig(config([{ extFile: 'favicon.ico', saveAt: '' }]));

  await plugin.onPreBuild({ utils: makeUtils() });

  assert.deepEqual(fs.readdirSync('public'), ['favicon.ico']);
});

test('requests baseURL joined to each extFile, once per entry', async () => {
  serve('/assets/favicon.ico', { body: 'ico' });
  serve('/assets/img/logo.png', { body: 'logo' });
  setConfig(config([
    { extFile: 'favicon.ico', saveAt: '' },
    { extFile: 'img/logo.png', saveAt: 'img' },
  ]));

  await plugin.onPreBuild({ utils: makeUtils() });

  assert.deepEqual(paths().sort(), ['/assets/favicon.ico', '/assets/img/logo.png']);
});

test('does nothing when the environment variable is unset', async () => {
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.deepEqual(utils.failures, []);
  assert.deepEqual(utils.statuses, []);
  assert.deepEqual(received, []);
  assert.equal(fs.existsSync('public'), false);
});

test('fails the plugin on unparseable JSON', async () => {
  process.env[ENV_KEY] = '{ not json';
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.failures.length, 1);
  assert.deepEqual(utils.statuses, []);
  assert.deepEqual(received, []);
});

// Regression test: `config.files.length` used to be read outside the try/catch,
// so a config without `files` threw a TypeError straight out of onPreBuild and
// crashed the build without ever calling failPlugin.
test('fails the plugin when the config has no files array', async () => {
  process.env[ENV_KEY] = '{}';
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.failures.length, 1);
  assert.match(utils.failures[0], /"files" array/);
});

test('an empty files array is a silent no-op', async () => {
  setConfig(config([]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.deepEqual(utils.failures, []);
  assert.deepEqual(utils.statuses, []);
  assert.deepEqual(received, []);
});

test('counts a server error as a failure without failing the build', async () => {
  serve('/assets/good.png', { body: 'good' });
  serve('/assets/bad.png', { status: 500 });
  setConfig(config([
    { extFile: 'good.png', saveAt: 'img' },
    { extFile: 'bad.png', saveAt: 'img' },
  ]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.statuses[0].summary, '1 of 2 saved');
  assert.deepEqual(utils.failures, []);
  assert.equal(fs.readFileSync('public/img/good.png', 'utf8'), 'good');
  assert.equal(fs.existsSync('public/img/bad.png'), false);
});

test('writes nothing for a 2xx status other than 200', async () => {
  serve('/assets/favicon.ico', { status: 204 });
  setConfig(config([{ extFile: 'favicon.ico', saveAt: '' }]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.statuses[0].summary, '0 of 1 saved');
  assert.equal(fs.existsSync('public/favicon.ico'), false);
});

test('survives a refused connection', async () => {
  // Bind, read the port, release it: nothing is listening there afterwards.
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const deadPort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  setConfig(config([{ extFile: 'favicon.ico', saveAt: '' }], {
    baseURL: `http://127.0.0.1:${deadPort}/assets`,
  }));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.statuses[0].summary, '0 of 1 saved');
  assert.deepEqual(utils.failures, []);
});

// Regression test: there was no 'error' listener on the write stream, so a
// write failure surfaced as an unhandled 'error' event. node:test fails a test
// on an unhandled rejection raised during it, so this also guards that.
test('survives an unwritable destination', async () => {
  serve('/assets/favicon.ico', { body: 'ico' });
  fs.mkdirSync('public/favicon.ico', { recursive: true }); // now EISDIR on write
  setConfig(config([{ extFile: 'favicon.ico', saveAt: '' }]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.statuses[0].summary, '0 of 1 saved');
  assert.deepEqual(utils.failures, []);
});

test('survives a saveAt that collides with an existing file', async () => {
  serve('/assets/logo.png', { body: 'logo' });
  fs.mkdirSync('public', { recursive: true });
  fs.writeFileSync('public/img', 'not a directory');
  setConfig(config([{ extFile: 'logo.png', saveAt: 'img' }]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.statuses[0].summary, '0 of 1 saved');
  assert.deepEqual(utils.failures, []);
  assert.deepEqual(received, []); // never got as far as requesting
});

// Regression test: the success counter used to be module-level state, so a
// second run in the same process kept counting up from the first.
test('does not accumulate counts across invocations', async () => {
  serve('/assets/favicon.ico', { body: 'ico' });
  setConfig(config([{ extFile: 'favicon.ico', saveAt: '' }]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });
  await plugin.onPreBuild({ utils });

  assert.deepEqual(utils.statuses.map((s) => s.summary), ['1 of 1 saved', '1 of 1 saved']);
});

test('counts every failure mode alike', async () => {
  serve('/assets/good.png', { body: 'good' });
  serve('/assets/boom.png', { status: 500 });
  serve('/assets/empty.png', { status: 204 });
  setConfig(config([
    { extFile: 'good.png', saveAt: 'img' },
    { extFile: 'boom.png', saveAt: 'img' },
    { extFile: 'empty.png', saveAt: 'img' },
  ]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.statuses[0].summary, '1 of 3 saved');
});

// Distinct filenames in one directory -- this pins that repeated recursive
// mkdirSync is idempotent. The colliding-filename case is separate, below.
test('handles two files sharing one saveAt directory', async () => {
  serve('/assets/a.png', { body: 'a' });
  serve('/assets/b.png', { body: 'b' });
  setConfig(config([
    { extFile: 'a.png', saveAt: 'img/icons' },
    { extFile: 'b.png', saveAt: 'img/icons' },
  ]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.statuses[0].summary, '2 of 2 saved');
  assert.deepEqual(fs.readdirSync('public/img/icons').sort(), ['a.png', 'b.png']);
});

// Two entries resolving to one path used to race two write streams over it. With
// bodies of different sizes that left a corrupt file -- neither body intact --
// while the summary still claimed both were saved.
test('fails the plugin when two entries resolve to the same file', async () => {
  serve('/assets/v1/logo.png', { body: 'one' });
  serve('/assets/v2/logo.png', { body: 'two' });
  setConfig(config([
    { extFile: 'v1/logo.png', saveAt: 'img' },
    { extFile: 'v2/logo.png', saveAt: 'img' },
  ]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.failures.length, 1);
  assert.match(utils.failures[0], /files\[1\] and files\[0\] both resolve to/);
  assert.deepEqual(utils.statuses, []);
  assert.deepEqual(received, []); // nothing is downloaded, so nothing is corrupted
});

test('allows the same filename in different saveAt directories', async () => {
  serve('/assets/v1/logo.png', { body: 'one' });
  serve('/assets/v2/logo.png', { body: 'two' });
  setConfig(config([
    { extFile: 'v1/logo.png', saveAt: 'img/a' },
    { extFile: 'v2/logo.png', saveAt: 'img/b' },
  ]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.deepEqual(utils.failures, []);
  assert.equal(fs.readFileSync('public/img/a/logo.png', 'utf8'), 'one');
  assert.equal(fs.readFileSync('public/img/b/logo.png', 'utf8'), 'two');
});

// An extFile that names no file used to write a junk file and report success:
// '' took the basename of baseURL, and 'icons/' produced a *file* named icons
// that would then block any other entry wanting icons/ as a directory.
for (const extFile of ['', 'icons/', '?sig=abc']) {
  test(`fails the plugin when extFile names no file: ${JSON.stringify(extFile)}`, async () => {
    setConfig(config([{ extFile, saveAt: 'img' }]));
    const utils = makeUtils();

    await plugin.onPreBuild({ utils });

    assert.equal(utils.failures.length, 1);
    assert.match(utils.failures[0], /does not name a file/);
    assert.deepEqual(received, []);
    assert.equal(fs.existsSync('public'), false);
  });
}

test('warns that localPath is ignored, but still runs', async () => {
  serve('/assets/favicon.ico', { body: 'ico' });
  setConfig(config([{ extFile: 'favicon.ico', saveAt: '' }], { localPath: 'img/icons' }));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(logged(/"localPath" is ignored/).length, 1);
  assert.equal(utils.statuses[0].summary, '1 of 1 saved');
  assert.ok(fs.existsSync('public/favicon.ico'), 'saveAt still applies');
});

test('does not mention localPath when it is absent', async () => {
  serve('/assets/favicon.ico', { body: 'ico' });
  setConfig(config([{ extFile: 'favicon.ico', saveAt: '' }]));

  await plugin.onPreBuild({ utils: makeUtils() });

  assert.deepEqual(logged(/localPath/), []);
});

// The README tells users to read the log when the count is short, so the log
// lines are part of the contract rather than incidental output.
test('logs a reason for each failure and the final count', async () => {
  serve('/assets/good.png', { body: 'good' });
  serve('/assets/boom.png', { status: 500 });
  serve('/assets/empty.png', { status: 204 });
  setConfig(config([
    { extFile: 'good.png', saveAt: 'img' },
    { extFile: 'boom.png', saveAt: 'img' },
    { extFile: 'empty.png', saveAt: 'img' },
  ]));

  await plugin.onPreBuild({ utils: makeUtils() });

  assert.equal(logged(/error saving .*boom\.png/).length, 1);
  assert.equal(logged(/skipped .*empty\.png \(status 204\)/).length, 1);
  assert.equal(logged(/saved public\/img\/good\.png/).length, 1);
  assert.equal(logged(/^File download complete 1 of 3 saved$/).length, 1);
});

test('logs why it did nothing when the environment variable is unset', async () => {
  await plugin.onPreBuild({ utils: makeUtils() });

  assert.equal(logged(/LOAD_EXTERNAL_FILES_CONFIG not set/).length, 1);
});

// Private buckets are read with a pre-signed URL, so extFile realistically
// carries a query string. It must be sent, but must not end up in the filename.
test('strips a query string from the saved filename', async () => {
  serve('/assets/favicon.ico', { body: 'ico' });
  setConfig(config([{ extFile: 'favicon.ico?sv=2020&sig=abc', saveAt: 'img/icons' }]));

  await plugin.onPreBuild({ utils: makeUtils() });

  assert.deepEqual(fs.readdirSync('public/img/icons'), ['favicon.ico']);
  assert.equal(received[0].search, '?sv=2020&sig=abc');
});

// baseURL is validated as a non-empty string, not as a parseable URL. Getting it
// wrong is a download failure rather than a config error, since the plugin can't
// tell an unreachable host from an unparseable one without trying.
test('survives a baseURL that is not a valid URL', async () => {
  setConfig(config([{ extFile: 'favicon.ico', saveAt: 'img' }], { baseURL: 'assets' }));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.statuses[0].summary, '0 of 1 saved');
  assert.deepEqual(utils.failures, []);
});

test('fails the plugin when baseURL is missing', async () => {
  process.env[ENV_KEY] = JSON.stringify({ files: [{ extFile: 'favicon.ico', saveAt: '' }] });
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.failures.length, 1);
  assert.match(utils.failures[0], /"baseURL" string/);
  assert.deepEqual(utils.statuses, []);
  assert.deepEqual(received, []);
});

test('an empty files array still no-ops when baseURL is missing', async () => {
  process.env[ENV_KEY] = JSON.stringify({ files: [] });
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.deepEqual(utils.failures, []);
  assert.deepEqual(utils.statuses, []);
});

test('fails the plugin on an entry with a non-string saveAt', async () => {
  setConfig(config([
    { extFile: 'favicon.ico', saveAt: '' },
    { extFile: 'logo.png', saveAt: 5 },
  ]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.failures.length, 1);
  assert.match(utils.failures[0], /files\[1\]/);
  assert.deepEqual(received, []);
});

test('fails the plugin on a null entry', async () => {
  setConfig(config([null]));
  const utils = makeUtils();

  await plugin.onPreBuild({ utils });

  assert.equal(utils.failures.length, 1);
  assert.match(utils.failures[0], /files\[0\]/);
  assert.deepEqual(received, []);
});
