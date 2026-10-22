// Development tool, not part of the app: `npm run screenshots -w @pos/desktop` runs the real app at several window
// sizes, walks through the screens, saves a PNG of each, and reports anything that overflows, is clipped, is too
// small to touch, or breaks the Content-Security-Policy. It never runs unless POS_SCREENSHOT_DIR is set.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import type { Db } from '@pos/db-sqlite';
import type { PrintDriver } from './printing/driver.js';
import type { Handlers } from './runtime.js';

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

/** The few button texts the walk presses (the main process cannot import the screens' text files: they are for the browser). Keep in step with i18n/messages. */
const TEXT = {
  en: { hold: 'Hold bill', complete: 'Complete sale', newSale: 'New sale', askOwner: 'Ask owner', newCustomer: 'New customer' },
  ur: { hold: 'بل روکیں', complete: 'بل مکمل کریں', newSale: 'نیا بل', askOwner: 'مالک سے پوچھیں', newCustomer: 'نیا گاہک' },
} as const;

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

/**
 * The printing the screenshots use: two pretend printers, "printing" that succeeds without paper, and no PDF file opened on the desk.
 * The real driver still makes real PDFs for `toPdf`.
 */
export function screenshotPrinting(real: PrintDriver): PrintDriver {
  return {
    ...real,
    listPrinters: async () => [
      { name: 'POS-80', display_name: 'POS-80 receipt printer', is_default: false },
      { name: 'Office-Laser', display_name: 'Office laser A4', is_default: true },
    ],
    print: async () => undefined,
    savePdf: async (fileName) => `C:/Users/Shop/Documents/Pesticide Club POS/Receipts/${fileName}`,
  };
}

/** The Phase 6 customers made by the seed (key -> customer id), filled in by seedForScreens. */
const seeded: Record<string, string> = {};
/** What the fake Save box answers: a file name in the screenshots folder (the CSV is really written there), or null (the person pressed Cancel). */
const saveAnswer: { mode: 'save' | 'cancel'; folder: string } = { mode: 'save', folder: '' };

/**
 * The demo shop (products, batches, customers), a staff login, the print settings, and a few real invoices made through the real handlers
 * (the owner is signed in by then): a walk-in cash sale, a Khata sale to Rashid (printed twice, so its second print says COPY), and two more.
 */
async function seedForScreens(db: Db, handlers: Handlers): Promise<void> {
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
  const demo = seedDemoData(db, info.scope, ownerId, addDays(todayUtc(systemClock), 0));
  const p = (key: string): string => demo.products[key] ?? '';

  await handlers['print:setConfig']({ printer_name: 'POS-80', shop_name_ur: 'پیسٹی سائیڈ کلب شاپ', shop_address: 'Main Bazaar, Chak 12', shop_phone: '0300 1234567' });
  const walkIn = await handlers['sale:create']({
    paid_amount: 54_000 + 35_000,
    lines: [
      { product_id: p('insecticide500'), qty: 1000 },
      { product_id: p('fungicide250'), qty: 250 },
    ],
  });
  const khata = await handlers['sale:create']({
    customer_id: demo.customers['rashid'] ?? '',
    paid_amount: 100_000,
    due_date: addDays(todayUtc(systemClock), 30),
    lines: [
      { product_id: p('insecticide1l'), qty: 2000 },
      { product_id: p('fertilizer1kg'), qty: 250 },
      { product_id: p('fungicide250'), qty: 750, line_discount: 5000 },
    ],
  });
  await handlers['sale:create']({
    customer_id: demo.customers['sajid'] ?? '',
    paid_amount: 20_000,
    due_date: addDays(todayUtc(systemClock), 14),
    lines: [{ product_id: p('weedicide1l'), qty: 1000 }],
  });
  await handlers['sale:create']({ paid_amount: 240_000, lines: [{ product_id: p('vegseed1kg'), qty: 1000 }] });
  await handlers['print:document']({ invoice_id: khata.invoice.id, kind: 'receipt' });
  await handlers['print:document']({ invoice_id: khata.invoice.id, kind: 'receipt' }); // the second print of the same document: it says COPY
  await handlers['print:document']({ invoice_id: walkIn.invoice.id, kind: 'invoice' });
  await seedPhase6(db, handlers, p, addDays(todayUtc(systemClock), 0));
}

/**
 * Phase 6 customers, all made through the real handlers (the owner is signed in): one who owes with an invoice past its due date, one in advance,
 * one with no limit, one over the limit, two with the same name, one with an opening balance, one with an Urdu-only name.
 * The only direct database write is the due date of one invoice, moved into the past: the sale handler refuses a past due date (rightly), and the
 * clock cannot be moved from here.
 */
async function seedPhase6(db: Db, handlers: Handlers, p: (key: string) => string, today: string): Promise<void> {
  const { addDays } = await import('@pos/core');
  const make = async (key: string, fields: Record<string, unknown>, confirmDuplicate = false): Promise<string> => {
    const made = await handlers['customers:create']({ fields, confirm_duplicate: confirmDuplicate } as never);
    seeded[key] = made.customer.id;
    return made.customer.id;
  };
  const zahid = await make('zahid', { name_en: 'Zahid Mehmood', name_ur: 'زاہد محمود', phone: '0300 5551234', village: 'Chak 9', credit_limit: 2_000_000 });
  const sale = await handlers['sale:create']({
    customer_id: zahid,
    paid_amount: 0,
    due_date: addDays(today, 5),
    lines: [
      { product_id: p('insecticide1l'), qty: 2000 },
      { product_id: p('fertilizer1kg'), qty: 250 },
    ],
  });
  db.prepare('UPDATE invoices SET due_date = ? WHERE id = ?').run(addDays(today, -20), sale.invoice.id);

  const naseem = await make('naseem', { name_en: 'Naseem Bibi', name_ur: 'نسیم بی بی', phone: '0312 7771122', village: 'Chak 3', credit_limit: 500_000 });
  await handlers['payments:receive']({ customer_id: naseem, amount: 300_000, method: 'cash', confirm_advance: true });

  const akram = await make('akram', { name_en: 'Akram Ali', name_ur: 'اکرم علی', phone: '0333 4445566', village: 'Chak 45', credit_limit: 0 });
  await handlers['sale:create']({ customer_id: akram, paid_amount: 0, due_date: addDays(today, 10), lines: [{ product_id: p('fertilizer1kg'), qty: 500 }] });

  const bilal = await make('bilal', { name_en: 'Bilal Hussain', name_ur: 'بلال حسین', phone: '0345 9990011', village: 'Chak 7', credit_limit: 50_000 });
  await handlers['khata:setOpeningBalance']({ customer_id: bilal, amount: 80_000 });

  await make('ahmad1', { name_en: 'Ahmad Khan', name_ur: 'احمد خان', phone: '0300 1112233', village: 'Chak 3', credit_limit: 500_000 });
  await make('ahmad2', { name_en: 'Ahmad Khan', name_ur: 'احمد خان', phone: '0301 2223344', village: 'Chak 8', credit_limit: 500_000 }, true);

  const farooq = await make('farooq', { name_en: 'Farooq Opening', name_ur: 'فاروق', phone: '0322 1010101', village: 'Chak 12', credit_limit: 1_000_000 });
  await handlers['khata:setOpeningBalance']({ customer_id: farooq, amount: 650_000 });

  const aslam = await make('aslam', { name_ur: 'محمد اسلم', phone: '0334 8887766', village: 'چک 5', credit_limit: 1_000_000 });
  await handlers['sale:create']({ customer_id: aslam, paid_amount: 0, due_date: addDays(today, 10), lines: [{ product_id: p('fertilizer1kg'), qty: 500 }] });
}

export async function runScreenshots(window: BrowserWindow, outDir: string, size: string, db: Db, handlers: Handlers): Promise<void> {
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
  /** Layout and wording problems found on the Phase 6 screens (numbers 110 and up). They fail the run just like a console warning. */
  const layoutProblems: string[] = [];
  const reports: PageReport[] = [];
  saveAnswer.folder = join(outDir, 'csv-exports', size);
  mkdirSync(saveAnswer.folder, { recursive: true });
  // The system Save box would wait for a person: answer it here, the same way the pretend printers answer.
  (dialog as { showSaveDialog: unknown }).showSaveDialog = async (options: { defaultPath?: string }) => {
    if (saveAnswer.mode === 'cancel') return { canceled: true, filePath: '' };
    const file = (options.defaultPath ?? 'statement.csv').split(/[\\/]/).pop() ?? 'statement.csv';
    return { canceled: false, filePath: join(saveAnswer.folder, file) };
  };

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
    if (Number.parseInt(name, 10) >= 110) await judgePhase6(name, measured);
  };

  /** Phase 6 screens must not overflow, clip text, have a target under 44px, or show a broken amount ("Owes Rs -5", NaN, undefined). */
  const judgePhase6 = async (name: string, m: Omit<PageReport, 'name'>): Promise<void> => {
    const found: string[] = [];
    if (m.pageOverflowX) found.push('the page is wider than the window');
    if (m.outsideViewport.length) found.push(`outside the window: ${m.outsideViewport.slice(0, 4).join(' | ')}`);
    if (m.clipped.length) found.push(`clipped text: ${m.clipped.slice(0, 4).join(' | ')}`);
    if (m.smallTargets.length) found.push(`targets under 44px: ${m.smallTargets.slice(0, 4).join(' | ')}`);
    const text = await js<string>('document.body.innerText');
    const bad = /Owes\s+Rs\s*-|بقایا\s+Rs\s*-|NaN|undefined|\[object|Rs\s*-\d/.exec(text);
    if (bad) found.push(`broken text "${bad[0]}"`);
    if (name.endsWith('-ur')) {
      // Latin words on an Urdu screen (customer names typed in English are expected; everything else is a candidate for untranslated text)
      const latin = await js<string[]>(`(() => { const out = new Set(); const w = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) { const t = w.currentNode.textContent.trim(); if (/[A-Za-z]{3,}/.test(t) && !/[؀-ۿ]/.test(t)) out.add(t.slice(0, 40)); } return [...out].slice(0, 12); })()`);
      if (latin.length) console.log(`screenshots ${size}: ${name} Latin-only text on an Urdu screen: ${latin.join(' | ')}`);
      (reports[reports.length - 1] as PageReport & { latin?: string[] }).latin = latin;
    }
    for (const f of found) layoutProblems.push(`${name}: ${f}`);
  };

  try {
    await walk();
  } catch (error) {
    // Leave evidence: what the page said, and a picture of where it got stuck.
    const body = await js<string>('document.body ? document.body.innerText.slice(0, 600) : "(no body)"').catch(() => '(page not readable)');
    await capture().then((png) => writeFileSync(join(dir, 'FAILED.png'), png)).catch(() => undefined);
    writeFileSync(join(dir, 'report.json'), JSON.stringify({ size, failure: String(error), pageText: body, problems, layoutProblems, reports }, null, 2));
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
    await fill('[data-size-key] input[name=packSize]', '1');
    await fill('[data-size-key] input[name=retail]', '118');
    await fill('[data-size-key] input[name=wholesale]', '110');
    await fill('[data-size-key] input[name=tax]', '18');
    await fill('[data-size-key] input[name=minPacks]', '5');
    await shot(`${prefix + 3}-add-product-${language}`);
  }

  /** Type into a field of the n-th receipt line (inputs are found by name, the same in both languages). */
  function fillLine(n: number, name: string, value: string): Promise<unknown> {
    return js(`(() => { const el = document.querySelectorAll('[data-line]')[${n - 1}].querySelector('[name=${name}]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); })()`);
  }

  /** Receive stock: the empty form, the search, two lines, an expiry clash, a cost clash, a new batch number, and the old-date question. */
  async function receiveScreens(language: 'en' | 'ur', prefix: number): Promise<void> {
    const t = language === 'en'
      ? { addLine: '+ Add a line', receive: 'Receive stock', newBatch: 'Save as new', changeDate: 'Change the date' }
      : { addLine: '+ لائن شامل کریں', receive: 'اسٹاک وصول کریں', newBatch: 'نئے بیچ', changeDate: 'تاریخ بدلیں' };
    const addSize = async (label: string): Promise<void> => {
      await clickText('button', t.addLine);
      await waitFor('input[type=search]');
      await fill('input[type=search]', 'Insecticide');
      await js(`new Promise((r) => setTimeout(r, 700))`);
      await js(`[...document.querySelectorAll('ul button')].find((b) => b.textContent.replace(/[⁦-⁩]/g, '').trim().endsWith(${JSON.stringify(language === 'ur' ? label.replace('L', 'لیٹر') : label)})).click()`);
      await sleep(250);
    };
    await go('/pos');
    await go('/purchases');
    await waitFor('[data-page=purchases]');
    await shot(`${prefix}-purchases-${language}`);
    await go('/purchases/receive');
    await waitFor('#supplier');
    await sleep(300);
    await shot(`${prefix + 1}-receive-empty-${language}`);
    await js(`(() => { const s = document.querySelector('#supplier'); s.value = [...s.options].find((o) => o.value).value; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await clickText('button', t.addLine);
    await waitFor('input[type=search]');
    await fill('input[type=search]', 'Insecticide');
    await js(`new Promise((r) => setTimeout(r, 700))`);
    await shot(`${prefix + 2}-receive-search-${language}`);
    await js(`[...document.querySelectorAll('ul button')].find((b) => b.textContent.replace(/[⁦-⁩]/g, '').trim().endsWith(${JSON.stringify(language === 'ur' ? '1 لیٹر' : '1 L')})).click()`);
    await sleep(250);
    await fillLine(1, 'batchNo', 'B-020');
    await fillLine(1, 'expiry', '2027-05-01');
    await fillLine(1, 'packs', '12');
    await fillLine(1, 'cost', '400');
    await addSize('0.5 L');
    await fillLine(2, 'batchNo', 'B-021');
    await fillLine(2, 'expiry', '2027-06-30');
    await fillLine(2, 'packs', '20');
    await fillLine(2, 'cost', '215');
    await sleep(300);
    await shot(`${prefix + 3}-receive-lines-${language}`);
    // The demo's 0.5 L batch (INS-001, Rs 215, expires 18 Jan 2027): a different expiry with the same cost, then a different cost.
    await fillLine(2, 'batchNo', 'INS-001');
    await sleep(300);
    await shot(`${prefix + 4}-receive-clash-expiry-${language}`);
    await fillLine(2, 'cost', '230');
    await sleep(300);
    await shot(`${prefix + 5}-receive-clash-cost-${language}`);
    await clickText('[role=group] button', t.newBatch);
    await sleep(300);
    await shot(`${prefix + 6}-receive-new-batch-${language}`);
    await js(`(() => { const el = document.querySelector('#date-received'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10)); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(200);
    await clickText('button[type=submit]', t.receive); // the shell asks: dated 45 days ago, save anyway?
    await waitFor('[role=dialog]');
    await shot(`${prefix + 7}-receive-old-date-${language}`);
    await clickText('[role=dialog] button', t.changeDate);
    await sleep(200);
  }

  function key(name: string): Promise<unknown> {
    return js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(name)}, bubbles: true }))`);
  }
  function escape(): Promise<unknown> {
    return js(`(document.querySelector('[role=dialog]') || document).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  }
  function pause(ms: number): Promise<unknown> {
    return js(`new Promise((r) => setTimeout(r, ${ms}))`);
  }

  /** On the POS screen: search, wait for the answer, press the size whose label starts with `label` ("" is the first one that can be sold). */
  async function addToBill(query: string, label = ''): Promise<void> {
    const before = await js<number>(`document.querySelectorAll('[data-line]').length`);
    await fill('input[type=search]', query);
    await waitFor('[data-size]');
    await pause(700);
    await js(`(() => { const b = [...document.querySelectorAll('[data-size]:not([disabled])')].find((x) => x.querySelector('span').textContent.replace(/[⁦-⁩]/g, '').trim().startsWith(document.documentElement.lang === 'ur' ? ${JSON.stringify(label)}.replace(' L', ' لیٹر').replace(' kg', ' کلو') : ${JSON.stringify(label)}));
      if (!b) throw new Error('no size ' + ${JSON.stringify(label)} + ' for ' + ${JSON.stringify(query)}); b.click(); })()`);
    await js(`new Promise((resolve, reject) => { const t0 = Date.now(); const tick = () => document.querySelectorAll('[data-line]').length > ${before} ? resolve(true) : Date.now() - t0 > 4000 ? reject(new Error('the line was not added')) : setTimeout(tick, 50); tick(); })`);
  }

  /**
   * The POS search box, with text typed in: the magnifier, the typed text (the input) and the F2 badge are three different places in a row.
   * Measured in the real layout, in English and in Urdu (where the row runs right to left): no two boxes overlap, and each one is the
   * topmost thing at its own centre (nothing is drawn on top of it).
   */
  async function checkSearchBox(language: 'en' | 'ur'): Promise<void> {
    await fill('input[type=search]', language === 'en' ? 'Insecticide spray 1 L' : 'کیڑے مار دوا');
    await pause(300);
    const found = await js<{ missing?: string; overlaps: string[]; direction: string; order: string[] }>(`(() => {
      const input = document.querySelector('input[type=search]');
      const field = input && input.parentElement;
      const icon = field && field.querySelector('svg');
      const badge = field && [...field.querySelectorAll('kbd')].find((k) => k.textContent.trim() === 'F2');
      if (!input || !icon || !badge) return { missing: 'search input, icon or F2 badge', overlaps: [], direction: '?', order: [] };
      const parts = { icon, input, badge };
      const rects = Object.fromEntries(Object.entries(parts).map(([k, el]) => [k, el.getBoundingClientRect()]));
      const overlaps = [];
      const names = Object.keys(parts);
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const a = rects[names[i]], b = rects[names[j]];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(names[i] + ' overlaps ' + names[j]);
      }
      for (const [k, el] of Object.entries(parts)) {
        const r = rects[k];
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!top || (top !== el && !el.contains(top) && !(k === 'icon' && top === field))) // the magnifier ignores the pointer, so the box itself is what is found there
          overlaps.push(k + ' is covered by ' + (top ? top.tagName.toLowerCase() : 'nothing'));
      }
      const fr = field.getBoundingClientRect();
      for (const [k, r] of Object.entries(rects)) if (r.left < fr.left - 0.5 || r.right > fr.right + 0.5) overlaps.push(k + ' sticks out of the search box');
      const order = names.sort((x, y) => rects[x].left - rects[y].left);
      return { overlaps, direction: getComputedStyle(field).direction, order };
    })()`);
    const wantDirection = language === 'en' ? 'ltr' : 'rtl';
    const wantOrder = language === 'en' ? 'icon,input,badge' : 'badge,input,icon'; // left to right on the screen
    if (found.missing) problems.push(`search box ${language}: ${found.missing} not found`);
    else {
      if (found.overlaps.length) problems.push(`search box ${language}: ${found.overlaps.join('; ')}`);
      if (found.direction !== wantDirection) problems.push(`search box ${language}: direction is ${found.direction}, expected ${wantDirection}`);
      if (found.order.join(',') !== wantOrder) problems.push(`search box ${language}: left to right the parts are ${found.order.join(',')}, expected ${wantOrder}`);
    }
    console.log(`screenshots ${size}: search box ${language}: ${found.missing ?? (found.overlaps.length ? found.overlaps.join('; ') : 'icon, text and F2 badge do not overlap')}`);
  }

  /** F4: the customer picker, the named customer selected, "Use ..." pressed. `pictureName` (if given) is saved while the picker is open. */
  async function chooseCustomer(search: string, shownName: string, pictureName?: string): Promise<void> {
    await key('F4');
    await waitFor('[role=dialog] input[type=search]');
    await fill('[role=dialog] input[type=search]', search);
    await pause(500);
    await clickText('[role=option]', shownName);
    await sleep(200);
    if (pictureName) await shot(pictureName);
    await js(`document.querySelector('[role=dialog] button.bg-accent').click()`);
    await sleep(300);
  }

  /** The POS screen, populated: a held bill, a bill of three lines for Rashid on Khata, the customer picker, the line editor, held bills, the sale-saved box. */
  async function posScreens(language: 'en' | 'ur', prefix: number, firstPass: boolean): Promise<void> {
    const t = TEXT[language];
    const rashid = language === 'en' ? 'Rashid' : 'راشد';
    await go('/invoices');
    await go('/pos');
    await waitFor('input[type=search]');
    if (firstPass) {
      // a bill set aside, so the "Held bills" box has something in it
      await addToBill('Vegetable');
      await clickText('button', t.hold);
      await sleep(400);
    }
    await addToBill('Insecticide', '1 L');
    await addToBill('Fungicide');
    await addToBill('Fertilizer', '1 kg'); // a loose size: the line shows kg
    await addToBill('Weedicide');
    await checkSearchBox(language);
    await chooseCustomer('Rashid', rashid, `${prefix + 1}-pos-customer-picker-${language}`);
    await fill('input[name=paid]', '1000');
    await fill('input[type=search]', '');
    await sleep(400);
    await shot(`${prefix}-pos-cart-${language}`);
    await js(`document.querySelector('[data-line] button[title]').click()`);
    await waitFor('[role=dialog]');
    await sleep(400);
    await shot(`${prefix + 2}-pos-line-editor-${language}`);
    await escape();
    await sleep(300);
    await key('F6');
    await waitFor('[data-held]');
    await shot(`${prefix + 3}-pos-held-${language}`);
    await escape();
    await sleep(300);
    if (firstPass) {
      await clickText('button', t.complete);
      await waitFor('[data-done-total]');
      await shot(`${prefix + 4}-pos-sale-saved-${language}`);
      await clickText('[role=dialog] button', t.newSale);
      await sleep(300);
    }
  }

  /** The staff cashier puts a big bill on Imran's Khata: the over-limit box, and the owner-approval box that "Ask owner" opens. */
  async function staffLimitScreens(prefix: number): Promise<void> {
    const t = TEXT.en;
    await go('/invoices');
    await go('/pos');
    await waitFor('input[type=search]');
    await addToBill('DAP');
    await chooseCustomer('Imran', 'Imran');
    await fill('input[name=paid]', '0');
    await fill('input[type=search]', '');
    await sleep(500);
    await clickText('button', t.complete);
    await waitFor('[data-over-by]');
    await shot(`${prefix}-staff-over-limit-en`);
    await clickText('[role=dialog] button', t.askOwner);
    await waitFor('[role=dialog] input');
    await sleep(300);
    await shot(`${prefix + 1}-staff-approval-en`);
    await escape();
    await sleep(300);
  }

  /** Invoices: the list is already populated; this adds the detail box of Rashid's invoice. */
  async function invoiceDetailScreen(language: 'en' | 'ur', prefix: number): Promise<void> {
    await go('/pos');
    await go('/invoices');
    await waitFor('[data-invoice-row]');
    // Rashid's Khata sale (printed twice), not the newest walk-in sale
    await js(`[...document.querySelectorAll('[data-invoice-row]')].find((r) => /Rashid|راشد/.test(r.textContent)).querySelector('button').click()`);
    await waitFor('[data-invoice-detail]');
    await sleep(500);
    await shot(`${prefix}-invoice-detail-${language}`);
    await escape();
    await sleep(300);
  }

  /** Settings as the owner (a form with saved values) or staff (the calm message). */
  async function settingsScreen(language: 'en' | 'ur', prefix: number, name: string): Promise<void> {
    await go('/pos');
    await go('/settings');
    await waitFor('[data-page=settings]');
    if (name !== 'staff') await waitFor('#printer');
    await sleep(500);
    await shot(`${prefix}-settings-${name}-${language}`);
  }

  // ---------- Phase 6: customers, payments, opening balance, statement ----------

  /** Numbers for the Phase 6 picture names: counts up from `first` and refuses to go past `last`, so the two ranges never collide. */
  function counter(first: number, last: number): (slug: string, language: string) => string {
    let n = first;
    return (slug, language) => {
      if (n > last) throw new Error(`Phase 6 screens: the number range ${first}-${last} is full at ${slug}`);
      return `${n++}-${slug}-${language}`;
    };
  }
  function clickNth(selector: string, index: number): Promise<unknown> {
    return js(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) throw new Error('no ' + ${JSON.stringify(selector)} + ' number ' + ${index}); el.click(); })()`);
  }
  function submitDialog(): Promise<unknown> {
    return js(`document.querySelector('[role=dialog] button[type=submit]').click()`);
  }
  async function closeDialog(): Promise<void> {
    await escape();
    await sleep(300);
  }
  function setDefaultLimit(paisa: number): Promise<unknown> {
    return handlers['customers:setSettings']({ default_credit_limit: paisa });
  }
  async function listPage(): Promise<void> {
    await go('/pos');
    await go('/customers');
    await waitFor('[data-customer-row]');
    await sleep(400);
  }
  async function customerPage(customer: string): Promise<void> {
    await go('/customers');
    await go(`/customers/${seeded[customer]}`);
    await waitFor('[data-page=customer-detail] [data-balance]');
    await sleep(500);
  }
  async function newForm(): Promise<void> {
    await go('/customers');
    await go('/customers/new');
    await waitFor('#name-en');
    await sleep(300);
  }
  async function statementPage(customer: string): Promise<void> {
    await go('/customers');
    await go(`/customers/${seeded[customer]}/statement`);
    await waitFor('[data-statement-table], [data-empty]');
    await sleep(500);
  }
  function submitForm(): Promise<unknown> {
    return js(`document.querySelector('form[data-page=customer-form] button[type=submit]').click()`);
  }

  /** The form's errors, then the duplicate-warning box (a second "Ahmad Khan"). Works for the owner and for staff. */
  async function formErrorsAndDuplicate(name: (slug: string, language: string) => string, language: 'en' | 'ur', owner: boolean): Promise<void> {
    await shot(name('customer-new-form', language));
    if (owner) await fill('#credit-limit', 'abc');
    await submitForm();
    await sleep(400);
    await shot(name('customer-new-errors', language));
    await fill('#name-en', 'Ahmad Khan');
    await fill('#name-ur', 'احمد خان');
    if (owner) await fill('#credit-limit', '5000');
    await sleep(300);
    await submitForm();
    await waitFor('[data-duplicate-row]');
    await sleep(400);
    await shot(name('customer-duplicate-dialog', language));
    await closeDialog();
  }

  /** The POS customer picker: the two "Ahmad Khan" rows, then the New customer form with its credit-limit line. */
  async function posPickerScreens(name: (slug: string, language: string) => string, language: 'en' | 'ur', owner: boolean): Promise<void> {
    await go('/invoices');
    await go('/pos');
    await waitFor('input[type=search]');
    await key('F4');
    await waitFor('[role=dialog] input[type=search]');
    await fill('[role=dialog] input[type=search]', 'Ahmad');
    await pause(700);
    await shot(name('pos-picker-duplicates', language));
    await clickText('[role=dialog] button', TEXT[language].newCustomer);
    await waitFor('#quick-name');
    await sleep(300);
    await shot(name('pos-quick-add-limit', language));
    if (owner) {
      await setDefaultLimit(0);
      await closeDialog();
      await key('F4');
      await waitFor('[role=dialog] input[type=search]');
      await clickText('[role=dialog] button', TEXT[language].newCustomer);
      await waitFor('#quick-name');
      await sleep(300);
      await shot(name('pos-quick-add-no-limit', language));
    }
    if (owner) {
      await submitDialog(); // nothing typed: the name problem is shown (not kept as a picture)
      await sleep(300);
    }
    await closeDialog();
    if (owner) await setDefaultLimit(1_000_000);
  }

  /** Everything the owner sees for customers, in one language. About 30 pictures numbered first..last. */
  async function ownerCustomerScreens(language: 'en' | 'ur', first: number, last: number): Promise<void> {
    const name = counter(first, last);
    await setDefaultLimit(1_000_000);
    await handlers['customers:setSettings']({ show_farmer_fields: false });

    // 1) the list
    await listPage();
    await shot(name('customers-list', language));
    await clickNth('[role=group] button[aria-pressed]', 2); // Overdue
    await pause(700);
    await shot(name('customers-list-overdue', language));
    await clickNth('[role=group] button[aria-pressed]', 3); // Advance
    await pause(700);
    await clickNth('[role=group] button[aria-pressed]', 0);
    await fill('input[type=search]', 'Ahmad');
    await pause(900);
    await shot(name('customers-list-search', language));
    await fill('input[type=search]', 'zzqq');
    await pause(900);
    await shot(name('customers-list-no-match', language));

    // 2 and 3) the new customer form, errors, duplicate warning
    await newForm();
    await formErrorsAndDuplicate(name, language, true);

    // 4) the edit form, the farmer block off, then on (collapsed, expanded)
    await go('/customers');
    await go(`/customers/${seeded['zahid']}/edit`);
    await waitFor('#name-en');
    await sleep(400);
    await handlers['customers:setSettings']({ show_farmer_fields: true });
    await go('/customers');
    await go(`/customers/${seeded['zahid']}/edit`);
    await waitFor('button[aria-controls=farmer-fields]');
    await sleep(400);
    await shot(name('customer-edit-farmer-collapsed', language));
    await click('button[aria-controls=farmer-fields]');
    await waitFor('#father-name');
    await fill('#father-name', 'Mehmood Ahmad');
    await fill('#cnic', '35202-1234567-1');
    await sleep(300);
    await shot(name('customer-edit-farmer-expanded', language));

    // 5) the customer page
    await customerPage('zahid');
    await shot(name('customer-owes-overdue', language));
    await customerPage('naseem');
    await shot(name('customer-advance', language));
    await customerPage('akram');
    await shot(name('customer-no-limit', language));
    await customerPage('bilal');
    await shot(name('customer-over-limit', language));
    await customerPage('aslam');
    await shot(name('customer-urdu-name', language));

    // 6) Receive payment
    await customerPage('zahid');
    await click('[data-action=receive-payment]');
    await waitFor('[data-payment-form]');
    await fill('#pay-amount', '500');
    await sleep(300);
    await shot(name('payment-cash', language));
    await clickNth('[role=dialog] [role=radio]', 1); // Bank
    await waitFor('#pay-reference');
    await submitDialog(); // no reference yet
    await waitFor('#pay-reference-error');
    await sleep(300);
    await shot(name('payment-bank-reference-missing', language));
    await clickNth('[role=dialog] [role=radio]', 0);
    await fill('#pay-amount', '500000'); // far more than he owes
    await waitFor('[data-advance-confirm]');
    await sleep(300);
    await shot(name('payment-advance-confirm', language));
    await fill('#pay-amount', '500');
    await sleep(300);
    await submitDialog();
    await waitFor('[data-payment-saved]');
    await sleep(400);
    await shot(name('payment-saved', language));
    await click('[data-receipt-print=printer]');
    await sleep(900);
    await shot(name('payment-saved-receipt-printed', language));
    await closeDialog();

    // 7) Opening balance
    await customerPage('akram');
    await click('[data-action=opening-balance]');
    await waitFor('[data-opening-form]');
    await fill('#open-amount', '6500');
    await sleep(300);
    await shot(name('opening-form', language));
    await submitDialog();
    await waitFor('[data-opening-confirm]');
    await sleep(300);
    await shot(name('opening-confirm', language));
    await closeDialog();
    await customerPage('farooq');
    await click('[data-action=opening-balance]');
    await waitFor('[data-opening-form]');
    await fill('#open-amount', '5000');
    await submitDialog();
    await waitFor('[data-opening-confirm]');
    await js(`[...document.querySelectorAll('[role=dialog] button')].at(-1).click()`);
    await sleep(900);
    await shot(name('opening-already-set', language));
    await closeDialog();

    // 8) the statement
    await statementPage('zahid');
    await shot(name('statement-all', language));
    await click('[data-quick="30"]');
    await sleep(700);
    await shot(name('statement-last-30', language));
    await fill('input[name=from]', '2020-01-01');
    await fill('input[name=to]', '2020-12-31');
    await sleep(900);
    await shot(name('statement-range-empty', language));
    await fill('input[name=from]', '2026-12-31');
    await fill('input[name=to]', '2026-01-01');
    await sleep(600);
    await click('[data-quick=all]');
    await sleep(700);
    await click('[data-statement-print="80"]');
    await sleep(900);
    saveAnswer.mode = 'save';
    await click('[data-statement-export]');
    await waitFor('[data-csv-outcome]');
    await sleep(400);
    await shot(name('statement-print-and-csv-saved', language));
    saveAnswer.mode = 'cancel';
    await click('[data-statement-export]');
    await waitFor('[data-csv-outcome=cancelled]');
    await sleep(400);
    await shot(name('statement-csv-cancelled', language));
    saveAnswer.mode = 'save';
    await click('[data-statement-print=pdf]');
    await sleep(900);
    await statementPage('farooq');
    await shot(name('statement-opening-balance', language));
    await statementPage('naseem');
    await shot(name('statement-advance', language));
    // the customer page's own statement buttons
    await customerPage('zahid');
    await click('[data-statement-print="a4"]');
    await sleep(900);
    await shot(name('customer-statement-buttons', language));

    // 9) Settings > Customers
    await go('/pos');
    await go('/settings');
    await waitFor('#printer');
    await clickNth('nav button', 0);
    await waitFor('[data-section=customers]');
    await sleep(500);
    await shot(name('settings-customers', language));

    // 10) the POS picker
    await posPickerScreens(name, language, true);
  }

  /** The same screens for the staff cashier (no terms, no Opening balance, no farmer block), a shorter set. */
  async function staffCustomerScreens(language: 'en' | 'ur', first: number, last: number): Promise<void> {
    const name = counter(first, last);
    const full = language === 'en';
    await listPage();
    await shot(name('staff-customers-list', language));
    await newForm();
    await shot(name('staff-customer-new-form', language));
    await submitForm();
    await sleep(400);
    await shot(name('staff-customer-new-errors', language));
    if (!full) {
      await customerPage('zahid');
      await shot(name('staff-customer-page', language));
      return;
    }
    if (full) {
      await fill('#name-en', 'Ahmad Khan');
      await sleep(200);
      await submitForm();
      await waitFor('[data-duplicate-row]');
      await sleep(400);
      await shot(name('staff-customer-duplicate-dialog', language));
      await closeDialog();
      await go('/customers');
      await go(`/customers/${seeded['akram']}/edit`);
      await waitFor('#name-en');
      await sleep(400);
      await shot(name('staff-customer-edit-no-limit', language));
    }
    await customerPage('zahid');
    await shot(name('staff-customer-page', language));
    await click('[data-action=receive-payment]');
    await waitFor('[data-payment-form]');
    await fill('#pay-amount', '500');
    await sleep(300);
    await shot(name('staff-payment-cash', language));
    await closeDialog();
    if (full) {
      await statementPage('zahid');
      await shot(name('staff-statement', language));
    }
    await go('/pos');
    await go('/settings');
    await waitFor('[data-page=settings]');
    await sleep(500);
    await shot(name('staff-settings', language));
    await posPickerScreens(name, language, false);
  }

  // ---------- Phase 7: returns and voids (numbers 200 and up; the Phase 6 layout judge applies to them) ----------
  /** Picks a value in the n-th <select data-reason> (the same in both languages: the value is the reason code). */
  function pickReason(n: number, value: string): Promise<unknown> {
    return js(`(() => { const el = document.querySelectorAll('[data-return-line] select[data-reason]')[${n}];
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  /** Presses More on the n-th return line (the last button of its stepper) `times` times. */
  function more(n: number, times: number): Promise<unknown> {
    return js(`(async () => { for (let i = 0; i < ${times}; i++) { const line = document.querySelectorAll('[data-return-line]')[${n}];
      const buttons = [...line.querySelectorAll('button')].filter((b) => b.textContent.trim() === '+'); buttons[0].click(); await new Promise((r) => setTimeout(r, 60)); } })()`);
  }
  async function openInvoiceForReturn(invoiceNo: string): Promise<void> {
    await go('/returns');
    await js(`document.querySelector('[data-page=returns] [role=tab]')?.click()`); // the New return tab (the page may still be on Past returns)
    await waitFor('[data-find-invoice]');
    await fill('#return-search', invoiceNo); // the list shows the 5 newest invoices: search for the one wanted
    await waitFor(`[data-find-row="${invoiceNo}"]`);
    await click(`[data-find-row="${invoiceNo}"]`);
    await waitFor('[data-return-lines]');
    await sleep(300);
  }

  /** Owner: the empty page, a sale opened, a partial return with a reason, the void card, the finished return, the list, and a voided invoice. */
  async function ownerReturnsScreens(language: 'en' | 'ur', prefix: number, returnInvoice: string, voidInvoice: string): Promise<void> {
    await go('/pos');
    await go('/returns');
    await waitFor('[data-find-invoice]');
    await waitFor('[data-find-row]');
    await shot(`${prefix}-returns-start-${language}`);
    await openInvoiceForReturn(returnInvoice);
    await shot(`${prefix + 1}-returns-invoice-${language}`);
    await more(0, 1);
    await pickReason(0, 'changed_mind');
    if (await js<boolean>(`document.querySelectorAll('[data-return-line]').length > 1`)) {
      await js(`(() => { const input = document.querySelectorAll('[data-return-line]')[1].querySelector('input[data-qty]');
        if (!input) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0.1'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(200);
      if (await js<boolean>(`!!document.querySelectorAll('[data-return-line]')[1].querySelector('select[data-reason]')`)) await pickReason(1, 'leaked');
    }
    await waitFor('[data-refund-total]');
    await sleep(500);
    await shot(`${prefix + 2}-returns-refund-${language}`);
    await js(`document.querySelector('[data-void-card]')?.scrollIntoView()`);
    await sleep(300);
    await shot(`${prefix + 3}-returns-void-card-${language}`);
    await js(`document.querySelector('main').scrollTo(0, 0)`);
    await click('[data-complete]:not([disabled])');
    await waitFor('[data-return-complete] [data-done-total]');
    await sleep(300);
    await shot(`${prefix + 4}-returns-complete-${language}`);
    await click('[role=tab][aria-selected=false]');
    await waitFor('[data-returns-list] [data-return-row]');
    await shot(`${prefix + 5}-returns-list-${language}`);
    await click('[data-return-row] button');
    await waitFor('[data-return-detail]');
    await shot(`${prefix + 6}-returns-detail-${language}`);
    await js(`[...document.querySelectorAll('[role=dialog] button')].at(-1).click()`);
    await openInvoiceForReturn(voidInvoice);
    await js(`document.querySelector('[data-void-card]').scrollIntoView()`);
    await fill('#void-reason', language === 'en' ? 'Entered for the wrong customer' : 'غلط گاہک کے نام پر لکھا گیا');
    await sleep(200);
    await shot(`${prefix + 7}-returns-void-reason-${language}`);
    await click('[data-void-confirm]');
    await waitFor('[data-void-done]');
    await sleep(300);
    await shot(`${prefix + 8}-returns-voided-${language}`);
  }

  /** Staff: start a return and ask the owner (the approval box with the stock decision), then the page as staff sees it (no void card). */
  async function staffReturnsScreens(language: 'en' | 'ur', prefix: number, invoiceNo: string): Promise<void> {
    await openInvoiceForReturn(invoiceNo);
    await more(0, 1);
    await pickReason(0, 'wrong_item');
    await waitFor('[data-refund-total]');
    await sleep(500);
    await shot(`${prefix}-staff-returns-refund-${language}`);
    await click('[data-ask-owner]:not([disabled])');
    await waitFor('[role=dialog] [data-approval-lines]');
    await fill('#return-approval-username', 'owner');
    await sleep(200);
    await shot(`${prefix + 1}-staff-returns-approval-${language}`);
    await js(`[...document.querySelectorAll('[role=dialog] button')].find((b) => !b.disabled && b.type === 'button' && !b.hasAttribute('aria-pressed')).click()`);
    await sleep(300);
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
  await seedForScreens(db, handlers);

  // ---------- the signed-in app, English ----------
  for (const [index, page] of ['pos', 'invoices', 'customers'].entries()) {
    await go(`/${page}`);
    await shot(`1${index * 2}-${page}-en`);
  }
  await productsScreens('en', '11');
  await formScreens('en', 50);
  await receiveScreens('en', 70);
  await posScreens('en', 90, true);
  await invoiceDetailScreen('en', 95);
  await settingsScreen('en', 96, 'owner');
  await ownerCustomerScreens('en', 110, 148);
  await ownerReturnsScreens('en', 200, 'INV-A-000002', 'INV-A-000004');

  // ---------- Urdu: right to left ----------
  await setLanguage('ur');
  for (const [index, page] of ['pos', 'invoices', 'customers'].entries()) {
    await go(`/${page}`);
    await shot(`2${index * 2}-${page}-ur`);
  }
  await productsScreens('ur', '21');
  await formScreens('ur', 60);
  await receiveScreens('ur', 80);
  await posScreens('ur', 100, false);
  await invoiceDetailScreen('ur', 105);
  await settingsScreen('ur', 106, 'owner');
  await ownerCustomerScreens('ur', 160, 195);
  await ownerReturnsScreens('ur', 220, 'INV-A-000005', 'INV-A-000006');
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
  await settingsScreen('en', 99, 'staff'); // nor can they change settings: they see the calm message
  await staffLimitScreens(97);
  await staffCustomerScreens('en', 149, 159);
  await staffReturnsScreens('en', 240, 'INV-A-000003');
  await go('/purchases/receive'); // nor can they open Receive stock: they land on Purchases, which has no link to it
  await waitFor('[data-page=purchases]');
  await shot('49-staff-receive-redirect-en');
  await setLanguage('ur');
  await productsScreens('ur', '45');
  await setLanguage('ur');
  await staffReturnsScreens('ur', 242, 'INV-A-000007');
  await setLanguage('en');
  await setLanguage('ur');
  await staffCustomerScreens('ur', 196, 199);
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

  writeFileSync(join(dir, 'report.json'), JSON.stringify({ size, problems, layoutProblems, reports }, null, 2));
  if (layoutProblems.length) {
    console.error(`SCREENSHOTS ${size}: ${layoutProblems.length} layout or wording problem(s) on the Phase 6 screens:\n${layoutProblems.join('\n')}`);
    process.exitCode = 1;
  }
  if (problems.length) {
    console.error(`SCREENSHOTS ${size}: the page logged ${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`SCREENSHOTS ${size}: ${reports.length} screens saved to ${dir}, the page logged no warnings or errors`);
  }
}
