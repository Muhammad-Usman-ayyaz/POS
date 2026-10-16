// A small TypeScript/TSX scanner for tests that read source files. (The `typescript` package in node_modules is the native 7.x build and has no
// JavaScript compiler API, so this is a real tokenizer instead of a regex: it knows comments, strings, templates with their ${} holes and regular expressions.)

/**
 * Drops REAL comments only. A `//` or `/*` inside a string, a template (including its `${}` holes) or a regular expression is code, and stays.
 * Returns the code with comments blanked, and the text of every string and template chunk.
 */
export function scanSource(src: string): { code: string; strings: string[] } {
  let code = '';
  const strings: string[] = [];
  let i = 0;
  let last = ''; // the last significant character of code: decides whether a `/` starts a regular expression
  let depth = 0; // { } nesting
  const holes: number[] = []; // the depth at which each open template ${ was entered

  // Reads template text from i (just after a backtick or just after the } of a hole) up to the closing backtick or the next ${.
  const templateChunk = () => {
    let j = i;
    while (j < src.length && src[j] !== '`') {
      if (src[j] === '\\') j += 2;
      else if (src[j] === '$' && src[j + 1] === '{') break;
      else j++;
    }
    strings.push(src.slice(i, j));
    if (src[j] === '$') {
      code += src.slice(i, j + 2);
      i = j + 2;
      holes.push(depth);
      depth++;
      last = '{';
    } else {
      code += src.slice(i, j + 1);
      i = j + 1;
      last = '`';
    }
  };

  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      code += ' ';
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      code += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      strings.push(src.slice(i + 1, j));
      code += src.slice(i, j + 1);
      i = j + 1;
      last = c;
    } else if (c === '`') {
      code += c;
      i++;
      templateChunk();
    } else if (c === '{') {
      depth++;
      code += c;
      i++;
      last = c;
    } else if (c === '}') {
      depth--;
      code += c;
      i++;
      last = c;
      if (holes.length > 0 && holes[holes.length - 1] === depth) {
        holes.pop();
        templateChunk();
      }
    } else if (c === '/' && !/[\w)\]$]/.test(last)) {
      // A regular expression literal: copied whole (it may hold quotes and slashes).
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n' && (inClass || src[j] !== '/')) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      code += src.slice(i, j + 1);
      i = j + 1;
      last = 'r';
    } else {
      code += c;
      i++;
      if (!/\s/.test(c)) last = c;
    }
  }
  return { code, strings };
}

/** Everything that would mean a file does its own time-zone work: fixed offsets, hour arithmetic, local or UTC date getters and setters. */
export function timeZoneViolations(file: string, src: string): string[] {
  const { code, strings } = scanSource(src);
  const found: string[] = [];
  for (const s of strings) {
    if (/[+-](0\d|1[0-4]):?[0-5]\d(?!\d)/.test(s) || /\b(GMT|UTC)\s*[+-]\s*\d/i.test(s)) found.push(`${file}: a fixed offset in the string "${s}"`);
  }
  const patterns: [RegExp, string][] = [
    [/\b(18_?000(_?000)?|3_?600(_?000)?)\b/, 'an hour-offset number (18000, 3600, 18000000, 3600000)'],
    [/\b\d+\s*\*\s*60\s*\*\s*(60|1000)\b/, 'hours-to-milliseconds arithmetic'],
    [/\b60\s*\*\s*60\b/, 'hours-to-seconds arithmetic'],
    [/\.(get|set)(UTC)?(Hours|Minutes|Seconds|Milliseconds|Date|Day|FullYear|Month)\s*\(/, 'a local or UTC date getter or setter'],
    [/\.getTimezoneOffset\s*\(/, 'getTimezoneOffset'],
  ];
  for (const [re, what] of patterns) if (re.test(code)) found.push(`${file}: ${what}`);
  return found;
}
