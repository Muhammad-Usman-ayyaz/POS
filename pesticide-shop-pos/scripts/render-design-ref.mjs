// Development helper (not part of the app): renders the design references (docs/design/*.dc.html) to PNG with headless Edge or Chrome so they can be
// compared with the built documents. The .dc.html files are plain HTML and CSS inside <x-dc>; the Google font links are replaced by the font files that
// ship with the app, so nothing needs the internet. Usage: node scripts/render-design-ref.mjs <outDir>
// Settings.dc.html is a template (sc-if / sc-for) that only support.js fills in; the "Shop details" section is turned into static HTML here.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'apps/desktop/.conformance-ref'));
mkdirSync(out, { recursive: true });
const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!browser) throw new Error('no Edge or Chrome found');

const font = (p) => pathToFileURL(join(root, 'node_modules', p)).href;
const FONTS = [400, 500, 600, 700].map((w) => `@font-face{font-family:'IBM Plex Sans';font-weight:${w};src:url(${font(`@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-${w}-normal.woff2`)})}`).join('') +
  `@font-face{font-family:'Noto Naskh Arabic';font-weight:400 700;src:url(${font('@fontsource-variable/noto-naskh-arabic/files/noto-naskh-arabic-arabic-wght-normal.woff2')})}`;

function page(name, transform) {
  let html = readFileSync(join(root, 'docs/design', name), 'utf8');
  html = html.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, '').replace(/<script[^>]*><\/script>/g, '').replace(/<script type="text\/x-dc"[\s\S]*?<\/script>/, '');
  html = html.replace('<style>', `<style>${FONTS}`);
  return transform ? transform(html) : html;
}

function shot(file, html, width, height) {
  const htmlPath = join(out, file.replace('.png', '.html'));
  writeFileSync(htmlPath, html);
  const r = spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${width},${height}`, `--screenshot=${join(out, file)}`, pathToFileURL(htmlPath).href], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`browser failed for ${file}`);
}

shot('ref-receipts80.png', page('Receipts80.dc.html'), 1100, 900);
shot('ref-invoiceA4.png', page('InvoiceA4.dc.html'), 1800, 1240);
shot('ref-settings-shop.png', page('Settings.dc.html', (html) => {
  const start = html.indexOf('<sc-if value="{{showShop}}"');
  const end = html.indexOf('<sc-if value="{{showStaff}}"');
  const shop = html.slice(start, end);
  const subnav = ['Shop details', 'Staff and sign-in', 'Backup and restore', 'About'].map((l, i) => `<button class="sub ${i === 0 ? 'on' : ''}">${l}</button>`).join('');
  const withoutIfs = (s) => s.replace(/<\/?sc-if[^>]*>/g, '');
  const body = html.slice(0, start) + withoutIfs(shop) + '</div></div></main></div></x-dc></body></html>';
  return body
    .replace(/<sc-for list="\{\{subnav\}\}"[\s\S]*?<\/sc-for>/, subnav)
    .replace(/\{\{accent\}\}/g, '#1F5D3A')
    .replace(/\{\{lenCls\}\}/g, 'on').replace(/\{\{f80Cls\}\}/g, 'on').replace(/\{\{lurCls\}\}|\{\{fa4Cls\}\}/g, '').replace(/\{\{testMsg\}\}/g, 'Not tested today').replace(/\{\{[a-zA-Z.]+\}\}/g, '');
}), 1366, 900);
console.log('references written to', out);
