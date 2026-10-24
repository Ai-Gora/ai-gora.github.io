// STYLE V3: chart sources live in charts/<slug>/<chart>/ (chart.vl.json, data, README.md). They are rendered
// server-side to SVG (vega, no browser), and `npm run charts` rasterises that SVG to the only published file,
// media/<slug>/<chart>.png. SVG is never published (STYLE V7). render.json records the SVG and PNG hashes, and CI also
// rasterises each chart again with the pinned fonts and checks the result is byte-identical to the committed PNG.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vega from 'vega';
import { compile } from 'vega-lite';

export function findCharts(root) {
  const media = path.join(root, 'charts');
  if (!fs.existsSync(media)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'chart.vl.json') out.push(path.dirname(p));
    }
  };
  walk(media);
  return out.sort();
}

// Chart data urls may only name data files; chart image marks may only name raster images resvg can decode.
export const DATA_EXT = ['.csv', '.tsv', '.json', '.topojson', '.geojson', '.dsv', '.txt'];
export const CHART_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif'];

/**
 * Resolve a chart data url to an absolute path for reading only. Refuses schemes, absolute paths,
 * symlinks (at the file or any folder level), anything whose real path is outside the chart folder, and file types
 * not in `exts` (data files by default; a chart cannot pull in e.g. README.md, .env or a script).
 */
export function safeDataPath(dir, uri, exts = DATA_EXT) {
  const fail = () => new Error(`chart data url '${uri}' must be a regular file inside the chart folder (no symlinks)`);
  if (typeof uri !== 'string' || !uri || /^[a-z][a-z0-9+.-]*:/i.test(uri) || path.isAbsolute(uri)) throw fail();
  const realDir = fs.realpathSync(dir);
  const p = path.resolve(realDir, uri);
  const rel = path.relative(realDir, p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw fail();
  let st;
  try { st = fs.lstatSync(p); } catch { throw fail(); }
  if (st.isSymbolicLink() || !st.isFile()) throw fail();
  const real = path.relative(realDir, fs.realpathSync(p));
  if (real !== rel) throw fail(); // a folder on the way is a symlink
  if (!exts.includes(path.extname(uri).toLowerCase())) throw new Error(`chart url '${uri}' must be one of these file types: ${exts.join(', ')}`);
  return p;
}

/**
 * URL allowed into chart.svg, or '' (dropped). Images: a relative path to a regular, non-symlink file inside the
 * chart folder. Links: the same, or an absolute https: URL. Everything else is refused: javascript:, data:, http:,
 * file:, protocol-relative //, backslashes, whitespace/control characters, remote images, unknown contexts.
 */
export function sanitizeChartUrl(dir, uri, context) {
  if (typeof uri !== 'string' || !uri || uri.length > 2048) return '';
  if (context !== 'href' && context !== 'image') return '';
  // Browsers ignore tabs/newlines inside schemes ("java\tscript:"); refuse any whitespace, control chars or backslashes.
  // eslint-disable-next-line no-control-regex -- deliberately matching control characters
  if (/[\u0000-\u0020\u007f-\u009f\\]/.test(uri)) return '';
  if (uri.startsWith('//')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    if (context !== 'href') return '';
    let u;
    try { u = new URL(uri); } catch { return ''; }
    return u.protocol === 'https:' && u.hostname && !u.username && !u.password ? u.href : '';
  }
  try { safeDataPath(dir, uri, context === 'image' ? CHART_IMAGE_EXT : [...DATA_EXT, ...CHART_IMAGE_EXT]); } catch { return ''; }
  return uri;
}

/** Render one chart dir to an SVG string. SVG output keeps urls relative; absolute paths are only used to read data. */
export async function renderChart(dir) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'chart.vl.json'), 'utf8'));
  // Vega swallows loader errors, so check every data url up front.
  const urls = [];
  (function find(o) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'url' && typeof v === 'string') urls.push(v); else find(v); } })(spec);
  for (const u of urls) safeDataPath(dir, u);
  const loader = {
    // Used by Vega for data loading and for image/href attributes written into the SVG.
    // Called by Vega for links (context 'href') and images (context 'image'); its href goes into the SVG.
    sanitize: async (uri, options) => ({ href: sanitizeChartUrl(dir, uri, options?.context) }),
    load: async (uri) => fs.readFileSync(safeDataPath(dir, uri), 'utf8'),
    file: async (p) => fs.readFileSync(safeDataPath(dir, p), 'utf8'),
    http: async (uri) => { throw new Error(`chart data url '${uri}': network access is not allowed`); },
  };
  let view;
  try {
    const { spec: vg } = compile(spec);
    const logged = [];
    const logger = { level() { return this; }, error: (...a) => logged.push(a.map((x) => x?.message || String(x)).join(' ')), warn() {}, info() {}, debug() {} };
    view = new vega.View(vega.parse(vg), { renderer: 'none', loader, logger });
    await view.runAsync();
    if (logged.length) throw new Error(logged[0]);
    const svg = await view.toSVG();
    return svg.endsWith('\n') ? svg : `${svg}\n`;
  } catch (e) {
    throw new Error(`chart render failed: ${e.message}`);
  } finally {
    view?.finalize();
  }
}

const CHART_DIR = /^charts\/([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// Fonts are pinned: only the committed Liberation Sans files (OFL-1.1, fonts/*.license.yaml) are used, never system
// fonts, so the same SVG gives byte-identical PNGs locally and in CI.
export const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
export const FONT_FILES = ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf'].map((f) => path.join(FONT_DIR, f));

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
const unescapeAttr = (v) => v.replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Inline every <image> href as a data: URI read from the chart folder. resvg would otherwise read relative and
 * absolute paths from disk by itself (relative to the process, not the chart), so nothing is left for it to load.
 */
export function embedChartImages(svg, dir) {
  return svg.replace(/<image\b[^>]*>/g, (tag) => tag.replace(/\b((?:xlink:)?href)="([^"]*)"/g, (_, attr, raw) => {
    const href = unescapeAttr(raw);
    if (!href) return `${attr}=""`;
    if (!dir) throw new Error(`chart image '${href}' needs the chart folder to resolve`);
    const p = safeDataPath(dir, href, CHART_IMAGE_EXT);
    return `${attr}="data:${MIME[path.extname(p).toLowerCase()]};base64,${fs.readFileSync(p).toString('base64')}"`;
  }));
}

/**
 * SVG string -> PNG Buffer at 2x, white background, pinned fonts. Local chart images (<image href="pic.png">, already
 * limited by sanitizeChartUrl) are read from the chart folder `dir` and embedded, so the published PNG shows them.
 */
export async function rasterise(svg, dir) {
  const { Resvg } = await import('@resvg/resvg-js');
  const font = { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: 'Liberation Sans', sansSerifFamily: 'Liberation Sans' };
  const resvg = new Resvg(embedChartImages(svg, dir), { fitTo: { mode: 'zoom', value: 2 }, background: 'white', font });
  const remote = resvg.imagesToResolve();
  if (remote.length) throw new Error(`chart image '${remote[0]}' is remote; only in-folder images are allowed`);
  return Buffer.from(resvg.render().asPng());
}

const chartSidecar = (rel, png, spec, buf) => [
  `file: ${path.basename(png)}`,
  `title: ${JSON.stringify(typeof spec.title === 'string' ? spec.title : path.basename(rel))}`,
  'author: Aigora contributors',
  `source_url: https://github.com/Ai-Gora/ai-gora.github.io/tree/main/${rel}`,
  'license: CC-BY-SA-4.0',
  'license_url: https://creativecommons.org/licenses/by-sa/4.0/',
  `modified: "rendered by npm run charts from ${rel}/chart.vl.json (Vega-Lite to SVG to PNG)"`,
  'format: image/png',
  `width: ${buf.readUInt32BE(16)}`,
  `height: ${buf.readUInt32BE(20)}`,
  'ai_generated: false',
  `notes: Data source and long description are in ${rel}/README.md.`,
  '',
].join('\n');

/**
 * Returns { errors, count }. Checks that each chart renders and that charts/<slug>/<chart>/render.json matches the
 * current SVG render and the committed media/<slug>/<chart>.png. With write=true, rasterises and refreshes both.
 */
export async function buildCharts(root, { write = false } = {}) {
  const errors = [];
  let count = 0;
  for (const dir of findCharts(root)) {
    const rel = path.relative(root, dir).split(path.sep).join('/');
    const m = CHART_DIR.exec(rel);
    if (!m) { errors.push(`${rel}: chart folders must be charts/<slug>/<chart> (lowercase, digits, hyphens)`); continue; }
    if (!fs.existsSync(path.join(dir, 'README.md'))) errors.push(`${rel}: chart needs README.md with data source and long description (STYLE V3/V5)`);
    let svg;
    try { svg = await renderChart(dir); } catch (e) { errors.push(`${rel}: ${e.message}`); continue; }
    count++;
    const pngRel = `media/${m[1]}/${m[2]}.png`;
    const pngAbs = path.join(root, pngRel);
    const stampAbs = path.join(dir, 'render.json');
    if (write) {
      const png = await rasterise(svg, dir);
      fs.mkdirSync(path.dirname(pngAbs), { recursive: true });
      fs.writeFileSync(pngAbs, png);
      const side = `${pngAbs}.license.yaml`;
      if (!fs.existsSync(side)) fs.writeFileSync(side, chartSidecar(rel, pngAbs, JSON.parse(fs.readFileSync(path.join(dir, 'chart.vl.json'), 'utf8')), png));
      fs.writeFileSync(stampAbs, `${JSON.stringify({ png: pngRel, svg_sha256: sha256(svg), png_sha256: sha256(png) }, null, 2)}\n`);
      continue;
    }
    let stamp;
    try { stamp = JSON.parse(fs.readFileSync(stampAbs, 'utf8')); } catch { errors.push(`${rel}: render.json missing or invalid; run npm run charts`); continue; }
    if (stamp.svg_sha256 !== sha256(svg)) errors.push(`${rel}: ${pngRel} is out of date with chart.vl.json/data; run npm run charts`);
    else if (!fs.existsSync(pngAbs)) errors.push(`${rel}: ${pngRel} missing; run npm run charts`);
    else if (stamp.png !== pngRel || stamp.png_sha256 !== sha256(fs.readFileSync(pngAbs))) errors.push(`${rel}: ${pngRel} does not match render.json (edited by hand?); run npm run charts`);
    else {
      // Rasterise again (pinned fonts) and compare with the committed PNG, so renderer or font drift is caught too.
      let png;
      try { png = await rasterise(svg, dir); } catch (e) { errors.push(`${rel}: rasterise failed: ${e.message}`); continue; }
      if (!png.equals(fs.readFileSync(pngAbs))) errors.push(`${rel}: ${pngRel} differs from a fresh rasterisation (renderer/font drift?); run npm run charts`);
    }
  }
  return { errors, count };
}
