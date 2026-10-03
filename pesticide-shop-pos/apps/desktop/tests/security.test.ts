import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCsp,
  CSP_PLACEHOLDER,
  injectCsp,
  isAllowedNavigation,
  isTrustedSender,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  windowOptions,
} from '../src/main/security.js';

describe('the window', () => {
  const options = windowOptions('/app/out/preload/index.js');

  it('keeps the page away from Node and the system: isolated, sandboxed, no node integration', () => {
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      preload: '/app/out/preload/index.js',
    });
  });

  it('cannot be made smaller than 1280 x 720', () => {
    expect([MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT]).toEqual([1280, 720]);
    expect(options).toMatchObject({ minWidth: 1280, minHeight: 720 });
    expect(options.width).toBeGreaterThanOrEqual(1280);
    expect(options.height).toBeGreaterThanOrEqual(720);
  });
});

describe('Content-Security-Policy', () => {
  const production = buildCsp({ dev: false });
  const development = buildCsp({ dev: true });
  const directive = (csp: string, name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `));

  it('production is strict: only the app itself, nothing inline, no eval, no network', () => {
    expect(directive(production, 'default-src')).toBe("default-src 'none'");
    expect(directive(production, 'script-src')).toBe("script-src 'self'");
    expect(directive(production, 'style-src')).toBe("style-src 'self'");
    expect(directive(production, 'connect-src')).toBe("connect-src 'none'");
    expect(directive(production, 'object-src')).toBe("object-src 'none'");
    expect(directive(production, 'frame-src')).toBe("frame-src 'none'");
    expect(directive(production, 'base-uri')).toBe("base-uri 'none'");
    expect(directive(production, 'form-action')).toBe("form-action 'none'");
  });

  it("production has no 'unsafe-inline', no 'unsafe-eval', no wildcard, no remote host and no web socket", () => {
    expect(production).not.toMatch(/unsafe-inline|unsafe-eval|wasm-unsafe-eval|\*|https?:|wss?:|ws:/);
  });

  it('only the dev server policy is relaxed, and only as much as Vite needs', () => {
    expect(directive(development, 'script-src')).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(development, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(development, 'connect-src')).toContain('ws://localhost:*');
    expect(development).not.toContain('unsafe-eval');
    expect(development).not.toMatch(/https:\/\/(?!localhost)/);
    expect(development).not.toBe(production);
  });

  it('is put into index.html as a meta tag, strict unless this is the dev server', () => {
    const html = `<head>${CSP_PLACEHOLDER}</head>`;
    const built = injectCsp(html, false);
    expect(built).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(built).toContain(production);
    expect(built).not.toContain(CSP_PLACEHOLDER);
    expect(built).not.toMatch(/unsafe-/);
    expect(injectCsp(html, true)).toContain("'unsafe-inline'");
  });

  it('refuses a page that has no marker, so a page can never ship without a policy', () => {
    expect(() => injectCsp('<head></head>', false)).toThrow(/no Content-Security-Policy|Content-Security-Policy/);
  });

  it('the real index.html has the marker, and no inline script or style of its own', () => {
    const html = readFileSync(join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
    expect(html).toContain(CSP_PLACEHOLDER);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\bstyle=/i);
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('who may call the API', () => {
  const pages = { indexFilePath: 'E:/app/out/renderer/index.html', devServerUrl: 'http://localhost:5173' };
  const good = { webContentsId: 7, isMainFrame: true, frameUrl: 'file:///E:/app/out/renderer/index.html#/pos' };

  it('accepts our own window, its top frame, our own page', () => {
    expect(isTrustedSender(good, 7, pages)).toBe(true);
    expect(isTrustedSender({ ...good, frameUrl: 'http://localhost:5173/' }, 7, pages)).toBe(true);
  });

  it.each([
    ['another window', { ...good, webContentsId: 8 }],
    ['a frame inside the page', { ...good, isMainFrame: false }],
    ['a different file', { ...good, frameUrl: 'file:///E:/other/evil.html' }],
    ['a website', { ...good, frameUrl: 'https://evil.example/' }],
    ['the dev server on another port', { ...good, frameUrl: 'http://localhost:9999/' }],
    ['an unreadable address', { ...good, frameUrl: 'not a url' }],
  ])('refuses %s', (_label, sender) => {
    expect(isTrustedSender(sender, 7, pages)).toBe(false);
  });

  it('refuses everything while there is no window', () => {
    expect(isTrustedSender(good, null, pages)).toBe(false);
  });

  it('allows navigation only to our own page', () => {
    expect(isAllowedNavigation('file:///E:/app/out/renderer/index.html#/products', pages)).toBe(true);
    expect(isAllowedNavigation('https://evil.example/', pages)).toBe(false);
    expect(isAllowedNavigation('file:///C:/Windows/system.ini', pages)).toBe(false);
  });
});
