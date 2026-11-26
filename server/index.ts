import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import {
  DIST_WEB_DIR,
  HOST,
  JOBS_DIR,
  PORT,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_MIDI_EXTENSIONS,
  resolvePythonBin,
} from './config';
import {
  jobManager,
  normalizeSettings,
  type JobThemeSettings,
  type SensitivitySettings,
} from './jobManager';

const app = express();
app.use(express.json());

const uploadTempDir = path.join(JOBS_DIR, '_uploads');
fs.mkdirSync(uploadTempDir, { recursive: true });

const upload = multer({
  dest: uploadTempDir,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250 MB max for audio/MIDI
  },
});

const imageUpload = multer({
  dest: uploadTempDir,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB max for background/logo images
  },
});

function sanitizeDownloadName(name: string, ext: string): string {
  const base = path
    .basename(name, path.extname(name))
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .trim();
  return `${base || 'pianomotion'}${ext}`;
}

function parseAssetKind(raw: unknown): 'background' | 'logo' | null {
  if (raw === 'background' || raw === 'logo') {
    return raw;
  }
  return null;
}

const mediaCors: express.RequestHandler = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Range, Accept-Ranges, Content-Length'
  );
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
};

app.get('/api/health', (_req, res) => {
  const pythonBin = resolvePythonBin();
  res.json({
    ok: true,
    platform: process.platform,
    pythonBin,
    queue: jobManager.getQueueInfo(),
    defaults: {
      hasBackgroundImage: Boolean(jobManager.getDefaultAssetPath('background')),
      hasWatermarkLogo: Boolean(jobManager.getDefaultAssetPath('logo')),
    },
    supportedExtensions: [
      ...Array.from(SUPPORTED_AUDIO_EXTENSIONS),
      ...Array.from(SUPPORTED_MIDI_EXTENSIONS),
    ],
    supportedImageExtensions: Array.from(SUPPORTED_IMAGE_EXTENSIONS),
  });
});

app.get('/api/jobs', (_req, res) => {
  res.json({
    jobs: jobManager.listJobs(),
    queue: jobManager.getQueueInfo(),
  });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job tidak ditemukan' });
    return;
  }
  res.json({ job });
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job tidak ditemukan' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify(job)}\n\n`);

  const unsubscribe = jobManager.subscribeJob(job.id, (updated) => {
    res.write(`data: ${JSON.stringify(updated)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});

app.post('/api/jobs', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'File audio atau MIDI wajib dipilih' });
    return;
  }

  try {
    let rawSettings: Partial<SensitivitySettings> | undefined;
    if (typeof req.body?.settings === 'string') {
      rawSettings = JSON.parse(req.body.settings) as Partial<SensitivitySettings>;
    }
    let rawTheme: Partial<JobThemeSettings> | undefined;
    if (typeof req.body?.theme === 'string') {
      rawTheme = JSON.parse(req.body.theme) as Partial<JobThemeSettings>;
    }
    const inheritDefaultAssets = req.body?.inheritDefaultAssets !== 'false';

    const settings = normalizeSettings(rawSettings);
    const job = await jobManager.createJob(
      req.file.path,
      req.file.originalname,
      settings,
      rawTheme,
      inheritDefaultAssets
    );
    res.status(201).json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.put('/api/jobs/:id/theme', (req, res) => {
  try {
    const job = jobManager.updateJobTheme(
      req.params.id,
      req.body as Partial<JobThemeSettings>
    );
    res.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.post('/api/jobs/:id/assets', imageUpload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'File gambar wajib dipilih' });
    return;
  }
  const kind = parseAssetKind(req.body?.kind);
  if (!kind) {
    fs.rmSync(req.file.path, { force: true });
    res.status(400).json({ error: 'Parameter kind harus background atau logo' });
    return;
  }
  const saveAsDefault = req.body?.saveAsDefault !== 'false';

  try {
    const job = jobManager.setJobAsset(
      String(req.params.id),
      kind,
      req.file.path,
      req.file.originalname,
      saveAsDefault
    );
    res.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.options('/api/jobs/:id/assets/:kind', mediaCors);
app.get('/api/jobs/:id/assets/:kind', mediaCors, (req, res) => {
  const kind = parseAssetKind(req.params.kind);
  if (!kind) {
    res.status(400).json({ error: 'Jenis aset tidak valid' });
    return;
  }
  const assetPath = jobManager.getJobAssetPath(String(req.params.id), kind);
  if (!assetPath) {
    res.status(404).json({ error: 'Aset gambar tidak ditemukan' });
    return;
  }
  res.sendFile(assetPath);
});

app.delete('/api/jobs/:id/assets/:kind', (req, res) => {
  const kind = parseAssetKind(req.params.kind);
  if (!kind) {
    res.status(400).json({ error: 'Jenis aset tidak valid' });
    return;
  }
  try {
    const clearDefault = req.query.clearDefault !== 'false';
    const job = jobManager.deleteJobAsset(req.params.id, kind, clearDefault);
    res.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/defaults/assets/:kind', (req, res) => {
  const kind = parseAssetKind(req.params.kind);
  if (!kind) {
    res.status(400).json({ error: 'Jenis aset tidak valid' });
    return;
  }
  const assetPath = jobManager.getDefaultAssetPath(kind);
  if (!assetPath) {
    res.status(404).json({ error: 'Default aset belum diset' });
    return;
  }
  res.sendFile(assetPath);
});

app.post('/api/jobs/:id/reprocess', (req, res) => {
  try {
    const settings = normalizeSettings(req.body as Partial<SensitivitySettings>);
    const job = jobManager.reprocessJob(req.params.id, settings);
    res.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.post('/api/jobs/:id/render', (req, res) => {
  try {
    const job = jobManager.enqueueRender(req.params.id);
    res.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/jobs/:id/notes', (req, res) => {
  const data = jobManager.getNotesData(req.params.id);
  if (!data) {
    res.status(404).json({ error: 'Data not belum tersedia' });
    return;
  }
  res.json(data);
});

app.options('/api/jobs/:id/audio', mediaCors);
app.get('/api/jobs/:id/audio', mediaCors, (req, res) => {
  const audioPath = jobManager.getPlayableAudioPath(String(req.params.id));
  if (!audioPath) {
    res.status(404).json({ error: 'Audio tidak tersedia untuk job ini' });
    return;
  }
  res.sendFile(audioPath);
});

app.get('/api/jobs/:id/download', (req, res) => {
  const job = jobManager.getJob(req.params.id);
  const videoPath = jobManager.getVideoPath(req.params.id);
  if (!job || !videoPath) {
    res.status(404).json({ error: 'Video MP4 belum tersedia' });
    return;
  }
  res.download(videoPath, sanitizeDownloadName(job.originalName, '.mp4'));
});

app.delete('/api/jobs/:id', (req, res) => {
  try {
    const deleted = jobManager.deleteJob(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Job tidak ditemukan' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// Serve built Vite frontend in production mode (no-store on index.html so UI rebuilds apply on refresh)
if (fs.existsSync(DIST_WEB_DIR)) {
  app.use(express.static(DIST_WEB_DIR, { index: false }));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(DIST_WEB_DIR, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`PianoMotion Server listening at http://${displayHost}:${PORT} (bind: ${HOST})`);
});
