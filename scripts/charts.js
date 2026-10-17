// STYLE V3: render media/<slug>/<chart>/chart.vl.json (Vega-Lite) to SVG server-side. No browser, no canvas.
import fs from 'node:fs';
import path from 'node:path';
import * as vega from 'vega';
import { compile } from 'vega-lite';

export function findCharts(root) {
  const media = path.join(root, 'media');
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

/**
 * Resolve a chart data url to an absolute path for reading only. Refuses schemes, absolute paths,
 * symlinks (at the file or any folder level) and anything whose real path is outside the chart folder.
 */
export function safeDataPath(dir, uri) {
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
  return p;
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
    sanitize: async (uri) => ({ href: typeof uri === 'string' ? uri : '' }),
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

/** Returns { errors, outputs: { 'media/.../chart.svg': svg } }. With write=true, refreshes committed chart.svg files. */
export async function buildCharts(root, { write = false } = {}) {
  const errors = [];
  const outputs = {};
  for (const dir of findCharts(root)) {
    const rel = path.relative(root, dir).split(path.sep).join('/');
    if (!fs.existsSync(path.join(dir, 'README.md'))) errors.push(`${rel}: chart needs README.md with data source and long description (STYLE V3/V5)`);
    let svg;
    try { svg = await renderChart(dir); } catch (e) { errors.push(`${rel}: ${e.message}`); continue; }
    outputs[`${rel}/chart.svg`] = svg;
    const committed = path.join(dir, 'chart.svg');
    if (write) fs.writeFileSync(committed, svg);
    else if (!fs.existsSync(committed)) errors.push(`${rel}: chart.svg missing; run npm run charts`);
    else if (fs.readFileSync(committed, 'utf8') !== svg) errors.push(`${rel}: chart.svg is out of date with chart.vl.json/data; run npm run charts`);
  }
  return { errors, outputs };
}
