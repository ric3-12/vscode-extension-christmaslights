// Erzeugt die Pixel-Lichterkette und das CSS dazu.
//
// Leistung: Das Kabel und die ausgeschalteten Birnen liegen als stilles Hintergrundbild
// in der Leiste. Das Leuchten ist auf mehrere Ebenen (Pseudo-Elemente) verteilt, die
// per CSS nur ihre Deckkraft (opacity) animieren. Diese Animation übernimmt der Compositor
// bzw. die Grafikkarte, die Leiste muss also nicht bei jedem Bild neu gezeichnet werden.

const COLORS = [
  { on: '#ff3b3b', off: '#4a1212', hi: '#ffd6d6' }, // Rot
  { on: '#ffcf3f', off: '#4a3a0e', hi: '#fff6cc' }, // Gold
  { on: '#2fe06b', off: '#0e3f20', hi: '#d2ffe0' }, // Grün
  { on: '#3fa2ff', off: '#10324f', hi: '#d6ecff' }, // Blau
];

const W = 200;    // Kachelbreite in Pixel-Einheiten
const H = 13;     // Höhe in Pixel-Einheiten
const SPAN = 40;  // Abstand zwischen zwei Aufhängepunkten (Durchhang)
const STEP = 10;  // Abstand zwischen zwei Lämpchen

const wireY = (x) => 1 + Math.round(3 * Math.sin(Math.PI * ((((x % SPAN) + SPAN) % SPAN) / SPAN)));
const r = (x, y, w, h, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;

// Birnenform 4x5:  .XX. / XXXX / XXXX / XXXX / .XX.
const bulb = (cx, top, fill) =>
  r(cx - 1, top, 2, 1, fill) + r(cx - 2, top + 1, 4, 3, fill) + r(cx - 1, top + 4, 2, 1, fill);

const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`;

function bulbs() {
  const list = [];
  let i = 0;
  for (let cx = STEP / 2; cx < W; cx += STEP, i++) {
    const wy = wireY(cx);
    list.push({ i, cx, wy, top: wy + 3, c: COLORS[i % COLORS.length] });
  }
  return list;
}

/** Kabel, Fassungen und ausgeschaltete Birnen – ändert sich nie. */
function buildBaseSvg() {
  let s = svgOpen;
  for (let x = 0; x < W; x++) s += r(x, wireY(x), 1, 1, '#1f4d2c');
  for (const b of bulbs()) {
    s += r(b.cx - 1, b.wy + 1, 2, 2, '#2c3b30');
    s += bulb(b.cx, b.top, b.c.off);
  }
  return s + '</svg>';
}

/** Leuchtende Birnen einer Gruppe (oder aller Gruppen, wenn group = null). */
function buildGlowSvg(groupOf, group) {
  let s = svgOpen;
  for (const b of bulbs()) {
    if (group !== null && groupOf[b.i] !== group) continue;
    const { cx, top, c } = b;
    s += r(cx - 3, top + 1, 6, 3, c.on, ' opacity="0.22"');
    s += r(cx - 2, top - 1, 4, 7, c.on, ' opacity="0.22"');
    s += r(cx - 4, top + 2, 8, 1, c.on, ' opacity="0.12"');
    s += bulb(cx, top, c.on);
    s += r(cx - 1, top + 1, 1, 1, c.hi);
  }
  return s + '</svg>';
}

/** Verteilt die Birnen zufällig (aber immer gleich) auf n Gruppen, Nachbarn nie in derselben. */
function assignGroups(n) {
  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out = [];
  const count = W / STEP;
  for (let i = 0; i < count; i++) {
    let g;
    do { g = Math.floor(rnd() * n); } while (n > 1 && (g === out[i - 1] || (i === count - 1 && g === out[0])));
    out.push(g);
  }
  return out;
}

const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// Maximale Höhe (px), damit die Kette in die jeweilige Leiste passt
const MAX_H = { titelleiste: 30, statusleiste: 21 };

const T = '.monaco-workbench .part.titlebar';
const S = '.monaco-workbench .part.statusbar';

// Elemente, deren ::before/::after als Leucht-Ebenen dienen (nur ungenutzte Pseudo-Elemente)
const LAYERS = {
  titelleiste: [
    `${T}::before`, `${T}::after`,
    `${T} > .titlebar-container::before`, `${T} > .titlebar-container::after`,
    `${T} > .titlebar-container > .titlebar-drag-region::before`, `${T} > .titlebar-container > .titlebar-drag-region::after`,
  ],
  statusleiste: [
    `${S}::before`,
    `${S} > .left-items::before`, `${S} > .left-items::after`,
    `${S} > .right-items::before`, `${S} > .right-items::after`,
  ],
  ueberAllem: ['body::before', 'body::after', 'html::after'],
};

/**
 * @param {{position?: 'titelleiste'|'statusleiste'|'ueberAllem', scale?: number, speed?: number, offsetTop?: number, animation?: 'sparsam'|'fluessig'|'aus'}} opts
 */
function buildCss({ position = 'titelleiste', scale = 2, speed = 1, offsetTop = 0, animation = 'sparsam' } = {}) {
  // sparsam: 8 Helligkeitsstufen pro Halbphase (deutlich weniger CPU), fluessig: stufenlos, aus: ruhiges Leuchten
  const easing = animation === 'fluessig' ? 'ease-in-out' : 'steps(8)';
  if (!LAYERS[position]) position = 'titelleiste';
  if (MAX_H[position]) scale = Math.min(scale, MAX_H[position] / H);
  const w = +(W * scale).toFixed(2), h = +(H * scale).toFixed(2);
  const layers = LAYERS[position];
  const n = layers.length;
  const groupOf = assignGroups(n);

  const base = dataUri(buildBaseSvg());
  const tile = `background-repeat:repeat-x;background-size:${w}px ${h}px;background-position:0 0;`;

  // Vertikale Lage der Kette
  const top = position === 'statusleiste' ? `calc(50% - ${h / 2}px)` : position === 'ueberAllem' ? `${offsetTop}px` : '0';

  let css = '';

  // 1) Stilles Grundbild
  if (position === 'ueberAllem') {
    css += `html::before{content:"";position:fixed;top:${top};left:0;right:0;height:${h}px;` +
      `background-image:url("${base}");${tile}pointer-events:none;z-index:2147483646;}`;
  } else {
    const bar = position === 'titelleiste' ? T : S;
    const pos = position === 'statusleiste' ? `0 calc(50% - ${h / 2}px)` : '0 0';
    css += `${bar}{position:relative;isolation:isolate;background-image:url("${base}") !important;` +
      `background-repeat:repeat-x !important;background-size:${w}px ${h}px !important;background-position:${pos} !important;}`;
  }

  // 2) Leucht-Ebenen: jede Gruppe pulsiert in eigenem Tempo, nur die Deckkraft wird animiert
  let seed = 99;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  layers.forEach((sel, g) => {
    const dur = ((2.1 + g * 0.47 + rnd() * 0.3) / speed).toFixed(2);
    const delay = (-rnd() * dur).toFixed(2);
    const low = (0.12 + rnd() * 0.22).toFixed(2);
    const name = `wl-puls-${g}`;
    const fixed = position === 'ueberAllem';
    css += `@keyframes ${name}{0%,100%{opacity:1}50%{opacity:${low}}}`;
    css += `${sel}{content:"";position:${fixed ? 'fixed' : 'absolute'};top:${top};left:0;right:0;height:${h}px;` +
      `background-image:url("${dataUri(buildGlowSvg(groupOf, g))}");${tile}` +
      `pointer-events:none;z-index:${fixed ? 2147483647 : -1};will-change:opacity;` +
      `animation:${name} ${dur}s ${easing} ${delay}s infinite;}`;
  });

  // 3) Pause, wenn das Fenster nicht aktiv ist; ruhig leuchten bei «Bewegung reduzieren»
  const paused = position === 'titelleiste'
    ? layers.map((s) => s.replace(T, `${T}.inactive`)).join(',')
    : null;
  if (paused) css += `${paused}{animation-play-state:paused;}`;
  const still = `${layers.join(',')}{animation:none;opacity:.85;}`;
  css += animation === 'aus' ? still : `@media (prefers-reduced-motion: reduce){${still}}`;

  // 4) Lesbarkeit
  if (position === 'titelleiste') {
    css += `${T} .menubar-menu-title{text-shadow:0 0 3px #000,0 0 2px #000,0 0 1px #000;}`;
    const items = ['.window-appicon', '.monaco-toolbar', '.window-title:not(:has(.command-center))'];
    const plate = (v) => `{background-color:var(${v}) !important;box-shadow:0 0 0 5px var(${v});border-radius:6px;}`;
    css += items.map((i) => `${T} ${i}`).join(',') + plate('--vscode-titleBar-activeBackground');
    css += items.map((i) => `${T}.inactive ${i}`).join(',') + plate('--vscode-titleBar-inactiveBackground');
  }
  if (position === 'statusleiste') {
    css += `${S} > .items-container > .statusbar-item{background-color:var(--vscode-statusBar-background);}`;
  }
  return css;
}

module.exports = { buildCss, buildBaseSvg, buildGlowSvg, W, H };
