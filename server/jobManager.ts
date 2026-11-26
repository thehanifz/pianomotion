import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { Midi } from '@tonejs/midi';
import type {
  BackgroundMode,
  BackgroundPreset,
  KeyboardRangeMode,
  NoteEvent,
  NotesData,
  PianoMotionThemeConfig,
  WatermarkPosition,
} from '../src/types/notes';
import {
  BROWSER_TRANSCODE_EXTENSIONS,
  DEFAULTS_DIR,
  ENTRY_POINT,
  JOBS_DIR,
  PORT,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_MIDI_EXTENSIONS,
  TRANSCRIBE_SCRIPT,
  resolveChromiumOptions,
  resolvePythonBin,
  resolveRemotionConcurrency,
} from './config';

export interface SensitivitySettings {
  onsetThreshold: number;
  frameThreshold: number;
  offsetThreshold: number;
  minVelocity: number;
  minDuration: number;
  maxDuration: number | null;
}

export const DEFAULT_SENSITIVITY: SensitivitySettings = {
  onsetThreshold: 0.38,
  frameThreshold: 0.25,
  offsetThreshold: 0.35,
  minVelocity: 0.22,
  minDuration: 0.06,
  maxDuration: null,
};

export type JobStage =
  | 'queued'
  | 'transcribing'
  | 'ready'
  | 'rendering'
  | 'completed'
  | 'failed';

export interface NoteStats {
  totalNotes: number;
  medianDuration: number;
  maxDuration: number;
  durationInSeconds: number;
}

export type JobThemeSettings = Pick<
  PianoMotionThemeConfig,
  | 'keyboardRangeMode'
  | 'watermarkText'
  | 'watermarkPosition'
  | 'watermarkOpacity'
  | 'backgroundMode'
  | 'backgroundPreset'
  | 'backgroundColor'
  | 'backgroundDim'
  | 'backgroundBlur'
  | 'enableParticles'
  | 'enableDust'
  | 'enableSpectrum'
  | 'enableBreathingBg'
  | 'enableChordDetection'
  | 'showActiveHud'
>;

export const DEFAULT_JOB_THEME: JobThemeSettings = {
  keyboardRangeMode: 'auto',
  watermarkText: '',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.72,
  backgroundMode: 'preset',
  backgroundPreset: 'midnight-navy',
  backgroundColor: '#0a101f',
  backgroundDim: 0.62,
  backgroundBlur: 4,
  enableParticles: true,
  enableDust: true,
  enableSpectrum: true,
  enableBreathingBg: true,
  enableChordDetection: true,
  showActiveHud: true,
};

export interface JobRecord {
  id: string;
  originalName: string;
  title: string;
  inputType: 'audio' | 'midi';
  inputFileName: string;
  playableAudioFileName: string | null;
  backgroundImageFile: string | null;
  watermarkLogoFile: string | null;
  stage: JobStage;
  queuedAction: 'transcribe' | 'render' | null;
  progress: number;
  statusMessage: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  settings: SensitivitySettings;
  theme: JobThemeSettings;
  lastModelThresholds: {
    onsetThreshold: number;
    frameThreshold: number;
    offsetThreshold: number;
  } | null;
  stats: NoteStats | null;
  hasNotes: boolean;
  hasMidi: boolean;
  hasVideo: boolean;
  logs: string[];
}

interface QueueTask {
  jobId: string;
  action: 'transcribe' | 'render';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(Math.max(num, min), max);
}

export function normalizeSettings(raw: Partial<SensitivitySettings> | undefined): SensitivitySettings {
  const maxDurRaw = raw?.maxDuration;
  const maxDuration =
    maxDurRaw === null || maxDurRaw === undefined || (typeof maxDurRaw === 'string' && maxDurRaw === '')
      ? null
      : clampNumber(maxDurRaw, 0.2, 30, 6);

  return {
    onsetThreshold: clampNumber(raw?.onsetThreshold, 0.1, 0.85, DEFAULT_SENSITIVITY.onsetThreshold),
    frameThreshold: clampNumber(raw?.frameThreshold, 0.05, 0.75, DEFAULT_SENSITIVITY.frameThreshold),
    offsetThreshold: clampNumber(raw?.offsetThreshold, 0.1, 0.85, DEFAULT_SENSITIVITY.offsetThreshold),
    minVelocity: clampNumber(raw?.minVelocity, 0, 0.8, DEFAULT_SENSITIVITY.minVelocity),
    minDuration: clampNumber(raw?.minDuration, 0, 1, DEFAULT_SENSITIVITY.minDuration),
    maxDuration,
  };
}

const VALID_WATERMARK_POSITIONS = new Set<WatermarkPosition>([
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
  'center-stage',
  'random-drift',
]);

const VALID_BG_MODES = new Set<BackgroundMode>(['preset', 'custom-color', 'image']);

const VALID_BG_PRESETS = new Set<BackgroundPreset>([
  'midnight-navy',
  'warm-espresso',
  'deep-forest',
  'velvet-plum',
  'pure-obsidian',
]);

const VALID_RANGE_MODES = new Set<KeyboardRangeMode>(['auto', '49', '61', '76', '88']);

export function normalizeTheme(
  raw: Partial<JobThemeSettings> | undefined,
  base: JobThemeSettings = DEFAULT_JOB_THEME
): JobThemeSettings {
  const wmPos = VALID_WATERMARK_POSITIONS.has(raw?.watermarkPosition as WatermarkPosition)
    ? (raw!.watermarkPosition as WatermarkPosition)
    : base.watermarkPosition;
  const bgMode = VALID_BG_MODES.has(raw?.backgroundMode as BackgroundMode)
    ? (raw!.backgroundMode as BackgroundMode)
    : base.backgroundMode;
  const bgPreset = VALID_BG_PRESETS.has(raw?.backgroundPreset as BackgroundPreset)
    ? (raw!.backgroundPreset as BackgroundPreset)
    : base.backgroundPreset;
  const rangeMode = VALID_RANGE_MODES.has(raw?.keyboardRangeMode as KeyboardRangeMode)
    ? (raw!.keyboardRangeMode as KeyboardRangeMode)
    : base.keyboardRangeMode;

  const rawColor = typeof raw?.backgroundColor === 'string' ? raw.backgroundColor.trim() : '';
  const backgroundColor = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : base.backgroundColor;

  const watermarkText =
    typeof raw?.watermarkText === 'string'
      ? raw.watermarkText.slice(0, 80)
      : base.watermarkText;

  return {
    keyboardRangeMode: rangeMode,
    watermarkText,
    watermarkPosition: wmPos,
    watermarkOpacity: clampNumber(raw?.watermarkOpacity, 0.1, 1, base.watermarkOpacity),
    backgroundMode: bgMode,
    backgroundPreset: bgPreset,
    backgroundColor,
    backgroundDim: clampNumber(raw?.backgroundDim, 0, 0.95, base.backgroundDim),
    backgroundBlur: clampNumber(raw?.backgroundBlur, 0, 24, base.backgroundBlur),
    enableParticles:
      typeof raw?.enableParticles === 'boolean' ? raw.enableParticles : base.enableParticles,
    enableDust: typeof raw?.enableDust === 'boolean' ? raw.enableDust : base.enableDust,
    enableSpectrum:
      typeof raw?.enableSpectrum === 'boolean' ? raw.enableSpectrum : base.enableSpectrum,
    enableBreathingBg:
      typeof raw?.enableBreathingBg === 'boolean' ? raw.enableBreathingBg : base.enableBreathingBg,
    enableChordDetection:
      typeof raw?.enableChordDetection === 'boolean'
        ? raw.enableChordDetection
        : base.enableChordDetection,
    showActiveHud:
      typeof raw?.showActiveHud === 'boolean' ? raw.showActiveHud : base.showActiveHud,
  };
}

function moveOrCopyFile(srcPath: string, destPath: string) {
  try {
    fs.renameSync(srcPath, destPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      fs.copyFileSync(srcPath, destPath);
      fs.unlinkSync(srcPath);
    } else {
      throw err;
    }
  }
}

function computeStats(notes: NoteEvent[], durationInSeconds: number): NoteStats {
  if (notes.length === 0) {
    return {
      totalNotes: 0,
      medianDuration: 0,
      maxDuration: 0,
      durationInSeconds,
    };
  }
  const durs = notes.map((n) => Math.max(0, n.endTime - n.startTime)).sort((a, b) => a - b);
  const mid = Math.floor(durs.length / 2);
  const median = durs.length % 2 === 0 ? (durs[mid - 1] + durs[mid]) / 2 : durs[mid];
  return {
    totalNotes: notes.length,
    medianDuration: Number(median.toFixed(2)),
    maxDuration: Number(durs[durs.length - 1].toFixed(2)),
    durationInSeconds,
  };
}

function runCommandAsync(
  cmd: string,
  args: string[],
  onLine?: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrBuf = '';
    const handleChunk = (chunk: Buffer, isErr = false) => {
      const text = chunk.toString('utf-8');
      if (isErr) {
        stderrBuf += text;
      }
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line && onLine) {
          onLine(line);
        }
      }
    };

    child.stdout.on('data', (d: Buffer) => handleChunk(d, false));
    child.stderr.on('data', (d: Buffer) => handleChunk(d, true));

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderrBuf.trim() || `Process exited with code ${code}`));
      }
    });
  });
}

class JobManager {
  private jobs = new Map<string, JobRecord>();
  private queue: QueueTask[] = [];
  private isProcessing = false;
  private emitter = new EventEmitter();
  private bundleLocationPromise: Promise<string> | null = null;

  constructor() {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
    fs.mkdirSync(DEFAULTS_DIR, { recursive: true });
    this.loadExistingJobs();
  }

  private loadExistingJobs() {
    const entries = fs.readdirSync(JOBS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) {
        continue;
      }
      const metaPath = path.join(JOBS_DIR, entry.name, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        continue;
      }
      try {
        const rawJob = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as JobRecord;
        const job: JobRecord = {
          ...rawJob,
          backgroundImageFile: rawJob.backgroundImageFile ?? null,
          watermarkLogoFile: rawJob.watermarkLogoFile ?? null,
          theme: normalizeTheme(rawJob.theme),
        };
        if (job.stage === 'queued' || job.stage === 'transcribing' || job.stage === 'rendering') {
          job.stage = job.hasNotes ? 'ready' : 'failed';
          job.queuedAction = null;
          job.statusMessage = job.hasNotes
            ? 'Siap dipreview (proses sebelumnya terhenti saat server restart)'
            : 'Proses terhenti karena server restart';
          this.saveMeta(job);
        }
        this.jobs.set(job.id, job);
      } catch {
        // Ignore corrupted job directory
      }
    }
  }

  private jobDir(jobId: string): string {
    return path.join(JOBS_DIR, jobId);
  }

  private saveMeta(job: JobRecord) {
    job.updatedAt = new Date().toISOString();
    const metaPath = path.join(this.jobDir(job.id), 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(job, null, 2), 'utf-8');
    this.emitter.emit(`job:${job.id}`, job);
    this.emitter.emit('jobs:list', this.listJobs());
  }

  private appendLog(job: JobRecord, line: string) {
    job.logs.push(line);
    if (job.logs.length > 60) {
      job.logs.splice(0, job.logs.length - 60);
    }
  }

  subscribeJob(jobId: string, listener: (job: JobRecord) => void): () => void {
    const channel = `job:${jobId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  listJobs(): JobRecord[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getJob(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  getQueueInfo() {
    return {
      isProcessing: this.isProcessing,
      queuedCount: this.queue.length,
    };
  }

  getPlayableAudioPath(jobId: string): string | null {
    const job = this.jobs.get(jobId);
    if (!job || !job.playableAudioFileName) {
      return null;
    }
    const target = path.join(this.jobDir(jobId), job.playableAudioFileName);
    return fs.existsSync(target) ? target : null;
  }

  getNotesData(jobId: string): NotesData | null {
    const job = this.jobs.get(jobId);
    if (!job || !job.hasNotes) {
      return null;
    }
    const notesPath = path.join(this.jobDir(jobId), 'notes.json');
    if (!fs.existsSync(notesPath)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(notesPath, 'utf-8')) as NotesData;
    return {
      ...parsed,
      audioUrl: job.playableAudioFileName ? `/api/jobs/${job.id}/audio` : null,
      audioFile: null,
    };
  }

  getVideoPath(jobId: string): string | null {
    const job = this.jobs.get(jobId);
    if (!job || !job.hasVideo) {
      return null;
    }
    const videoPath = path.join(this.jobDir(jobId), 'output.mp4');
    return fs.existsSync(videoPath) ? videoPath : null;
  }

  private findAssetFile(dir: string, prefix: 'background' | 'logo'): string | null {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(`${prefix}.`)) {
        const ext = path.extname(entry).toLowerCase();
        if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
          return entry;
        }
      }
    }
    return null;
  }

  private clearAssetFiles(dir: string, prefix: 'background' | 'logo') {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(`${prefix}.`)) {
        fs.rmSync(path.join(dir, entry), { force: true });
      }
    }
  }

  getDefaultAssetPath(kind: 'background' | 'logo'): string | null {
    const file = this.findAssetFile(DEFAULTS_DIR, kind);
    return file ? path.join(DEFAULTS_DIR, file) : null;
  }

  getJobAssetPath(jobId: string, kind: 'background' | 'logo'): string | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const fileName = kind === 'background' ? job.backgroundImageFile : job.watermarkLogoFile;
    if (!fileName) return null;
    const full = path.join(this.jobDir(jobId), fileName);
    return fs.existsSync(full) ? full : null;
  }

  updateJobTheme(jobId: string, rawTheme: Partial<JobThemeSettings>): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job tidak ditemukan');
    }
    job.theme = normalizeTheme(rawTheme, job.theme);
    this.saveMeta(job);
    return job;
  }

  setJobAsset(
    jobId: string,
    kind: 'background' | 'logo',
    tempFilePath: string,
    originalName: string,
    saveAsDefault = true
  ): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      fs.rmSync(tempFilePath, { force: true });
      throw new Error('Job tidak ditemukan');
    }

    const ext = path.extname(originalName).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
      fs.rmSync(tempFilePath, { force: true });
      throw new Error(`Format gambar tidak didukung: ${ext || 'unknown'}`);
    }

    const dir = this.jobDir(jobId);
    this.clearAssetFiles(dir, kind);
    const fileName = `${kind}-${Date.now()}${ext}`;
    const destPath = path.join(dir, fileName);
    moveOrCopyFile(tempFilePath, destPath);

    if (kind === 'background') {
      job.backgroundImageFile = fileName;
      job.theme = normalizeTheme({ backgroundMode: 'image' }, job.theme);
    } else {
      job.watermarkLogoFile = fileName;
    }

    if (saveAsDefault) {
      this.clearAssetFiles(DEFAULTS_DIR, kind);
      fs.copyFileSync(destPath, path.join(DEFAULTS_DIR, `${kind}${ext}`));
    }

    this.saveMeta(job);
    return job;
  }

  deleteJobAsset(
    jobId: string,
    kind: 'background' | 'logo',
    alsoClearDefault = true
  ): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job tidak ditemukan');
    }

    this.clearAssetFiles(this.jobDir(jobId), kind);
    if (kind === 'background') {
      job.backgroundImageFile = null;
      if (job.theme.backgroundMode === 'image') {
        job.theme = normalizeTheme({ backgroundMode: 'preset' }, job.theme);
      }
    } else {
      job.watermarkLogoFile = null;
    }

    if (alsoClearDefault) {
      this.clearAssetFiles(DEFAULTS_DIR, kind);
    }

    this.saveMeta(job);
    return job;
  }

  async createJob(
    tempFilePath: string,
    originalName: string,
    settings: SensitivitySettings,
    rawTheme?: Partial<JobThemeSettings>,
    inheritDefaultAssets = true
  ): Promise<JobRecord> {
    const ext = path.extname(originalName).toLowerCase();
    const isMidi = SUPPORTED_MIDI_EXTENSIONS.has(ext);
    const isAudio = SUPPORTED_AUDIO_EXTENSIONS.has(ext);

    if (!isMidi && !isAudio) {
      fs.unlinkSync(tempFilePath);
      throw new Error(`Format file tidak didukung: ${ext || 'unknown'}`);
    }

    const id = crypto.randomUUID().slice(0, 12);
    const dir = this.jobDir(id);
    fs.mkdirSync(dir, { recursive: true });

    const inputFileName = `input${ext}`;
    const destPath = path.join(dir, inputFileName);
    try {
      moveOrCopyFile(tempFilePath, destPath);
    } catch (err) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw err;
    }

    let backgroundImageFile: string | null = null;
    let watermarkLogoFile: string | null = null;
    const normalizedTheme = normalizeTheme(rawTheme);

    if (inheritDefaultAssets) {
      if (normalizedTheme.backgroundMode === 'image') {
        const defBg = this.getDefaultAssetPath('background');
        if (defBg) {
          const bgExt = path.extname(defBg).toLowerCase();
          backgroundImageFile = `background${bgExt}`;
          fs.copyFileSync(defBg, path.join(dir, backgroundImageFile));
        }
      }
      const defLogo = this.getDefaultAssetPath('logo');
      if (defLogo) {
        const logoExt = path.extname(defLogo).toLowerCase();
        watermarkLogoFile = `logo${logoExt}`;
        fs.copyFileSync(defLogo, path.join(dir, watermarkLogoFile));
      }
    }

    const title = path.basename(originalName, ext).trim() || 'PianoMotion Track';
    const now = new Date().toISOString();

    const job: JobRecord = {
      id,
      originalName,
      title,
      inputType: isMidi ? 'midi' : 'audio',
      inputFileName,
      playableAudioFileName: isAudio ? inputFileName : null,
      backgroundImageFile,
      watermarkLogoFile,
      stage: 'queued',
      queuedAction: 'transcribe',
      progress: 0,
      statusMessage: 'Menunggu antrean proses...',
      error: null,
      createdAt: now,
      updatedAt: now,
      settings,
      theme: normalizedTheme,
      lastModelThresholds: null,
      stats: null,
      hasNotes: false,
      hasMidi: isMidi,
      hasVideo: false,
      logs: [`File diterima: ${originalName}`],
    };

    this.jobs.set(id, job);
    this.saveMeta(job);
    this.enqueue({ jobId: id, action: 'transcribe' });
    return job;
  }

  reprocessJob(jobId: string, newSettings: SensitivitySettings): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job tidak ditemukan');
    }
    if (job.stage === 'transcribing' || job.stage === 'rendering' || job.stage === 'queued') {
      throw new Error('Job masih sedang diproses');
    }

    job.settings = newSettings;
    job.error = null;
    job.hasVideo = false;
    const videoPath = path.join(this.jobDir(jobId), 'output.mp4');
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }

    // Fast path: if MIDI already exists and model thresholds did not change, filter immediately without re-running PyTorch
    const midiPath = path.join(this.jobDir(jobId), 'notes.mid');
    const sourceMidi = job.inputType === 'midi' ? path.join(this.jobDir(jobId), job.inputFileName) : midiPath;
    const canFastFilter =
      fs.existsSync(sourceMidi) &&
      (job.inputType === 'midi' ||
        (job.lastModelThresholds !== null &&
          job.lastModelThresholds.onsetThreshold === newSettings.onsetThreshold &&
          job.lastModelThresholds.frameThreshold === newSettings.frameThreshold &&
          job.lastModelThresholds.offsetThreshold === newSettings.offsetThreshold));

    if (canFastFilter) {
      const notesPath = path.join(this.jobDir(jobId), 'notes.json');
      const existingDuration = job.stats?.durationInSeconds;
      const converted = this.convertMidiToNotesJson(
        sourceMidi,
        notesPath,
        job.title,
        newSettings,
        existingDuration
      );
      job.hasNotes = true;
      job.stage = 'ready';
      job.progress = 100;
      job.stats = converted.stats;
      job.statusMessage = `Filter sensitivitas diperbarui (${converted.stats.totalNotes} not)`;
      this.appendLog(job, `Filter cepat diterapkan: ${converted.stats.totalNotes} not tersimpan.`);
      this.saveMeta(job);
      return job;
    }

    job.stage = 'queued';
    job.queuedAction = 'transcribe';
    job.progress = 0;
    job.statusMessage = 'Menunggu antrean proses ulang transkripsi...';
    this.appendLog(job, 'Memulai proses ulang dengan threshold model baru...');
    this.saveMeta(job);
    this.enqueue({ jobId, action: 'transcribe' });
    return job;
  }

  enqueueRender(jobId: string): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job tidak ditemukan');
    }
    if (!job.hasNotes) {
      throw new Error('Data not belum tersedia; proses lagu terlebih dahulu');
    }
    if (job.stage === 'transcribing' || job.stage === 'rendering' || job.stage === 'queued') {
      throw new Error('Job masih sedang diproses');
    }

    job.stage = 'queued';
    job.queuedAction = 'render';
    job.progress = 0;
    job.error = null;
    job.statusMessage = 'Menunggu antrean render video MP4...';
    this.appendLog(job, 'Render video ditambahkan ke antrean.');
    this.saveMeta(job);
    this.enqueue({ jobId, action: 'render' });
    return job;
  }

  deleteJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }
    if (job.stage === 'transcribing' || job.stage === 'rendering') {
      throw new Error('Tidak dapat menghapus job yang sedang berjalan');
    }
    this.queue = this.queue.filter((item) => item.jobId !== jobId);
    this.jobs.delete(jobId);
    fs.rmSync(this.jobDir(jobId), { recursive: true, force: true });
    this.emitter.emit('jobs:list', this.listJobs());
    return true;
  }

  private enqueue(task: QueueTask) {
    this.queue.push(task);
    void this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift()!;
        const job = this.jobs.get(task.jobId);
        if (!job) {
          continue;
        }
        if (task.action === 'transcribe') {
          await this.runTranscription(job);
        } else {
          await this.runRender(job);
        }
      }
    } finally {
      this.isProcessing = false;
      this.emitter.emit('jobs:list', this.listJobs());
    }
  }

  private convertMidiToNotesJson(
    midiPath: string,
    outputJsonPath: string,
    title: string,
    settings: SensitivitySettings,
    overrideDuration?: number
  ): { data: NotesData; stats: NoteStats } {
    const midiBuffer = fs.readFileSync(midiPath);
    const midi = new Midi(midiBuffer);

    const nonEmptyTracks = midi.tracks.filter((track) => track.notes.length > 0);
    const isMultiTrack = nonEmptyTracks.length > 1;
    const notes: NoteEvent[] = [];

    nonEmptyTracks.forEach((track, trackIdx) => {
      for (const note of track.notes) {
        if (note.midi < 21 || note.midi > 108) {
          continue;
        }
        const velocity = Math.min(Math.max(note.velocity, 0), 1);
        const startTime = note.time;
        let endTime = note.time + note.duration;
        if (settings.maxDuration !== null && endTime - startTime > settings.maxDuration) {
          endTime = startTime + settings.maxDuration;
        }
        const duration = endTime - startTime;
        if (velocity < settings.minVelocity || duration < settings.minDuration) {
          continue;
        }
        notes.push({
          pitch: note.midi,
          name: note.name,
          startTime: Number(startTime.toFixed(4)),
          endTime: Number(endTime.toFixed(4)),
          velocity: Number(velocity.toFixed(3)),
          ...(isMultiTrack ? { track: trackIdx } : {}),
        });
      }
    });

    notes.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
    const maxEnd = notes.reduce((acc, n) => Math.max(acc, n.endTime), 0);
    const durationInSeconds = Number(
      Math.max(overrideDuration ?? 0, midi.duration, maxEnd, 1).toFixed(2)
    );

    const data: NotesData = {
      fps: 30,
      durationInSeconds,
      title,
      notes,
    };

    fs.writeFileSync(outputJsonPath, JSON.stringify(data, null, 2), 'utf-8');
    return {
      data,
      stats: computeStats(notes, durationInSeconds),
    };
  }

  private async ensureBrowserPlayableAudio(job: JobRecord) {
    if (job.inputType !== 'audio') {
      return;
    }
    const ext = path.extname(job.inputFileName).toLowerCase();
    if (!BROWSER_TRANSCODE_EXTENSIONS.has(ext)) {
      return;
    }

    const dir = this.jobDir(job.id);
    const inputPath = path.join(dir, job.inputFileName);
    const previewName = 'preview.mp3';
    const previewPath = path.join(dir, previewName);

    if (!fs.existsSync(previewPath)) {
      job.statusMessage = 'Mengonversi audio ke format kompatibel browser...';
      this.appendLog(job, `FFmpeg transcode ${ext} -> ${previewName} untuk preview browser.`);
      this.saveMeta(job);

      await runCommandAsync('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-codec:a',
        'libmp3lame',
        '-q:a',
        '2',
        previewPath,
      ]);
    }

    job.playableAudioFileName = previewName;
    this.saveMeta(job);
  }

  private async runTranscription(job: JobRecord) {
    const dir = this.jobDir(job.id);
    const inputPath = path.join(dir, job.inputFileName);
    const notesPath = path.join(dir, 'notes.json');
    const midiOutPath = path.join(dir, 'notes.mid');

    job.stage = 'transcribing';
    job.queuedAction = null;
    job.progress = 2;
    job.error = null;
    job.statusMessage =
      job.inputType === 'midi'
        ? 'Membaca file MIDI...'
        : 'Memuat audio & model transkripsi...';
    this.saveMeta(job);

    try {
      if (job.inputType === 'midi') {
        const { stats } = this.convertMidiToNotesJson(
          inputPath,
          notesPath,
          job.title,
          job.settings
        );
        job.hasNotes = true;
        job.hasMidi = true;
        job.progress = 100;
        job.stage = 'ready';
        job.stats = stats;
        job.statusMessage = `Siap dipreview (${stats.totalNotes} not)`;
        this.appendLog(job, `MIDI berhasil diparse: ${stats.totalNotes} not.`);
        this.saveMeta(job);
        return;
      }

      await this.ensureBrowserPlayableAudio(job);

      const pythonBin = resolvePythonBin();
      const args = [
        TRANSCRIBE_SCRIPT,
        inputPath,
        '-o',
        notesPath,
        '--midi-out',
        midiOutPath,
        '--fps',
        '30',
        '--title',
        job.title,
        '--audio-file',
        '',
        '--onset-threshold',
        String(job.settings.onsetThreshold),
        '--frame-threshold',
        String(job.settings.frameThreshold),
        '--offset-threshold',
        String(job.settings.offsetThreshold),
        '--min-velocity',
        String(job.settings.minVelocity),
        '--min-duration',
        String(job.settings.minDuration),
      ];
      if (job.settings.maxDuration !== null) {
        args.push('--max-duration', String(job.settings.maxDuration));
      }

      await runCommandAsync(pythonBin, args, (line) => {
        this.appendLog(job, line);
        const segMatch = line.match(/^Segment\s+(\d+)\s*\/\s*(\d+)/i);
        if (segMatch) {
          const cur = Number(segMatch[1]);
          const total = Math.max(Number(segMatch[2]), 1);
          const pct = Math.min(96, Math.max(5, Math.round((cur / total) * 92) + 4));
          job.progress = pct;
          job.statusMessage = `Transkripsi audio: segmen ${cur}/${total} (${pct}%)`;
          this.saveMeta(job);
        } else if (line.startsWith('Downloading model checkpoint')) {
          job.statusMessage = 'Mengunduh checkpoint model piano (~165 MB)...';
          this.saveMeta(job);
        } else if (line.startsWith('Loading audio')) {
          job.progress = 3;
          job.statusMessage = 'Memuat audio (16 kHz)...';
          this.saveMeta(job);
        }
      });

      const parsed = JSON.parse(fs.readFileSync(notesPath, 'utf-8')) as NotesData;
      job.hasNotes = true;
      job.hasMidi = fs.existsSync(midiOutPath);
      job.lastModelThresholds = {
        onsetThreshold: job.settings.onsetThreshold,
        frameThreshold: job.settings.frameThreshold,
        offsetThreshold: job.settings.offsetThreshold,
      };
      job.stats = computeStats(parsed.notes, parsed.durationInSeconds);
      job.progress = 100;
      job.stage = 'ready';
      job.statusMessage = `Transkripsi selesai (${job.stats.totalNotes} not)`;
      this.saveMeta(job);
    } catch (err) {
      job.stage = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.statusMessage = 'Gagal memproses lagu';
      this.appendLog(job, `ERROR: ${job.error}`);
      this.saveMeta(job);
    }
  }

  private async getServeUrl(): Promise<string> {
    if (!this.bundleLocationPromise) {
      this.bundleLocationPromise = bundle({
        entryPoint: ENTRY_POINT,
      });
    }
    return this.bundleLocationPromise;
  }

  private async runRender(job: JobRecord) {
    const dir = this.jobDir(job.id);
    const notesPath = path.join(dir, 'notes.json');
    const outputMp4 = path.join(dir, 'output.mp4');

    job.stage = 'rendering';
    job.queuedAction = null;
    job.progress = 1;
    job.error = null;
    job.statusMessage = 'Menyiapkan bundle Remotion...';
    this.saveMeta(job);

    try {
      const rawData = JSON.parse(fs.readFileSync(notesPath, 'utf-8')) as NotesData;
      const renderData: NotesData = {
        ...rawData,
        audioFile: null,
        audioUrl: job.playableAudioFileName
          ? `http://127.0.0.1:${PORT}/api/jobs/${job.id}/audio`
          : null,
      };

      const serveUrl = await this.getServeUrl();
      const renderTheme: Partial<PianoMotionThemeConfig> = {
        ...job.theme,
        backgroundImageUrl: job.backgroundImageFile
          ? `http://127.0.0.1:${PORT}/api/jobs/${job.id}/assets/background`
          : null,
        watermarkLogoUrl: job.watermarkLogoFile
          ? `http://127.0.0.1:${PORT}/api/jobs/${job.id}/assets/logo`
          : null,
      };
      const inputProps = { data: renderData, theme: renderTheme };
      const chromiumOptions = resolveChromiumOptions();
      const concurrency = resolveRemotionConcurrency();
      const composition = await selectComposition({
        serveUrl,
        id: 'PianoMotion',
        inputProps,
        chromiumOptions,
      });

      job.statusMessage = 'Merender video MP4...';
      this.appendLog(
        job,
        `Memulai render ${composition.durationInFrames} frame @ ${composition.fps}fps (concurrency=${concurrency ?? 'auto'})...`
      );
      this.saveMeta(job);

      let lastReportedPct = 0;
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation: outputMp4,
        inputProps,
        concurrency,
        chromiumOptions,
        onProgress: ({ progress }) => {
          const pct = Math.min(99, Math.max(1, Math.round(progress * 100)));
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            job.progress = pct;
            job.statusMessage = `Merender video MP4 (${pct}%)...`;
            this.saveMeta(job);
          }
        },
      });

      job.hasVideo = true;
      job.progress = 100;
      job.stage = 'completed';
      job.statusMessage = 'Video MP4 siap di-download!';
      this.appendLog(job, `Render selesai: ${outputMp4}`);
      this.saveMeta(job);
    } catch (err) {
      job.stage = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.statusMessage = 'Gagal merender video';
      this.appendLog(job, `RENDER ERROR: ${job.error}`);
      this.saveMeta(job);
    }
  }
}

export const jobManager = new JobManager();
