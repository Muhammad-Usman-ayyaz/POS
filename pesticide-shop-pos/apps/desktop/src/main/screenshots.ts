// Development tool, not part of the app: `npm run screenshots -w @pos/desktop` runs the real app at several window
// sizes, walks through the screens, saves a PNG of each, and reports anything that overflows, is clipped, is too
// small to touch, or breaks the Content-Security-Policy. It never runs unless POS_SCREENSHOT_DIR is set.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { Db } from '@pos/db-sqlite';

interface PageReport {
  name: string;
  /** The page is wider than the window. */
  pageOverflowX: boolean;
  /** Elements that stick out past the left or right edge of the window. */
  outsideViewport: string[];
  /** Text boxes whose content is cut off (scroll width bigger than the box, not meant to scroll). */
  clipped: string[];
  /** Buttons and fields shorter than 44px. */
  smallTargets: string[];
  /** The scrolling area is taller than the window, so the user has to scroll. */
  scrolls: boolean;
  direction: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MEASURE = `(() => {
  const describe = (el) => {
    const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.id || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (label ? ' "' + label + '"' : '');
  };
  const out = { outsideViewport: [], clipped: [], smallTargets: [] };
  const w = window.innerWidth;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.closest('[class*="sr-only"]')) continue; // screen-reader-only text is meant to be 1px
    if (r.right > w + 1 || r.left < -1) out.outsideViewport.push(describe(el));
    const scrollable = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    if (!scrollable && el.scrollWidth > el.clientWidth + 1 && cs.display !== 'inline' && el.clientWidth > 0) out.clipped.push(describe(el));
    if (el.matches('button, a[href], input:not([type=checkbox]), [role=radio]') && r.height < 43.5) out.smallTargets.push(describe(el) + ' ' + Math.round(r.height) + 'px');
  }
  const scroller = document.querySelector('main') || document.documentElement;
  return {
    pageOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrolls: scroller.scrollHeight > scroller.clientHeight + 1 || document.documentElement.scrollHeight > window.innerHeight + 1,
    direction: document.getElementById('app-root')?.getAttribute('dir') ?? '?',
    ...out,
  };
})()`;

/** The demo shop (products, batches, customers) and a staff login, written straight into the throw-away database. */
async function seedForScreens(db: Db): Promise<void> {
  const [{ hash }, { addDays, systemClock, todayUtc }, { createUser, loadDeviceInfo }, { findOwnerId, seedDemoData }] = await Promise.all([
    import('@node-rs/argon2'),
    import('@pos/core'),
    import('@pos/db-sqlite'),
    import('@pos/db-sqlite/demo'),
  ]);
  const info = loadDeviceInfo(db);
  const ownerId = findOwnerId(db);
  if (!info || !ownerId) throw new Error('screenshots: the shop was not set up');
  createUser(db, info.scope, { name: 'Salesman', username: 'staff', passwordHash: await hash('shots-staff-secret-1'), role: 'staff' });
  seedDemoData(db, info.scope, ownerId, addDays(todayUtc(systemClock), 0));
}

export async function runScreenshots(window: BrowserWindow, outDir: string, size: string, db: Db): Promise<void> {
  const dir = join(outDir, size);
  mkdirSync(dir, { recursive: true });
  const js = <T>(code: string): Promise<T> => window.webContents.executeJavaScript(code, true) as Promise<T>;
  // A picture of the page through the DevTools protocol (Electron's own capturePage fails on some graphics set-ups).
  window.webContents.debugger.attach('1.3');
  const capture = async (): Promise<Buffer> => {
    // A capture occasionally never answers (the page has no frame to give); ask again rather than wait for ever.
    for (let attempt = 1; ; attempt++) {
      const answer = await Promise.race([
        window.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png' }) as Promise<{ data: string }>,
        sleep(2500).then(() => null),
      ]);
      if (answer) return Buffer.from(answer.data, 'base64');
      console.log(`screenshots ${size}: the capture did not answer (attempt ${attempt})`);
      if (attempt >= 6) throw new Error('the page never produced a picture');
      window.webContents.invalidate();
      await sleep(200);
    }
  };
  const started = Date.now();
  const problems: string[] = [];
  const reports: PageReport[] = [];

  // Anything the page complains about (a blocked script, a CSP violation, a React error) fails the run.
  window.webContents.on('console-message', (event) => {
    const message = `${event.level}: ${event.message}`;
    if (event.level === 'warning' || event.level === 'error') problems.push(message);
  });

  const waitFor = async (selector: string, timeout = 8000): Promise<void> => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      try {
        if (await js<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
      } catch {
        // the page is still loading
      }
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${selector}`);
  };
  const click = (selector: string) => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector: string, value: string) =>
    js(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const clickText = (selector: string, text: string) =>
    js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}));
      if (!el) throw new Error('no ' + ${JSON.stringify(selector)} + ' starting with ' + ${JSON.stringify(text)}); el.click(); })()`);
  const setLanguage = async (language: 'en' | 'ur') => {
    await click(`[role=radio][lang=${language}]`);
    await js(`new Promise((r) => setTimeout(r, 300))`);
  };
  const go = async (path: string) => {
    await js(`location.hash = ${JSON.stringify(`#${path}`)}`);
    await sleep(150);
  };

  const shot = async (name: string): Promise<void> => {
    console.log(`screenshots ${size}: ${name} (+${Math.round((Date.now() - started) / 1000)}s)`);
    await sleep(900); // let the fade-in animations finish
    writeFileSync(join(dir, `${name}.png`), await capture());
    const measured = await js<Omit<PageReport, 'name'>>(MEASURE);
    reports.push({ name, ...measured });
  };

  try {
    await walk();
  } catch (error) {
    // Leave evidence: what the page said, and a picture of where it got stuck.
    const body = await js<string>('document.body ? document.body.innerText.slice(0, 600) : "(no body)"').catch(() => '(page not readable)');
    await capture().then((png) => writeFileSync(join(dir, 'FAILED.png'), png)).catch(() => undefined);
    writeFileSync(join(dir, 'report.json'), JSON.stringify({ size, failure: String(error), pageText: body, problems, reports }, null, 2));
    const consoleLines = problems.length ? problems.join('\n') : '(nothing)';
    console.error(`SCREENSHOTS ${size} failed: ${String(error)}\nPage text: ${body}\nPage console:\n${consoleLines}`);
    throw error;
  }

  /** The Products screen as the signed-in user sees it: folded, every product opened, and the Low stock filter. */
  async function productsScreens(language: 'en' | 'ur', prefix: string): Promise<void> {
    await go('/pos'); // leave and come back, so every pass starts folded
    await go('/products');
    await waitFor('[data-group]');
    await shot(`${prefix}-products-${language}`);
    await clickText('button', language === 'en' ? 'Expand all' : 'سب کھولیں');
    await waitFor('[data-size]');
    await shot(`${Number(prefix) + 1}-products-expanded-${language}`);
    await clickText('button[aria-pressed]', language === 'en' ? 'Low stock' : 'کم اسٹاک');
    await js(`new Promise((r) => setTimeout(r, 400))`);
    await shot(`${Number(prefix) + 2}-products-low-${language}`);
  }

  /** The product form as the owner sees it: a product with locked sizes, the lock message, a new size row, and an empty Add product. */
  async function formScreens(language: 'en' | 'ur', prefix: number): Promise<void> {
    await go('/pos');
    await go('/products');
    await waitFor('[data-group]');
    // The first product that has an Edit button for the multi-size product (its name starts with the demo's product)
    await js(`(() => { const links = [...document.querySelectorAll('a[href*="/edit"]')]; const link = links.find((a) => /Insecticide X|ایکس/.test(a.getAttribute('aria-label') || '')) || links[0]; link.click(); })()`);
    await waitFor('[data-page=product-form] [data-size-key]');
    await sleep(300);
    await shot(`${prefix}-edit-product-${language}`);
    await js(`document.querySelector('[data-size-key] button[id$="-pack"]').click()`);
    await waitFor('[role=dialog]');
    await shot(`${prefix + 1}-lock-message-${language}`);
    await js(`[...document.querySelectorAll('[role=dialog] button')].at(-1).click()`);
    await sleep(300);
    await js(`document.querySelector('[data-page=product-form]').closest('main').scrollTo(0, 1e6)`);
    await shot(`${prefix + 2}-new-size-${language}`);
    await go('/products/new');
    await waitFor('#name-en');
    await js(`document.querySelector('button[type=submit]').click()`); // empty: every problem is shown next to its field
    await sleep(300);
    await shot(`${prefix + 4}-add-product-errors-${language}`);
    await fill('#name-en', 'Sample sprayer');
    await fill('[data-size-key] input[name=packSize]', '1000');
    await fill('[data-size-key] input[name=retail]', '118');
    await fill('[data-size-key] input[name=wholesale]', '110');
    await fill('[data-size-key] input[name=tax]', '18');
    await fill('[data-size-key] input[name=minPacks]', '5');
    await shot(`${prefix + 3}-add-product-${language}`);
  }

  async function walk(): Promise<void> {
  // ---------- first launch ----------
  await waitFor('#shopName');
  await shot('01-setup-en');
  await click('button[type=submit]'); // empty form: the required-field messages
  await shot('02-setup-errors-en');
  await fill('#shopName', 'Pesticide Club Shop');
  await fill('#ownerName', 'Owner');
  await fill('#username', 'owner');
  await fill('#password', 'shots-owner-secret-1');
  await fill('#confirm', 'shots-owner-secret-1');
  await click('button[type=submit]');
  await waitFor('[data-testid=recovery-code]');
  await shot('03-recovery-en');
  await setLanguage('ur');
  await shot('04-recovery-ur');
  await setLanguage('en');
  await click('input[type=checkbox]');
  await js(`new Promise((r) => setTimeout(r, 150))`);
  await click('[data-testid=recovery-continue]:not([disabled])');
  await waitFor('nav');
  await seedForScreens(db);

  // ---------- the signed-in app, English ----------
  for (const [index, page] of ['pos', 'customers'].entries()) {
    await go(`/${page}`);
    await shot(`1${index * 2}-${page}-en`);
  }
  await productsScreens('en', '11');
  await formScreens('en', 50);

  // ---------- Urdu: right to left ----------
  await setLanguage('ur');
  for (const [index, page] of ['pos', 'customers'].entries()) {
    await go(`/${page}`);
    await shot(`2${index * 2}-${page}-ur`);
  }
  await productsScreens('ur', '21');
  await formScreens('ur', 60);
  await setLanguage('en');

  // ---------- the same screen for staff: no cost, no Receive stock, no Add, no Edit ----------
  await click('button[title="Sign out"]');
  await waitFor('#username');
  await fill('#username', 'staff');
  await fill('#password', 'shots-staff-secret-1');
  await click('button[type=submit]');
  await waitFor('nav');
  await productsScreens('en', '40');
  await go('/products/new'); // staff cannot open it: they are sent back to the list
  await waitFor('[data-group]');
  await shot('48-staff-new-product-redirect-en');
  await setLanguage('ur');
  await productsScreens('ur', '45');
  await setLanguage('en');

  // ---------- sign in ----------
  await click('button[title="Sign out"]');
  await waitFor('#username');
  await shot('30-login-en');
  await fill('#username', 'owner');
  await fill('#password', 'wrong-password');
  await click('button[type=submit]');
  await waitFor('[role=alert][data-code]');
  await shot('31-login-error-en');
  await setLanguage('ur');
  await shot('32-login-error-ur');
  await fill('#username', 'owner');
  await fill('#password', 'shots-owner-secret-1');
  await click('button[type=submit]');
  await waitFor('nav');
  await click('button[title="لاگ آؤٹ"]');
  await waitFor('#username');
  await shot('33-login-ur');
  await click('button.text-accent');
  await waitFor('#code');
  await shot('34-reset-ur');
  await setLanguage('en');
  await shot('35-reset-en');
  }

  writeFileSync(join(dir, 'report.json'), JSON.stringify({ size, problems, reports }, null, 2));
  if (problems.length) {
    console.error(`SCREENSHOTS ${size}: the page logged ${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`SCREENSHOTS ${size}: ${reports.length} screens saved to ${dir}, the page logged no warnings or errors`);
  }
}
