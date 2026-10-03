// Guards for the design system: the tokens are the approved ones, the fonts are bundled, motion switches off.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'index.css'), 'utf8');
const theme = css.slice(css.indexOf('@theme'), css.indexOf('@layer base'));

describe('colour tokens (from the approved designs)', () => {
  const tokens: Record<string, string> = {
    'color-page': '#f4f2ec',
    'color-ink': '#1b2a22',
    'color-muted': '#5b675f',
    'color-sidebar': '#17261e',
    'color-sidebar-ink': '#e7efe9',
    'color-sidebar-muted': '#a9bdb0',
    'color-nav-hover': '#25402f',
    'color-nav-active': '#2f7a4e',
    'color-accent': '#1f5d3a',
    'color-accent-dark': '#14412a',
    'color-tint': '#e3efe6',
    'color-tint-soft': '#eaf3ec',
    'color-card': '#ffffff',
    'color-line': '#d9d6cc',
    'color-thead': '#efede4',
    'color-row-line': '#ece9df',
    'color-row-hover': '#f6f5ee',
    'color-field-line': '#cfcbbe',
    'color-focus': '#7dbe97',
    'color-warn-bg': '#fbebcb',
    'color-warn-ink': '#7a4b00',
    'color-danger-bg': '#f8dada',
    'color-danger-ink': '#8e1f1f',
  };

  it.each(Object.entries(tokens))('--%s is %s', (name, value) => {
    expect(theme).toContain(`--${name}: ${value};`);
  });
});

describe('radii and fonts', () => {
  it('radii are 10, 12 and 14', () => {
    expect(theme).toContain('--radius-sm: 10px;');
    expect(theme).toContain('--radius-md: 12px;');
    expect(theme).toContain('--radius-lg: 14px;');
  });

  it('uses IBM Plex Sans for English and Noto Naskh Arabic for Urdu, both from the package, not the internet', () => {
    expect(css).toMatch(/--font-sans: "IBM Plex Sans"/);
    expect(css).toMatch(/--font-urdu: [^;]*"Noto Naskh Arabic/);
    for (const weight of [400, 500, 600, 700]) expect(css).toContain(`@fontsource/ibm-plex-sans/latin-${weight}.css`);
    expect(css).toContain('@fontsource-variable/noto-naskh-arabic/wght.css');
  });

  it('Urdu text uses Plex first for Latin letters and digits, so an English name inside Urdu is not set in Naskh', () => {
    const urdu = /--font-urdu: ([^;]+);/.exec(css)![1]!;
    expect(urdu.indexOf('IBM Plex Sans')).toBeLessThan(urdu.indexOf('Noto Naskh'));
  });

  it('loads nothing from the internet: no http(s) URL, no Google Fonts', () => {
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@import\s+url\(/i);
  });
});

describe('numbers', () => {
  const num = /\.num\s*\{([^}]*)\}/.exec(css)![1]!;

  it('the .num class stays left to right, isolated from the surrounding Urdu, with equal-width digits', () => {
    expect(num).toMatch(/direction:\s*ltr/);
    expect(num).toMatch(/unicode-bidi:\s*isolate/);
    expect(num).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(num).toMatch(/font-family:\s*var\(--font-sans\)/);
  });

  it('Urdu letters are never spaced out (it breaks the joins), but Latin numbers keep their spacing', () => {
    expect(css).toMatch(/\[lang="ur"\]\s*\[class\*="tracking-"\]:not\(\.num\)\s*\{[^}]*letter-spacing:\s*normal/);
  });

  it('the Urdu root uses the Urdu font and more line height', () => {
    expect(css).toMatch(/\[lang="ur"\]\s*\{[^}]*font-family:\s*var\(--font-urdu\)/);
    expect(css).toMatch(/\[lang="ur"\]\s*\{[^}]*line-height:\s*1\.7/);
  });
});

describe('motion', () => {
  it('rows and cards fade up in 0.42s with a stagger', () => {
    expect(theme).toMatch(/--animate-fade-up: fade-up 0\.42s/);
    expect(css).toMatch(/\.stagger\s*\{[^}]*animation-delay:\s*calc\(var\(--i, 0\) \* 60ms\)/);
  });

  it('has the five effects: lift, press, grow-in, pulse, pop, and a focus glow', () => {
    expect(css).toMatch(/\.lift:hover[^{]*\{[^}]*translateY\(-1px\)/);
    expect(css).toMatch(/\.lift:active[^{]*\{[^}]*scale\(0\.98\)/);
    expect(css).toContain('@keyframes grow-in');
    expect(css).toContain('@keyframes pulse-soft');
    expect(css).toContain('@keyframes pop');
    expect(css).toMatch(/input:focus[^{]*\{[^}]*box-shadow:\s*0 0 0 4px/);
  });

  it('the grow-in bar starts from the start edge: left in English, right in Urdu', () => {
    expect(css).toMatch(/\.grow-in\s*\{[^}]*transform-origin:\s*left/);
    expect(css).toMatch(/\[dir="rtl"\]\s*\.grow-in\s*\{[^}]*transform-origin:\s*right/);
  });

  it('under prefers-reduced-motion ALL animation and transitions are switched off', () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
    expect(block, 'there is a reduced-motion block').toBeTruthy();
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after/);
    expect(block).toMatch(/animation:\s*none\s*!important/);
    expect(block).toMatch(/transition:\s*none\s*!important/);
  });

  it('the reduced-motion block comes last, so nothing after it can switch motion back on', () => {
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const after = css.slice(at);
    expect(after).not.toMatch(/animation:[ 	]*(?!none)\S/);
    expect(after).not.toMatch(/@layer/);
  });

  it('no animated element starts hidden without an animation to show it (so "none" never leaves anything invisible)', () => {
    // Inside @keyframes, `opacity: 0` is the starting frame. Anywhere else it would be a hidden element.
    const withoutKeyframes = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    expect(withoutKeyframes).not.toMatch(/opacity:\s*0\s*;/);
  });
});
