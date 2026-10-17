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

/** Render one chart dir to an SVG string. Data `url`s resolve relative to the chart dir and may not leave it. */
export async function renderChart(dir) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'chart.vl.json'), 'utf8'));
  // Vega swallows loader errors, so check every data url up front.
  const urls = [];
  (function find(o) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'url' && typeof v === 'string') urls.push(v); else find(v); } })(spec);
  for (const u of urls) {
    const p = path.resolve(dir, u);
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) || path.relative(dir, p).startsWith('..') || !fs.existsSync(p)) throw new Error(`chart data url '${u}' must be a file inside ${dir}`);
  }
  const { spec: vg } = compile(spec);
  const base = vega.loader({ mode: 'file' });
  const loader = {
    ...base,
    sanitize: async (uri) => {
      const p = path.resolve(dir, uri);
      if (path.relative(dir, p).startsWith('..') || /^[a-z]+:/i.test(uri)) throw new Error(`chart data url '${uri}' must be a file inside ${dir}`);
      return { href: p };
    },
    load: async (uri) => fs.readFileSync((await loader.sanitize(uri)).href, 'utf8'),
  };
  const view = new vega.View(vega.parse(vg), { renderer: 'none', loader });
  const svg = await view.toSVG();
  view.finalize();
  return svg.endsWith('\n') ? svg : `${svg}\n`;
}

/** Returns { errors, outputs: { 'media/.../chart.svg': svg } }. With write=true, refreshes committed chart.svg files. */
export async function buildCharts(root, { write = false } = {}) {
  const errors = [];
  const outputs = {};
  for (const dir of findCharts(root)) {
    const rel = path.relative(root, dir).split(path.sep).join('/');
    if (!fs.existsSync(path.join(dir, 'README.md'))) errors.push(`${rel}: chart needs README.md with data source and long description (STYLE V3/V5)`);
    let svg;
    try { svg = await renderChart(dir); } catch (e) { errors.push(`${rel}: chart render failed: ${e.message}`); continue; }
    outputs[`${rel}/chart.svg`] = svg;
    const committed = path.join(dir, 'chart.svg');
    if (write) fs.writeFileSync(committed, svg);
    else if (!fs.existsSync(committed)) errors.push(`${rel}: chart.svg missing; run npm run charts`);
    else if (fs.readFileSync(committed, 'utf8') !== svg) errors.push(`${rel}: chart.svg is out of date with chart.vl.json/data; run npm run charts`);
  }
  return { errors, outputs };
}
