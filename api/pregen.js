#!/usr/bin/env node
/**
 * 1DE1 Pre-generation script
 * Generates all 9 character × product try-on combinations via Replicate IDM-VTON
 * and saves result URLs to pregen-results.json at the repo root.
 *
 * Usage:
 *   REPLICATE_TOKEN=r8_xxx node api/pregen.js
 *
 * Skips combinations that already have a result in pregen-results.json.
 * Run again to fill in any failed/missing combos.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const TOKEN    = process.env.REPLICATE_TOKEN;
const RAW_BASE = 'https://raw.githubusercontent.com/Ngo-hub/1de1-store/main/';
const VERSION  = 'c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4';
const OUT_FILE = path.join(__dirname, '..', 'pregen-results.json');
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS        = 60; // 4 min max per combo

if (!TOKEN) {
  console.error('ERROR: REPLICATE_TOKEN env var is not set.');
  process.exit(1);
}

const characters = [
  { id: 'alpha', cutout: 'alpha-cut.png' },
  { id: 'omega', cutout: 'omega-cut.png' },
  { id: 'delta', cutout: 'delta-cut.png' },
];

const garments = [
  { id: 'uni-zip',   cutout: 'uni-zip-cut.png',   desc: 'green zip-up hoodie with mixed media artwork patch' },
  { id: 'uni-tee',   cutout: 'uni-tee-cut.png',   desc: 'black oversized t-shirt with gothic logo' },
  { id: 'uni-rugby', cutout: 'uni-rugby-cut.png', desc: 'red and white striped rugby polo with embroidered logo' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const reqOpts = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
    };
    const req = https.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadResults() {
  try { return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); }
  catch (_) { return {}; }
}

function saveResults(results) {
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), 'utf8');
}

// ── Core ─────────────────────────────────────────────────────────────────────

async function createPrediction(personImage, garmentImage, garmentDesc) {
  const { status, body } = await fetchJSON('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization':  'Bearer ' + TOKEN,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify({
      version: VERSION,
      input: {
        human_img:        personImage,
        garm_img:         garmentImage,
        garment_des:      garmentDesc,
        is_checked:       true,
        is_checked_crop:  true,
        denoise_steps:    35,
        guidance_scale:   2.0,
        seed:             42,
      },
    }),
  });

  if (status !== 201) throw new Error('Create failed HTTP ' + status + ': ' + JSON.stringify(body));
  return body.id;
}

async function pollPrediction(predictionId) {
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const { status, body } = await fetchJSON(
      'https://api.replicate.com/v1/predictions/' + predictionId,
      { headers: { 'Authorization': 'Bearer ' + TOKEN } }
    );
    if (status !== 200) throw new Error('Poll HTTP ' + status);
    if (body.status === 'succeeded') {
      const url = Array.isArray(body.output) ? body.output[0] : body.output;
      if (!url) throw new Error('No output URL');
      return url;
    }
    if (body.status === 'failed') throw new Error('Prediction failed: ' + (body.error || 'unknown'));
    process.stdout.write('.');
  }
  throw new Error('Polling timed out after ' + MAX_POLLS + ' attempts');
}

async function generateCombo(charId, charCutout, garmentId, garmentCutout, garmentDesc) {
  const key          = charId + '-' + garmentId;
  const personImage  = RAW_BASE + charCutout;
  const garmentImage = RAW_BASE + garmentCutout;

  console.log('\n[' + key + '] Creating prediction...');
  const predId = await createPrediction(personImage, garmentImage, garmentDesc);
  console.log('[' + key + '] ID: ' + predId + '  polling', { interval: POLL_INTERVAL_MS + 'ms', max: MAX_POLLS });

  const imageUrl = await pollPrediction(predId);
  console.log('\n[' + key + '] ✓  ' + imageUrl);
  return imageUrl;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const results = loadResults();
  console.log('Loaded', Object.keys(results).length, 'existing results from', OUT_FILE);

  const combos = [];
  for (const char of characters) {
    for (const garment of garments) {
      const key = char.id + '-' + garment.id;
      if (results[key]) {
        console.log('[' + key + '] already cached — skipping');
      } else {
        combos.push({ char, garment, key });
      }
    }
  }

  if (combos.length === 0) {
    console.log('\nAll 9 combinations already generated. Nothing to do.');
    return;
  }

  console.log('\nGenerating', combos.length, 'combination(s) sequentially...');

  for (const { char, garment, key } of combos) {
    try {
      const url = await generateCombo(
        char.id, char.cutout,
        garment.id, garment.cutout, garment.desc
      );
      results[key] = url;
      saveResults(results);
      console.log('[' + key + '] saved to', OUT_FILE);
    } catch (err) {
      console.error('\n[' + key + '] FAILED:', err.message);
      // Continue with remaining combos
    }
  }

  const total = Object.keys(results).length;
  console.log('\nDone. ' + total + '/9 combinations cached in pregen-results.json');
  if (total < 9) {
    console.log('Run again to retry failed combinations.');
    process.exit(1);
  }
})();
