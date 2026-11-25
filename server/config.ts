import fs from 'node:fs';
import path from 'node:path';

export const ROOT_DIR = process.cwd();

function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('export ')) {
      line = line.slice(7).trim();
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let val = line.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile(path.resolve(ROOT_DIR, '.env'));

export const JOBS_DIR = path.resolve(ROOT_DIR, 'jobs');
export const DIST_WEB_DIR = path.resolve(ROOT_DIR, 'dist', 'web');
export const ENTRY_POINT = path.resolve(ROOT_DIR, 'src', 'index.ts');
export const TRANSCRIBE_SCRIPT = path.resolve(ROOT_DIR, 'scripts', 'transcribe.py');

export const PORT = Number(process.env.PORT || 4000);
export const HOST = process.env.HOST || '127.0.0.1';

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.m4a',
  '.aac',
  '.opus',
  '.webm',
  '.wma',
]);

export const SUPPORTED_MIDI_EXTENSIONS = new Set(['.mid', '.midi']);

export const BROWSER_TRANSCODE_EXTENSIONS = new Set(['.aac', '.wma']);

export function resolvePythonBin(): string {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const isWin = process.platform === 'win32';
  const venvPython = isWin
    ? path.resolve(ROOT_DIR, 'venv', 'Scripts', 'python.exe')
    : path.resolve(ROOT_DIR, 'venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  return isWin ? 'python' : 'python3';
}

export function resolveRemotionConcurrency(): number | null {
  const raw = process.env.REMOTION_CONCURRENCY;
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 1) {
    return parsed;
  }
  return null;
}

export function resolveChromiumOptions(): {
  flags?: Record<string, string | boolean>;
} {
  const flags: Record<string, string | boolean> = {};
  if (process.platform === 'linux') {
    flags['--disable-dev-shm-usage'] = true;
  }
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (isRoot || process.env.CHROMIUM_NO_SANDBOX === '1') {
    flags['--no-sandbox'] = true;
  }
  return Object.keys(flags).length > 0 ? { flags } : {};
}
