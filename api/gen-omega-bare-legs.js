#!/usr/bin/env node
/**
 * Generates omega-cut-bare.png — same model, bare legs instead of track pants.
 * Uses Replicate FLUX Fill Pro (inpainting).
 *
 * Usage:
 *   REPLICATE_TOKEN=r8_xxx node api/gen-omega-bare-legs.js
 *
 * Review omega-cut-bare.png, then if it looks good:
 *   1. Replace omega-cut.png with omega-cut-bare.png
 *   2. Delete all omega-*-result.jpg files
 *   3. Run: REPLICATE_TOKEN=r8_xxx node api/pregen.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const zlib  = require('zlib');

const TOKEN    = process.env.REPLICATE_TOKEN;
const REPO_DIR = path.join(__dirname, '..');
const SOURCE   = path.join(REPO_DIR, 'omega-cut.png');
const OUT_FILE = path.join(REPO_DIR, 'omega-cut-bare.png');
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS        = 90;

if (!TOKEN) { console.error('ERROR: REPLICATE_TOKEN env var is not set.'); process.exit(1); }
if (!fs.existsSync(SOURCE)) { console.error('ERROR: omega-cut.png not found in', REPO_DIR); process.exit(1); }

// ── CRC32 (for PNG generation) ────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Read PNG width/height from the IHDR chunk */
function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Create a grayscale PNG mask:
 *   black (0)   = keep original pixels
 *   white (255) = inpaint this area
 *
 * Shape:
 *   - Top (0..splitY):             all black  (keep head + torso)
 *   - Transition (splitY..fadeEnd): gradient  (smooth blend)
 *   - Bottom center (fadeEnd..h):  white only in center (edgePad on each side stays black)
 *
 * The center-only bottom mask prevents hallucinated limbs at the edges.
 */
function createMaskPng(w, h, splitY, fadeHeight = 80, edgePad = 0.18) {
  const fadeEnd   = splitY + fadeHeight;
  const leftEdge  = Math.round(w * edgePad);
  const rightEdge = Math.round(w * (1 - edgePad));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale

  const raw = Buffer.alloc(h * (1 + w));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w)] = 0; // filter = None
    for (let x = 0; x < w; x++) {
      let val;
      if (y < splitY) {
        val = 0; // keep
      } else if (y < fadeEnd) {
        // gradient fade, center only
        const t = (y - splitY) / fadeHeight;
        val = (x >= leftEdge && x < rightEdge) ? Math.round(t * 255) : 0;
      } else {
        // full inpaint in center, keep edges black
        val = (x >= leftEdge && x < rightEdge) ? 255 : 0;
      }
      raw[y * (1 + w) + 1 + x] = val;
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const u = new URL(url);
    https.request({ hostname: u.hostname, path: u.pathname + u.search }, res => {
      if (res.statusCode >= 400) {
        file.destroy();
        fs.unlink(destPath, () => {});
        return reject(new Error('Download HTTP ' + res.statusCode));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', reject).end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const { w, h } = readPngDimensions(SOURCE);
  console.log(`omega-cut.png: ${w}×${h}`);

  // Mask split just below the waistband (~45% from top)
  const splitY = Math.round(h * 0.45);
  console.log(`Mask: keep top ${splitY}px, inpaint bottom ${h - splitY}px (pants area)`);

  const sourceB64 = 'data:image/png;base64,' + fs.readFileSync(SOURCE).toString('base64');
  const maskPng   = createMaskPng(w, h, splitY);
  const maskB64   = 'data:image/png;base64,' + maskPng.toString('base64');

  console.log('Submitting to Replicate FLUX Fill Pro...');
  const { status, body } = await fetchJSON(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        input: {
          image:         sourceB64,
          mask:          maskB64,
          prompt:        'bare legs, smooth brown skin, standing straight, black background, studio photography, white sneakers, one person, solo figure, no extra limbs, clean edges, realistic, high quality',
          steps:         50,
          guidance:      30,
          output_format: 'png',
          output_quality: 95,
        },
      }),
    }
  );

  if (status !== 201) {
    console.error('Create failed HTTP', status, JSON.stringify(body));
    process.exit(1);
  }

  const predId = body.id;
  console.log(`Prediction ID: ${predId}  polling every ${POLL_INTERVAL_MS / 1000}s...`);

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const { status: ps, body: pb } = await fetchJSON(
      'https://api.replicate.com/v1/predictions/' + predId,
      { headers: { 'Authorization': 'Bearer ' + TOKEN } }
    );
    if (ps !== 200) throw new Error('Poll HTTP ' + ps);
    if (pb.status === 'succeeded') {
      const inpaintUrl = Array.isArray(pb.output) ? pb.output[0] : pb.output;
      const INPAINT_TMP = path.join(REPO_DIR, 'omega-cut-bare-raw.png');
      console.log('\nInpainting done! Downloading raw result...');
      await downloadFile(inpaintUrl, INPAINT_TMP);
      console.log(`Raw inpaint saved (${Math.round(fs.statSync(INPAINT_TMP).size / 1024)} KB)`);

      // ── Step 2: background removal for clean cutout edges ────────────────
      console.log('\nRunning background removal for clean edges...');
      const rawB64 = 'data:image/png;base64,' + fs.readFileSync(INPAINT_TMP).toString('base64');

      const { status: bgStatus, body: bgBody } = await fetchJSON(
        'https://api.replicate.com/v1/models/lucataco/remove-bg/predictions',
        {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { image: rawB64 } }),
        }
      );

      if (bgStatus !== 201) {
        console.error('BG removal create failed HTTP', bgStatus, JSON.stringify(bgBody));
        process.exit(1);
      }

      console.log(`BG removal ID: ${bgBody.id}  polling...`);
      for (let j = 0; j < MAX_POLLS; j++) {
        await sleep(POLL_INTERVAL_MS);
        const { status: bps, body: bpb } = await fetchJSON(
          'https://api.replicate.com/v1/predictions/' + bgBody.id,
          { headers: { 'Authorization': 'Bearer ' + TOKEN } }
        );
        if (bps !== 200) throw new Error('BG poll HTTP ' + bps);
        if (bpb.status === 'succeeded') {
          const bgUrl = Array.isArray(bpb.output) ? bpb.output[0] : bpb.output;
          console.log('\nBackground removal done! Downloading → omega-cut-bare.png ...');
          await downloadFile(bgUrl, OUT_FILE);
          fs.unlinkSync(INPAINT_TMP);
          console.log(`Saved: omega-cut-bare.png (${Math.round(fs.statSync(OUT_FILE).size / 1024)} KB)`);
          console.log('\n── Next steps ──────────────────────────────────────────');
          console.log('1. Review omega-cut-bare.png');
          console.log('2. If it looks good:');
          console.log('     copy omega-cut-bare.png omega-cut.png');
          console.log('     del omega-*-result.jpg');
          console.log('     REPLICATE_TOKEN=r8_xxx node api/pregen.js');
          return;
        }
        if (bpb.status === 'failed') {
          console.error('\nBG removal failed:', bpb.error || 'unknown');
          process.exit(1);
        }
        process.stdout.write('.');
      }
      throw new Error('BG removal timed out');
    }
    if (pb.status === 'failed') {
      console.error('\nPrediction failed:', pb.error || 'unknown error');
      process.exit(1);
    }
    process.stdout.write('.');
  }
  console.error('\nTimed out after', MAX_POLLS, 'polls.');
  process.exit(1);
})();
