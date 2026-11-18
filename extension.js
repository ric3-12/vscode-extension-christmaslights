const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildCss } = require('./lights');

const START = '<!-- WEIHNACHTSLICHTER-START -->';
const END = '<!-- WEIHNACHTSLICHTER-END -->';
const CFG = 'weihnachtslichter';

// ---------- Dateien finden ----------

function findWorkbenchHtml() {
  const base = path.join(vscode.env.appRoot, 'out', 'vs', 'code');
  const candidates = [
    'electron-browser/workbench/workbench.html',
    'electron-sandbox/workbench/workbench.html',
    'electron-sandbox/workbench/workbench.esm.html',
  ];
  for (const c of candidates) {
    const p = path.join(base, c);
    if (fs.existsSync(p)) return p;
  }
  // Fallback: rekursiv suchen (falls VS Code die Struktur wieder ändert)
  const walk = (dir, depth) => {
    if (depth > 4 || !fs.existsSync(dir)) return null;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        const hit = walk(p, depth + 1);
        if (hit) return hit;
      } else if (/^workbench(\.esm)?\.html$/.test(e.name) && !p.includes('-dev')) {
        return p;
      }
    }
    return null;
  };
  return walk(base, 0);
}

// ---------- Patch / Unpatch ----------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripPatch = (html) => html.replace(new RegExp(escapeRe(START) + '[\\s\\S]*?' + escapeRe(END), 'g'), '');
const isPatched = (html) => html.includes(START);

function currentCss() {
  const c = vscode.workspace.getConfiguration(CFG);
  return buildCss({
    position: c.get('position', 'titelleiste'),
    scale: c.get('groesse', 2),
    speed: c.get('tempo', 1),
    offsetTop: c.get('abstandOben', 0),
    animation: c.get('animation', 'sparsam'),
  });
}

/** Aktualisiert die Prüfsumme in product.json, damit VS Code nicht «Installation beschädigt» meldet. */
function fixChecksum(htmlPath, html) {
  try {
    const productPath = path.join(vscode.env.appRoot, 'product.json');
    const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    if (!product.checksums) return;
    const rel = path.relative(path.join(vscode.env.appRoot, 'out'), htmlPath).split(path.sep).join('/');
    if (!(rel in product.checksums)) return;
    const hash = crypto.createHash('sha256').update(Buffer.from(html, 'utf8')).digest('base64').replace(/=+$/, '');
    if (product.checksums[rel] === hash) return;
    product.checksums[rel] = hash;
    fs.writeFileSync(productPath, JSON.stringify(product, null, '\t'), 'utf8');
  } catch {
    // Nicht kritisch: dann erscheint höchstens der Hinweis «Installation beschädigt».
  }
}

function writeHtml(enable) {
  const htmlPath = findWorkbenchHtml();
  if (!htmlPath) throw new Error('workbench.html wurde nicht gefunden.');
  let html = stripPatch(fs.readFileSync(htmlPath, 'utf8'));
  if (enable) {
    if (!html.includes('</head>')) throw new Error('Unerwartetes Format von workbench.html.');
    html = html.replace('</head>', `${START}<style>${currentCss()}</style>${END}</head>`);
  }
  fs.writeFileSync(htmlPath, html, 'utf8');
  fixChecksum(htmlPath, html);
}

function patchedNow() {
  const p = findWorkbenchHtml();
  return !!p && isPatched(fs.readFileSync(p, 'utf8'));
}

async function askReload(msg) {
  const btn = await vscode.window.showInformationMessage(msg, 'Fenster neu laden');
  if (btn) vscode.commands.executeCommand('workbench.action.reloadWindow');
}

function handleError(err) {
  const code = err && err.code;
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    vscode.window.showErrorMessage(
      'Keine Schreibrechte auf die VS-Code-Installation. Starte VS Code einmal als Administrator ' +
      '(Linux: Installationsordner beschreibbar machen; Snap/Flatpak wird nicht unterstützt).'
    );
  } else {
    vscode.window.showErrorMessage('Weihnachtslichter: ' + (err && err.message ? err.message : String(err)));
  }
}

// ---------- Commands ----------

async function enable() {
  try {
    writeHtml(true);
    await vscode.workspace.getConfiguration(CFG).update('aktiv', true, vscode.ConfigurationTarget.Global);
    askReload('🎄 Lichterkette eingeschaltet. Fenster neu laden, damit sie erscheint.');
  } catch (e) { handleError(e); }
}

async function disable() {
  try {
    writeHtml(false);
    await vscode.workspace.getConfiguration(CFG).update('aktiv', false, vscode.ConfigurationTarget.Global);
    askReload('Lichterkette ausgeschaltet. Fenster neu laden, damit sie verschwindet.');
  } catch (e) { handleError(e); }
}

async function choosePosition() {
  const items = [
    { label: '$(layout-panel-off) Titelleiste', description: 'hinter Menü und Titel (empfohlen)', value: 'titelleiste' },
    { label: '$(layout-statusbar) Statusleiste', description: 'unten, hinter den Statusanzeigen', value: 'statusleiste' },
    { label: '$(layers) Über allem', description: 'schwebt ganz oben über allem', value: 'ueberAllem' },
  ];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Wo soll die Lichterkette hängen?' });
  if (!pick) return;
  await vscode.workspace.getConfiguration(CFG).update('position', pick.value, vscode.ConfigurationTarget.Global);
  if (!patchedNow()) enable(); // Änderung an der Einstellung patcht sonst automatisch neu
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('weihnachtslichter.einschalten', enable),
    vscode.commands.registerCommand('weihnachtslichter.ausschalten', disable),
    vscode.commands.registerCommand('weihnachtslichter.position', choosePosition),
    vscode.workspace.onDidChangeConfiguration((e) => {
      const relevant = ['position', 'animation', 'groesse', 'tempo', 'abstandOben'].some((k) => e.affectsConfiguration(`${CFG}.${k}`));
      if (!relevant) return;
      try {
        if (patchedNow()) {
          writeHtml(true);
          askReload('Lichterkette angepasst. Fenster neu laden, um die Änderung zu sehen.');
        }
      } catch (err) { handleError(err); }
    })
  );

  // Nach einem VS-Code-Update ist der Patch weg → anbieten, ihn neu zu setzen.
  try {
    const wanted = vscode.workspace.getConfiguration(CFG).get('aktiv', false);
    if (wanted && !patchedNow()) {
      vscode.window
        .showInformationMessage('VS Code wurde aktualisiert – Lichterkette wieder einschalten?', 'Einschalten', 'Nein')
        .then((b) => (b === 'Einschalten' ? enable() : b === 'Nein' && disable()));
    }
  } catch { /* ignorieren */ }
}

function deactivate() {}

module.exports = { activate, deactivate, _test: { stripPatch, isPatched, START, END } };
