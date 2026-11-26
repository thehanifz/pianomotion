import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import {
  PIANO_MOTION_DEFAULT_THEME,
  PianoMotionComposition,
} from '../../src/components/PianoMotionComposition';
import type {
  BackgroundMode,
  BackgroundPreset,
  KeyboardRangeMode,
  NotesData,
  PianoMotionThemeConfig,
  WatermarkPosition,
} from '../../src/types/notes';

interface SensitivitySettings {
  onsetThreshold: number;
  frameThreshold: number;
  offsetThreshold: number;
  minVelocity: number;
  minDuration: number;
  maxDuration: number | null;
}

interface JobThemeSettings {
  keyboardRangeMode: KeyboardRangeMode;
  watermarkText: string;
  watermarkPosition: WatermarkPosition;
  watermarkOpacity: number;
  backgroundMode: BackgroundMode;
  backgroundPreset: BackgroundPreset;
  backgroundColor: string;
  backgroundDim: number;
  backgroundBlur: number;
  enableParticles: boolean;
  enableDust: boolean;
  enableSpectrum: boolean;
  enableBreathingBg: boolean;
  enableChordDetection: boolean;
  showActiveHud: boolean;
}

interface NoteStats {
  totalNotes: number;
  medianDuration: number;
  maxDuration: number;
  durationInSeconds: number;
}

type JobStage =
  | 'queued'
  | 'transcribing'
  | 'ready'
  | 'rendering'
  | 'completed'
  | 'failed';

interface JobRecord {
  id: string;
  originalName: string;
  title: string;
  inputType: 'audio' | 'midi';
  backgroundImageFile?: string | null;
  watermarkLogoFile?: string | null;
  stage: JobStage;
  progress: number;
  statusMessage: string;
  error: string | null;
  createdAt: string;
  settings: SensitivitySettings;
  theme?: Partial<JobThemeSettings>;
  stats: NoteStats | null;
  hasNotes: boolean;
  hasVideo: boolean;
  logs: string[];
}

const DEFAULT_JOB_THEME: JobThemeSettings = {
  keyboardRangeMode: PIANO_MOTION_DEFAULT_THEME.keyboardRangeMode,
  watermarkText: PIANO_MOTION_DEFAULT_THEME.watermarkText,
  watermarkPosition: PIANO_MOTION_DEFAULT_THEME.watermarkPosition,
  watermarkOpacity: PIANO_MOTION_DEFAULT_THEME.watermarkOpacity,
  backgroundMode: PIANO_MOTION_DEFAULT_THEME.backgroundMode,
  backgroundPreset: PIANO_MOTION_DEFAULT_THEME.backgroundPreset,
  backgroundColor: PIANO_MOTION_DEFAULT_THEME.backgroundColor,
  backgroundDim: PIANO_MOTION_DEFAULT_THEME.backgroundDim,
  backgroundBlur: PIANO_MOTION_DEFAULT_THEME.backgroundBlur,
  enableParticles: PIANO_MOTION_DEFAULT_THEME.enableParticles,
  enableDust: PIANO_MOTION_DEFAULT_THEME.enableDust,
  enableSpectrum: PIANO_MOTION_DEFAULT_THEME.enableSpectrum,
  enableBreathingBg: PIANO_MOTION_DEFAULT_THEME.enableBreathingBg,
  enableChordDetection: PIANO_MOTION_DEFAULT_THEME.enableChordDetection,
  showActiveHud: PIANO_MOTION_DEFAULT_THEME.showActiveHud,
};

const PRESETS: Record<string, { label: string; desc: string; settings: SensitivitySettings }> = {
  strict: {
    label: 'Ketat',
    desc: 'Minim ghost note & ekor sustain pendek',
    settings: {
      onsetThreshold: 0.45,
      frameThreshold: 0.32,
      offsetThreshold: 0.4,
      minVelocity: 0.28,
      minDuration: 0.08,
      maxDuration: 4.5,
    },
  },
  balanced: {
    label: 'Seimbang',
    desc: 'Rekomendasi umum untuk piano solo',
    settings: {
      onsetThreshold: 0.38,
      frameThreshold: 0.25,
      offsetThreshold: 0.35,
      minVelocity: 0.22,
      minDuration: 0.06,
      maxDuration: null,
    },
  },
  sensitive: {
    label: 'Sensitif',
    desc: 'Tangkap not pelan & detail halus',
    settings: {
      onsetThreshold: 0.28,
      frameThreshold: 0.16,
      offsetThreshold: 0.28,
      minVelocity: 0.14,
      minDuration: 0.04,
      maxDuration: null,
    },
  },
};

const BG_PRESET_OPTIONS: Array<{ id: BackgroundPreset; label: string; color: string }> = [
  { id: 'midnight-navy', label: 'Midnight Navy', color: '#152039' },
  { id: 'warm-espresso', label: 'Warm Espresso', color: '#2d1f18' },
  { id: 'deep-forest', label: 'Deep Forest', color: '#112a22' },
  { id: 'velvet-plum', label: 'Velvet Plum', color: '#281633' },
  { id: 'pure-obsidian', label: 'Pure Obsidian', color: '#171a21' },
];

const WATERMARK_POSITIONS: Array<{ id: WatermarkPosition; label: string }> = [
  { id: 'bottom-right', label: 'Pojok Kanan Bawah' },
  { id: 'bottom-left', label: 'Pojok Kiri Bawah' },
  { id: 'top-right', label: 'Pojok Kanan Atas' },
  { id: 'top-left', label: 'Pojok Kiri Atas' },
  { id: 'center-stage', label: 'Tengah Atas' },
  { id: 'random-drift', label: 'Acak (Berpindah Halus)' },
];

type SidebarTab = 'input' | 'appearance';

const STORAGE_KEY = 'pianomotion:prefs:v1';

interface StoredPrefs {
  settings?: Partial<SensitivitySettings>;
  showAdvanced?: boolean;
  theme?: Partial<JobThemeSettings>;
  activeJobId?: string | null;
  sidebarTab?: SidebarTab;
  showLogs?: boolean;
}

function loadStoredPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPrefs) : {};
  } catch {
    return {};
  }
}

function saveStoredPrefs(prefs: StoredPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

function settingsMatch(a: SensitivitySettings, b: SensitivitySettings): boolean {
  return (
    Math.abs(a.onsetThreshold - b.onsetThreshold) < 0.001 &&
    Math.abs(a.frameThreshold - b.frameThreshold) < 0.001 &&
    Math.abs(a.offsetThreshold - b.offsetThreshold) < 0.001 &&
    Math.abs(a.minVelocity - b.minVelocity) < 0.001 &&
    Math.abs(a.minDuration - b.minDuration) < 0.001 &&
    a.maxDuration === b.maxDuration
  );
}

const ACCEPTED_MEDIA =
  '.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus,.webm,.wma,.mid,.midi,audio/*';
const ACCEPTED_IMAGES = '.png,.jpg,.jpeg,.webp,.svg,image/*';

export const App: React.FC = () => {
  const initialPrefs = useMemo(() => loadStoredPrefs(), []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bgImageInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const themeSyncTimerRef = useRef<number | null>(null);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(
    initialPrefs.sidebarTab === 'appearance' ? 'appearance' : 'input'
  );
  const [showLogs, setShowLogs] = useState<boolean>(Boolean(initialPrefs.showLogs));

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [settings, setSettings] = useState<SensitivitySettings>({
    ...PRESETS.balanced.settings,
    ...initialPrefs.settings,
  });
  const [showAdvanced, setShowAdvanced] = useState<boolean>(
    Boolean(initialPrefs.showAdvanced)
  );
  const [theme, setTheme] = useState<JobThemeSettings>({
    ...DEFAULT_JOB_THEME,
    ...initialPrefs.theme,
  });

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(
    initialPrefs.activeJobId ?? null
  );
  const [notesData, setNotesData] = useState<NotesData | null>(null);
  const [serverOk, setServerOk] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);

  const activeJob = useMemo(
    () => jobs.find((j) => j.id === activeJobId) ?? null,
    [jobs, activeJobId]
  );

  useEffect(() => {
    saveStoredPrefs({
      settings,
      showAdvanced,
      theme,
      activeJobId,
      sidebarTab,
      showLogs,
    });
  }, [settings, showAdvanced, theme, activeJobId, sidebarTab, showLogs]);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: JobRecord[] };
      setJobs(data.jobs);
      setActiveJobId((prev) => {
        if (prev && data.jobs.some((j) => j.id === prev)) {
          return prev;
        }
        return data.jobs[0]?.id ?? null;
      });
    } catch {
      // Ignore transient errors
    }
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => setServerOk(r.ok))
      .catch(() => setServerOk(false));
    void refreshJobs();
  }, [refreshJobs]);

  const activeHasNotes = activeJob?.hasNotes ?? false;
  const activeTotalNotes = activeJob?.stats?.totalNotes ?? 0;

  useEffect(() => {
    if (!activeJobId || !activeHasNotes) {
      setNotesData(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/jobs/${activeJobId}/notes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: NotesData | null) => {
        if (!cancelled && data) {
          setNotesData(data);
        }
      })
      .catch(() => {
        if (!cancelled) setNotesData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeJobId, activeHasNotes, activeTotalNotes]);

  useEffect(() => {
    if (!activeJobId) return;
    const es = new EventSource(`/api/jobs/${activeJobId}/events`);
    es.onmessage = (event) => {
      try {
        const updated = JSON.parse(event.data) as JobRecord;
        setJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === updated.id);
          if (idx === -1) return [updated, ...prev];
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        });
      } catch {
        // Ignore parse error
      }
    };
    return () => {
      es.close();
    };
  }, [activeJobId]);

  useEffect(() => {
    if (!activeJob) return;
    setSettings(activeJob.settings);
    if (activeJob.theme) {
      setTheme({ ...DEFAULT_JOB_THEME, ...activeJob.theme });
    }
  }, [activeJob?.id]);

  const updateTheme = (patch: Partial<JobThemeSettings>) => {
    setTheme((prev) => {
      const next = { ...prev, ...patch };
      if (activeJobId) {
        if (themeSyncTimerRef.current) {
          window.clearTimeout(themeSyncTimerRef.current);
        }
        themeSyncTimerRef.current = window.setTimeout(() => {
          fetch(`/api/jobs/${activeJobId}/theme`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((payload: { job?: JobRecord } | null) => {
              if (payload?.job) {
                setJobs((list) =>
                  list.map((j) => (j.id === payload.job!.id ? payload.job! : j))
                );
              }
            })
            .catch(() => {});
        }, 250);
      }
      return next;
    });
  };

  const handleUploadAsset = async (kind: 'background' | 'logo', file: File) => {
    if (!activeJobId) {
      setUiError('Upload atau pilih lagu terlebih dahulu sebelum mengunggah gambar.');
      return;
    }
    setUiError(null);
    setIsUploadingAsset(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);
      formData.append('saveAsDefault', 'true');

      const res = await fetch(`/api/jobs/${activeJobId}/assets`, {
        method: 'POST',
        body: formData,
      });
      const payload = (await res.json()) as { job?: JobRecord; error?: string };
      if (!res.ok || !payload.job) {
        throw new Error(payload.error || 'Gagal mengunggah gambar');
      }
      setJobs((prev) => prev.map((j) => (j.id === payload.job!.id ? payload.job! : j)));
      if (payload.job.theme) {
        setTheme({ ...DEFAULT_JOB_THEME, ...payload.job.theme });
      }
    } catch (err) {
      setUiError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const handleRemoveAsset = async (kind: 'background' | 'logo') => {
    if (!activeJobId) return;
    setUiError(null);
    try {
      const res = await fetch(`/api/jobs/${activeJobId}/assets/${kind}?clearDefault=true`, {
        method: 'DELETE',
      });
      const payload = (await res.json()) as { job?: JobRecord; error?: string };
      if (!res.ok || !payload.job) {
        throw new Error(payload.error || 'Gagal menghapus aset');
      }
      setJobs((prev) => prev.map((j) => (j.id === payload.job!.id ? payload.job! : j)));
      if (payload.job.theme) {
        setTheme({ ...DEFAULT_JOB_THEME, ...payload.job.theme });
      }
    } catch (err) {
      setUiError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile) return;
    setUiError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('settings', JSON.stringify(settings));
      formData.append('theme', JSON.stringify(theme));
      formData.append('inheritDefaultAssets', 'true');

      const res = await fetch('/api/jobs', {
        method: 'POST',
        body: formData,
      });
      const payload = (await res.json()) as { job?: JobRecord; error?: string };
      if (!res.ok || !payload.job) {
        throw new Error(payload.error || 'Gagal mengunggah file');
      }

      setJobs((prev) => [payload.job!, ...prev]);
      setActiveJobId(payload.job.id);
      setSelectedFile(null);
    } catch (err) {
      setUiError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReprocess = async () => {
    if (!activeJob) return;
    setUiError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/jobs/${activeJob.id}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload = (await res.json()) as { job?: JobRecord; error?: string };
      if (!res.ok || !payload.job) {
        throw new Error(payload.error || 'Gagal memproses ulang');
      }
      setJobs((prev) => prev.map((j) => (j.id === payload.job!.id ? payload.job! : j)));
    } catch (err) {
      setUiError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenderMp4 = async () => {
    if (!activeJob) return;
    setUiError(null);

    try {
      await fetch(`/api/jobs/${activeJob.id}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme),
      });

      const res = await fetch(`/api/jobs/${activeJob.id}/render`, { method: 'POST' });
      const payload = (await res.json()) as { job?: JobRecord; error?: string };
      if (!res.ok || !payload.job) {
        throw new Error(payload.error || 'Gagal memulai render video');
      }
      setJobs((prev) => prev.map((j) => (j.id === payload.job!.id ? payload.job! : j)));
    } catch (err) {
      setUiError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || 'Gagal menghapus job');
      }
      setJobs((prev) => {
        const next = prev.filter((j) => j.id !== jobId);
        if (activeJobId === jobId) {
          setActiveJobId(next[0]?.id ?? null);
        }
        return next;
      });
    } catch (err) {
      setUiError(err instanceof Error ? err.message : String(err));
    }
  };

  const isBusy =
    activeJob?.stage === 'queued' ||
    activeJob?.stage === 'transcribing' ||
    activeJob?.stage === 'rendering';

  const activePresetKey =
    Object.entries(PRESETS).find(([, p]) => settingsMatch(p.settings, settings))?.[0] ??
    'custom';

  const playerDurationFrames = notesData
    ? Math.max(1, Math.round((notesData.durationInSeconds || 8) * (notesData.fps || 30)))
    : 240;

  const playerTheme: Partial<PianoMotionThemeConfig> = useMemo(
    () => ({
      ...theme,
      backgroundImageUrl:
        activeJob?.backgroundImageFile && activeJobId
          ? `/api/jobs/${activeJobId}/assets/background?v=${encodeURIComponent(
              activeJob.backgroundImageFile
            )}`
          : null,
      watermarkLogoUrl:
        activeJob?.watermarkLogoFile && activeJobId
          ? `/api/jobs/${activeJobId}/assets/logo?v=${encodeURIComponent(
              activeJob.watermarkLogoFile
            )}`
          : null,
    }),
    [theme, activeJob?.backgroundImageFile, activeJob?.watermarkLogoFile, activeJobId]
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-eyebrow">PianoMotion Studio</span>
          <h1 className="brand-title">Audio to Piano Visualizer</h1>
        </div>
        <div className="health-pill">
          <span className="dot-ok" style={{ opacity: serverOk ? 1 : 0.25 }} />
          <span>{serverOk ? 'Local Pipeline Ready' : 'Connecting...'}</span>
        </div>
      </header>

      {uiError && <div className="error-banner">{uiError}</div>}

      <div className="main-grid">
        {/* Left Sidebar: Tabbed Controls (Input/Sensitivity vs Watermark/BG) + History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="panel">
            <div className="sidebar-tabs">
              <button
                type="button"
                className={`sidebar-tab ${sidebarTab === 'input' ? 'active' : ''}`}
                onClick={() => setSidebarTab('input')}
              >
                Lagu &amp; Sensitivitas
              </button>
              <button
                type="button"
                className={`sidebar-tab ${sidebarTab === 'appearance' ? 'active' : ''}`}
                onClick={() => setSidebarTab('appearance')}
              >
                Watermark &amp; BG
              </button>
            </div>

            {sidebarTab === 'input' ? (
              <>
                <div
                  className={`dropzone ${isDragging ? 'dragging' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) setSelectedFile(dropped);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_MEDIA}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const picked = e.target.files?.[0];
                      if (picked) setSelectedFile(picked);
                    }}
                  />
                  <div className="dropzone-main">Pilih atau seret file lagu ke sini</div>
                  <div className="dropzone-sub">
                    MP3, WAV, FLAC, OGG, M4A, AAC, OPUS, WEBM, WMA, &amp; MIDI
                  </div>
                </div>

                {selectedFile && (
                  <div className="selected-file">
                    <span>
                      {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedFile(null)}
                    >
                      Batal
                    </button>
                  </div>
                )}

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                      Sensitivitas Pembacaan Not
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowAdvanced((v) => !v)}
                    >
                      {showAdvanced ? 'Tutup Slider' : 'Atur Detail'}
                    </button>
                  </div>

                  <div className="preset-row">
                    {Object.entries(PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        className={`preset-btn ${activePresetKey === key ? 'active' : ''}`}
                        onClick={() => setSettings(preset.settings)}
                        title={preset.desc}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                    {activePresetKey !== 'custom'
                      ? PRESETS[activePresetKey].desc
                      : 'Pengaturan sensitivitas kustom'}
                  </div>
                </div>

                {showAdvanced && (
                  <div className="slider-group">
                    <div className="slider-row">
                      <div className="slider-label">
                        <span>Min Velocity (filter not lemah)</span>
                        <span>{settings.minVelocity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={0.5}
                        step={0.01}
                        value={settings.minVelocity}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, minVelocity: Number(e.target.value) }))
                        }
                      />
                    </div>

                    <div className="slider-row">
                      <div className="slider-label">
                        <span>Min Duration (detik)</span>
                        <span>{settings.minDuration.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min={0.02}
                        max={0.25}
                        step={0.01}
                        value={settings.minDuration}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, minDuration: Number(e.target.value) }))
                        }
                      />
                    </div>

                    <div className="slider-row">
                      <div className="slider-label">
                        <span>Onset Threshold (deteksi tekan)</span>
                        <span>{settings.onsetThreshold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.15}
                        max={0.7}
                        step={0.01}
                        value={settings.onsetThreshold}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            onsetThreshold: Number(e.target.value),
                          }))
                        }
                      />
                    </div>

                    <div className="slider-row">
                      <div className="slider-label">
                        <span>Hold / Frame Threshold (sustain)</span>
                        <span>{settings.frameThreshold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.08}
                        max={0.55}
                        step={0.01}
                        value={settings.frameThreshold}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            frameThreshold: Number(e.target.value),
                          }))
                        }
                      />
                    </div>

                    <div className="slider-row">
                      <div className="slider-label">
                        <span>Offset Threshold (lepas tuts)</span>
                        <span>{settings.offsetThreshold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.15}
                        max={0.65}
                        step={0.01}
                        value={settings.offsetThreshold}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            offsetThreshold: Number(e.target.value),
                          }))
                        }
                      />
                    </div>

                    <div className="slider-row">
                      <div className="slider-label">
                        <span>Batas Durasi Maksimal</span>
                        <span>
                          {settings.maxDuration !== null
                            ? `${settings.maxDuration.toFixed(1)}s`
                            : 'Tanpa batas'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={0.5}
                        value={settings.maxDuration ?? 10}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSettings((s) => ({
                            ...s,
                            maxDuration: val >= 10 ? null : val,
                          }));
                        }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selectedFile || isSubmitting}
                  onClick={handleUploadAndProcess}
                >
                  {isSubmitting ? 'Mengunggah...' : 'Proses Lagu'}
                </button>

                {activeJob && activeJob.hasNotes && !selectedFile && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isBusy || isSubmitting}
                    onClick={handleReprocess}
                  >
                    Terapkan Sensitivitas pada Lagu Aktif
                  </button>
                )}
              </>
            ) : (
              /* Tab 2: Watermark, Custom Background, Zoom & Visual Effects */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="custom-card">
                  <div>
                    <label className="field-label">Teks Watermark</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="Contoh: @PianoMotionOfficial"
                      maxLength={80}
                      value={theme.watermarkText}
                      onChange={(e) => updateTheme({ watermarkText: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="field-label">Posisi Watermark</label>
                    <select
                      className="field-select"
                      value={theme.watermarkPosition}
                      onChange={(e) =>
                        updateTheme({
                          watermarkPosition: e.target.value as WatermarkPosition,
                        })
                      }
                    >
                      {WATERMARK_POSITIONS.map((pos) => (
                        <option key={pos.id} value={pos.id}>
                          {pos.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="slider-row">
                    <div className="slider-label">
                      <span>Opacity Watermark</span>
                      <span>{Math.round(theme.watermarkOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={theme.watermarkOpacity}
                      onChange={(e) =>
                        updateTheme({ watermarkOpacity: Number(e.target.value) })
                      }
                    />
                  </div>

                  <div>
                    <label className="field-label">Logo Watermark (Opsional)</label>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept={ACCEPTED_IMAGES}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void handleUploadAsset('logo', f);
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!activeJobId || isUploadingAsset}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {activeJob?.watermarkLogoFile ? 'Ganti Logo' : 'Upload Logo'}
                      </button>
                      {activeJob?.watermarkLogoFile && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void handleRemoveAsset('logo')}
                        >
                          Hapus Logo
                        </button>
                      )}
                    </div>
                    {!activeJobId && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                        Upload lagu dulu untuk mengunggah logo.
                      </div>
                    )}
                  </div>
                </div>

                <div className="custom-card">
                  <div>
                    <label className="field-label">Mode Background</label>
                    <div className="preset-row">
                      <button
                        type="button"
                        className={`preset-btn ${
                          theme.backgroundMode === 'preset' ? 'active' : ''
                        }`}
                        onClick={() => updateTheme({ backgroundMode: 'preset' })}
                      >
                        Preset
                      </button>
                      <button
                        type="button"
                        className={`preset-btn ${
                          theme.backgroundMode === 'custom-color' ? 'active' : ''
                        }`}
                        onClick={() => updateTheme({ backgroundMode: 'custom-color' })}
                      >
                        Warna
                      </button>
                      <button
                        type="button"
                        className={`preset-btn ${
                          theme.backgroundMode === 'image' ? 'active' : ''
                        }`}
                        onClick={() => updateTheme({ backgroundMode: 'image' })}
                      >
                        Gambar
                      </button>
                    </div>
                  </div>

                  {theme.backgroundMode === 'preset' && (
                    <div className="swatch-grid">
                      {BG_PRESET_OPTIONS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`swatch-btn ${
                            theme.backgroundPreset === item.id ? 'active' : ''
                          }`}
                          onClick={() =>
                            updateTheme({
                              backgroundMode: 'preset',
                              backgroundPreset: item.id,
                            })
                          }
                        >
                          <span
                            className="swatch-dot"
                            style={{ backgroundColor: item.color }}
                          />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {theme.backgroundMode === 'custom-color' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input
                        type="color"
                        value={theme.backgroundColor}
                        onChange={(e) =>
                          updateTheme({
                            backgroundMode: 'custom-color',
                            backgroundColor: e.target.value,
                          })
                        }
                        style={{
                          width: 48,
                          height: 36,
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      />
                      <span
                        style={{ fontSize: 13, fontFamily: 'monospace', color: '#cbd5e1' }}
                      >
                        {theme.backgroundColor.toUpperCase()}
                      </span>
                    </div>
                  )}

                  {theme.backgroundMode === 'image' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input
                        ref={bgImageInputRef}
                        type="file"
                        accept={ACCEPTED_IMAGES}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void handleUploadAsset('background', f);
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={!activeJobId || isUploadingAsset}
                          onClick={() => bgImageInputRef.current?.click()}
                        >
                          {activeJob?.backgroundImageFile
                            ? 'Ganti Gambar'
                            : 'Upload Gambar BG'}
                        </button>
                        {activeJob?.backgroundImageFile && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void handleRemoveAsset('background')}
                          >
                            Hapus Gambar
                          </button>
                        )}
                      </div>

                      <div className="slider-row">
                        <div className="slider-label">
                          <span>Kegelapan Overlay</span>
                          <span>{Math.round(theme.backgroundDim * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={0.92}
                          step={0.02}
                          value={theme.backgroundDim}
                          onChange={(e) =>
                            updateTheme({ backgroundDim: Number(e.target.value) })
                          }
                        />
                      </div>

                      <div className="slider-row">
                        <div className="slider-label">
                          <span>Blur Background</span>
                          <span>{theme.backgroundBlur}px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={20}
                          step={1}
                          value={theme.backgroundBlur}
                          onChange={(e) =>
                            updateTheme({ backgroundBlur: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="field-label">Zoom Tuts Keyboard</label>
                    <select
                      className="field-select"
                      value={theme.keyboardRangeMode}
                      onChange={(e) =>
                        updateTheme({
                          keyboardRangeMode: e.target.value as KeyboardRangeMode,
                        })
                      }
                    >
                      <option value="auto">Auto (Standar)</option>
                      <option value="49">49 Tuts</option>
                      <option value="61">61 Tuts</option>
                      <option value="76">76 Tuts</option>
                      <option value="88">88 Tuts</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label">Efek Visual</label>
                    <div className="chip-toggle-row">
                      <button
                        type="button"
                        className={`chip-toggle ${theme.enableParticles ? 'active' : ''}`}
                        onClick={() =>
                          updateTheme({ enableParticles: !theme.enableParticles })
                        }
                      >
                        Partikel
                      </button>
                      <button
                        type="button"
                        className={`chip-toggle ${theme.enableDust ? 'active' : ''}`}
                        onClick={() => updateTheme({ enableDust: !theme.enableDust })}
                      >
                        Debu Cahaya
                      </button>
                      <button
                        type="button"
                        className={`chip-toggle ${theme.enableSpectrum ? 'active' : ''}`}
                        onClick={() =>
                          updateTheme({ enableSpectrum: !theme.enableSpectrum })
                        }
                      >
                        Spektrum
                      </button>
                      <button
                        type="button"
                        className={`chip-toggle ${theme.enableBreathingBg ? 'active' : ''}`}
                        onClick={() =>
                          updateTheme({ enableBreathingBg: !theme.enableBreathingBg })
                        }
                      >
                        Latar Bernafas
                      </button>
                      <button
                        type="button"
                        className={`chip-toggle ${theme.showActiveHud ? 'active' : ''}`}
                        onClick={() =>
                          updateTheme({ showActiveHud: !theme.showActiveHud })
                        }
                      >
                        Pil ACTIVE
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <h2 className="panel-title">Riwayat Lagu ({jobs.length})</h2>
            {jobs.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Belum ada lagu yang diproses. Upload file untuk memulai.
              </div>
            ) : (
              <div className="jobs-list" style={{ maxHeight: 200 }}>
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`job-item ${job.id === activeJobId ? 'active' : ''}`}
                    onClick={() => setActiveJobId(job.id)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="job-name">{job.title}</div>
                      <div className="job-meta">
                        {job.stats ? `${job.stats.totalNotes} not` : job.inputType.toUpperCase()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`stage-badge stage-${job.stage}`}>{job.stage}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={
                          job.stage === 'transcribing' || job.stage === 'rendering'
                        }
                        onClick={(e) => handleDeleteJob(e, job.id)}
                        title="Hapus job"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Main Panel: Preview Player + Collapsible Log */}
        <section className="panel">
          <div className="action-bar">
            <div>
              <h2 className="panel-title" style={{ fontSize: 18 }}>
                {activeJob ? activeJob.title : 'Preview & Generate Video'}
              </h2>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                {activeJob
                  ? activeJob.statusMessage
                  : 'Upload dan klik Proses Lagu untuk melihat preview langsung di sini.'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-generate"
                disabled={!activeJob || !activeJob.hasNotes || isBusy}
                onClick={handleRenderMp4}
              >
                {activeJob?.stage === 'rendering'
                  ? `Generating (${activeJob.progress}%)...`
                  : 'Generate Video (.mp4)'}
              </button>

              {activeJob?.hasVideo && (
                <a
                  className="btn btn-download"
                  href={`/api/jobs/${activeJob.id}/download`}
                >
                  Download MP4
                </a>
              )}
            </div>
          </div>

          {activeJob && (isBusy || activeJob.progress > 0) && (
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>
          )}

          {activeJob?.error && <div className="error-banner">{activeJob.error}</div>}

          {activeJob?.stats && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Total Not Terdeteksi</div>
                <div className="stat-value">{activeJob.stats.totalNotes}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Median Durasi Tekan</div>
                <div className="stat-value">{activeJob.stats.medianDuration}s</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Durasi Terlama</div>
                <div className="stat-value">{activeJob.stats.maxDuration}s</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Panjang Lagu</div>
                <div className="stat-value">{activeJob.stats.durationInSeconds}s</div>
              </div>
            </div>
          )}

          <div className="player-frame">
            {notesData ? (
              <Player
                key={`${activeJob?.id}-${activeJob?.stats?.totalNotes}`}
                component={PianoMotionComposition}
                inputProps={{ data: notesData, theme: playerTheme }}
                durationInFrames={playerDurationFrames}
                fps={notesData.fps || 30}
                compositionWidth={1920}
                compositionHeight={1080}
                controls
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>
                {activeJob?.stage === 'transcribing'
                  ? 'Sedang menganalisis audio piano...'
                  : 'Preview visualisasi piano akan tampil di sini setelah lagu diproses.'}
              </div>
            )}
          </div>

          {activeJob && activeJob.logs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="logs-toggle"
                onClick={() => setShowLogs((v) => !v)}
              >
                <span>Log Proses ({activeJob.logs.length} baris)</span>
                <span>{showLogs ? '▾ Sembunyikan' : '▸ Tampilkan'}</span>
              </button>
              {showLogs && (
                <div className="logs-box">
                  {activeJob.logs.slice(-15).map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
