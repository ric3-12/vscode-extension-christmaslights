// Erzeugt die Pixel-Lichterkette als SVG (mit SMIL-Animation) und das CSS dazu.

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

function buildSvg({ animated = true, speed = 1 } = {}) {
  let seed = 1337;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`;

  // Kabel
  for (let x = 0; x < W; x++) s += r(x, wireY(x), 1, 1, '#1f4d2c');

  // Lämpchen
  let i = 0;
  for (let cx = STEP / 2; cx < W; cx += STEP, i++) {
    const c = COLORS[i % COLORS.length];
    const wy = wireY(cx);
    const top = wy + 3;

    s += r(cx - 1, wy + 1, 2, 2, '#2c3b30'); // Fassung
    s += bulb(cx, top, c.off);               // ausgeschaltete Birne (immer sichtbar)

    let glow = '';
    glow += r(cx - 3, top + 1, 6, 3, c.on, ' opacity="0.22"'); // Schein seitlich
    glow += r(cx - 2, top - 1, 4, 7, c.on, ' opacity="0.22"'); // Schein oben/unten
    glow += r(cx - 4, top + 2, 8, 1, c.on, ' opacity="0.12"'); // äusserer Schein
    glow += bulb(cx, top, c.on);
    glow += r(cx - 1, top + 1, 1, 1, c.hi);                    // Glanzpunkt

    if (animated) {
      const dur = ((1.8 + rnd() * 2.4) / speed).toFixed(2);
      const begin = (-rnd() * dur).toFixed(2);
      const low = (0.12 + rnd() * 0.25).toFixed(2);
      s += `<g>${glow}<animate attributeName="opacity" values="1;${low};1" keyTimes="0;0.5;1" ` +
        `calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></g>`;
    } else {
      s += `<g opacity="0.85">${glow}</g>`;
    }
  }
  return s + '</svg>';
}

const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// Maximale Höhe (px), damit die Kette in die jeweilige Leiste passt
const MAX_H = { titelleiste: 30, statusleiste: 21 };

/**
 * @param {{position?: 'titelleiste'|'statusleiste'|'ueberAllem', scale?: number, speed?: number, offsetTop?: number}} opts
 */
function buildCss({ position = 'titelleiste', scale = 2, speed = 1, offsetTop = 0 } = {}) {
  if (MAX_H[position]) scale = Math.min(scale, MAX_H[position] / H);
  const w = +(W * scale).toFixed(2), h = +(H * scale).toFixed(2);
  const anim = dataUri(buildSvg({ animated: true, speed }));
  const stat = dataUri(buildSvg({ animated: false }));
  const bg = (img) => `background-image:url("${img}")`;

  // Titel- und Statusleiste: Kette als Hintergrundbild → Text und Buttons liegen darüber
  const bar = (sel, pos) =>
    `${sel}{${bg(anim)} !important;background-repeat:repeat-x !important;` +
    `background-size:${w}px ${h}px !important;background-position:${pos} !important;}` +
    `@media (prefers-reduced-motion: reduce){${sel}{${bg(stat)} !important;}}`;

  // «Abdeckplatten» in der Leistenfarbe hinter Menü, Suchfeld, Icons usw.:
  // Die Kette verschwindet dahinter und leuchtet nur in den Lücken.
  const plates = (bar, items, active, inactive) => {
    const list = (pre) => items.map((i) => `${pre} ${i}`).join(',');
    const style = (v) => `{background-color:var(${v}) !important;box-shadow:0 0 0 5px var(${v});border-radius:6px;}`;
    return list(bar) + style(active) + list(`${bar}.inactive`) + style(inactive);
  };

  if (position === 'titelleiste') {
    const t = '.monaco-workbench .part.titlebar';
    // Menü (File, Edit …): Kette läuft dahinter durch, Text bekommt einen Schatten
    const menuText = `${t} .menubar-menu-title{text-shadow:0 0 3px #000,0 0 2px #000,0 0 1px #000;}`;
    return bar(t, '0 0') + menuText + plates(t,
      ['.window-appicon', '.monaco-toolbar', '.window-title:not(:has(.command-center))'],
      '--vscode-titleBar-activeBackground', '--vscode-titleBar-inactiveBackground');
  }
  if (position === 'statusleiste') {
    const s = '.monaco-workbench .part.statusbar';
    return bar(s, '0 50%') +
      `${s} > .items-container > .statusbar-item{background-color:var(--vscode-statusBar-background);}`;
  }

  // ueberAllem: wie bisher, schwebt über allem
  return (
    `body::after{content:"";position:fixed;top:${offsetTop}px;left:0;right:0;height:${h}px;` +
    `${bg(anim)};background-repeat:repeat-x;background-size:${w}px ${h}px;` +
    `pointer-events:none;z-index:2147483647;}` +
    `@media (prefers-reduced-motion: reduce){body::after{${bg(stat)};}}`
  );
}

module.exports = { buildSvg, buildCss, W, H };
