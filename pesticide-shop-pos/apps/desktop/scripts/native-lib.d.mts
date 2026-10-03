export const desktopDir: string;
export const pins: { version: string; electron: string; abi: number; binaries: Record<string, { url: string; tarballSha256: string; fileSha256: string }> };
export const platformKey: string;
export const targetFile: string;
export function sha256(buffer: Uint8Array): string;
export function installedVersions(): { betterSqlite3: string; electron: string; abi: number };
export function assertPinsMatchInstalled(): void;
export function pinForThisPlatform(): { url: string; tarballSha256: string; fileSha256: string };
export function checkTarget(): 'ok' | 'missing' | 'wrong-hash';
