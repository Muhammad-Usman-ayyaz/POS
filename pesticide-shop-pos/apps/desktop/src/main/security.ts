// Electron security settings, as plain functions so they can be tested without starting Electron.
import type { BrowserWindowConstructorOptions } from 'electron';

export const MIN_WINDOW_WIDTH = 1280;
export const MIN_WINDOW_HEIGHT = 720;
export const DEFAULT_WINDOW_WIDTH = 1366;
export const DEFAULT_WINDOW_HEIGHT = 768;

/**
 * Content-Security-Policy for the page.
 *
 * Production is strict: only files from the app itself. No inline script, no inline <style>, no eval, no network,
 * no frames, no plugins. (React sets inline styles through the CSSOM, which this policy allows.)
 *
 * Only the Vite dev server gets a relaxed policy: it injects an inline script for hot reload, inline <style> tags,
 * and talks to the browser over a local web socket. That policy is never used in a built app.
 */
export function buildCsp(options: { dev: boolean }): string {
  if (!options.dev) {
    return [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "manifest-src 'none'",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' ws://localhost:* http://localhost:*",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src 'none'",
  ].join('; ');
}

/** The window: isolated from Node, sandboxed, nothing the page does can reach the file system or the database. */
export function windowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    backgroundColor: '#F4F2EC',
    title: 'Pesticide Club POS',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: false,
    },
  };
}

export interface TrustedPages {
  /** Production: the path of the built index.html. */
  indexFilePath?: string;
  /** Development: the Vite dev server, e.g. http://localhost:5173 */
  devServerUrl?: string;
}

function urlMatches(url: string, pages: TrustedPages): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (pages.devServerUrl) {
    try {
      if (parsed.origin === new URL(pages.devServerUrl).origin) return true;
    } catch {
      /* fall through */
    }
  }
  if (pages.indexFilePath && parsed.protocol === 'file:') {
    const wanted = pages.indexFilePath.replaceAll('\\', '/').toLowerCase();
    const actual = decodeURIComponent(parsed.pathname).replace(/^\//, '').toLowerCase();
    return actual === wanted.replace(/^\//, '');
  }
  return false;
}

/**
 * Only our own window, only its top frame, only our own page may call the API. A different window, an iframe, or a page
 * that navigated somewhere else is refused before any handler runs.
 */
export function isTrustedSender(sender: { webContentsId: number; isMainFrame: boolean; frameUrl: string }, mainWindowId: number | null, pages: TrustedPages): boolean {
  return mainWindowId !== null && sender.webContentsId === mainWindowId && sender.isMainFrame && urlMatches(sender.frameUrl, pages);
}

/** Navigation inside the window is allowed only to our own page (for example a reload). */
export function isAllowedNavigation(url: string, pages: TrustedPages): boolean {
  return urlMatches(url, pages);
}

/** The marker in index.html that the build replaces with the Content-Security-Policy tag. */
export const CSP_PLACEHOLDER = '<!--pos-csp-->';

/** Puts the policy into the page as a <meta> tag. `dev` is true only for the Vite dev server. */
export function injectCsp(html: string, dev: boolean): string {
  if (!html.includes(CSP_PLACEHOLDER)) throw new Error(`index.html has no ${CSP_PLACEHOLDER} marker, so it would have no Content-Security-Policy`);
  const policy = buildCsp({ dev }).replaceAll('"', '&quot;');
  return html.replace(CSP_PLACEHOLDER, `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
}
