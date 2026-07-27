const path = require('node:path');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const PLUGIN = 'get-external-files';
// Hardcoded rather than constants.PUBLISH_DIR: PUBLISH_DIR holds what the build
// generates, and this runs before the build, so anything written there would be
// wiped by a framework that clears its output directory.
const OUTPUT_ROOT = './public';

// The saved filename is the last path segment of extFile, with any query string
// (a pre-signed URL's token, say) removed.
function fileNameFor(extFile) {
  return path.posix.basename(extFile.split(/[?#]/)[0]);
}

// Whether extFile can name a file at all. '' and 'icons/' cannot, and would
// otherwise write a junk file while still reporting success.
function namesAFile(extFile) {
  const pathPart = extFile.split(/[?#]/)[0];
  return pathPart !== '' && !pathPart.endsWith('/');
}

// Resolves true on success, false on any failure. Never rejects.
async function fetchFile(url, target) {
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const response = await fetch(url);
    if (response.status !== 200) {
      console.log(`${PLUGIN}: skipped ${url} (status ${response.status})`);
      return false;
    }
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target));
    console.log(`${PLUGIN}: saved ${target}`);
    return true;
  } catch (e) {
    // fetch reports transport failures as a bare "fetch failed"; the reason that
    // is worth logging (ECONNREFUSED, DNS, TLS) hangs off the cause.
    console.log(`${PLUGIN}: error saving ${url} to ${target}:`, e.cause?.message ?? e.message);
    return false;
  }
}

module.exports = {
  onPreBuild: async ({ utils }) => {
    const raw = process.env.LOAD_EXTERNAL_FILES_CONFIG;
    if (!raw) {
      console.log(`${PLUGIN}: environment variable LOAD_EXTERNAL_FILES_CONFIG not set`);
      return;
    }

    let config;
    try {
      config = JSON.parse(raw);
    } catch (e) {
      utils.build.failPlugin(`error encountered from ${PLUGIN} ${e.toString()}`);
      return;
    }

    const fail = (reason) => utils.build.failPlugin(`error encountered from ${PLUGIN}: ${reason}`);

    if (!config || !Array.isArray(config.files)) {
      fail('config must contain a "files" array');
      return;
    }
    if (config.files.length === 0) return;
    if (typeof config.baseURL !== 'string' || !config.baseURL) {
      fail('config must contain a "baseURL" string');
      return;
    }

    const malformed = config.files.findIndex((v) => !v || typeof v.extFile !== 'string'
      || (v.saveAt !== undefined && typeof v.saveAt !== 'string'));
    if (malformed !== -1) {
      fail(`files[${malformed}] needs a string "extFile" and an optional string "saveAt"`);
      return;
    }

    const unnamed = config.files.findIndex((v) => !namesAFile(v.extFile));
    if (unnamed !== -1) {
      fail(`files[${unnamed}] "extFile" does not name a file: ${JSON.stringify(config.files[unnamed].extFile)}`);
      return;
    }

    // Two entries resolving to one path would race two write streams over it,
    // leaving a corrupt file and still reporting both as saved.
    const downloads = [];
    const claimed = new Map();
    for (const [index, v] of config.files.entries()) {
      const target = path.join(OUTPUT_ROOT, v.saveAt || '', fileNameFor(v.extFile));
      if (claimed.has(target)) {
        fail(`files[${index}] and files[${claimed.get(target)}] both resolve to ${target}`);
        return;
      }
      claimed.set(target, index);
      downloads.push({ url: `${config.baseURL}/${v.extFile}`, target });
    }

    if (config.localPath !== undefined) {
      console.log(`${PLUGIN}: warning - "localPath" is ignored and has never had any effect; use each file's "saveAt"`);
    }

    const results = await Promise.all(downloads.map((d) => fetchFile(d.url, d.target)));

    const summary = `${results.filter(Boolean).length} of ${downloads.length} saved`;
    console.log('File download complete', summary);
    utils.status.show({ title: 'File download complete', summary });
  },
};
