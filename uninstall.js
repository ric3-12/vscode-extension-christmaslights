// Wird von VS Code nach dem Deinstallieren ausgeführt («vscode:uninstall»), ohne VS-Code-API.
// Entfernt den Lichterketten-Block aus workbench.html und stellt die Prüfsumme wieder her.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START = '<!-- WEIHNACHTSLICHTER-START -->';
const END = '<!-- WEIHNACHTSLICHTER-END -->';
const re = /<!-- WEIHNACHTSLICHTER-START -->[\s\S]*?<!-- WEIHNACHTSLICHTER-END -->/g;

function appRoots() {
  const exeDir = process.env.WL_TEST_EXEDIR || path.dirname(process.execPath);
  const roots = [
    path.join(exeDir, 'resources', 'app'),                    // Windows / Linux
    path.join(exeDir, '..', 'Resources', 'app'),              // macOS
  ];
  // Neuere Windows-Installationen: <Installation>\<commit>\resources\app
  try {
    for (const e of fs.readdirSync(exeDir, { withFileTypes: true })) {
      if (e.isDirectory()) roots.push(path.join(exeDir, e.name, 'resources', 'app'));
    }
  } catch { /* ignorieren */ }
  return roots.filter((r) => fs.existsSync(path.join(r, 'product.json')));
}

function findHtml(appRoot) {
  const base = path.join(appRoot, 'out', 'vs', 'code');
  return [
    'electron-browser/workbench/workbench.html',
    'electron-sandbox/workbench/workbench.html',
    'electron-sandbox/workbench/workbench.esm.html',
  ].map((c) => path.join(base, c)).filter((p) => fs.existsSync(p));
}

for (const root of appRoots()) {
  for (const htmlPath of findHtml(root)) {
    try {
      const html = fs.readFileSync(htmlPath, 'utf8');
      if (!html.includes(START)) continue;
      const clean = html.replace(re, '');
      fs.writeFileSync(htmlPath, clean, 'utf8');

      const productPath = path.join(root, 'product.json');
      const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
      const rel = path.relative(path.join(root, 'out'), htmlPath).split(path.sep).join('/');
      if (product.checksums && rel in product.checksums) {
        product.checksums[rel] = crypto.createHash('sha256').update(Buffer.from(clean, 'utf8')).digest('base64').replace(/=+$/, '');
        fs.writeFileSync(productPath, JSON.stringify(product, null, '\t'), 'utf8');
      }
      console.log('Weihnachtslichter entfernt aus', htmlPath);
    } catch (e) {
      console.error('Weihnachtslichter: Entfernen fehlgeschlagen', e && e.message);
    }
  }
}
void END;
