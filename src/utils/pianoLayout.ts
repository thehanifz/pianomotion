import type { KeyboardRangeMode, NoteEvent } from '../types/notes';

export const MIDI_MIN = 21; // A0
export const MIDI_MAX = 108; // C8

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

// Standard keyboard bounds (all start & end on white keys)
const KEYBOARD_PRESETS: Array<{ mode: Exclude<KeyboardRangeMode, 'auto'>; min: number; max: number }> = [
  { mode: '49', min: 36, max: 84 }, // C2..C6
  { mode: '61', min: 36, max: 96 }, // C2..C7
  { mode: '76', min: 28, max: 103 }, // E1..G7
  { mode: '88', min: 21, max: 108 }, // A0..C8
];

const BLACK_KEY_OFFSETS: Record<number, number> = {
  1: -0.05,
  3: 0.05,
  6: -0.06,
  8: 0.0,
  10: 0.06,
};

export type NoteRole = 'bass' | 'harmony' | 'melody';

export interface RolePalette {
  barTop: string;
  barBottom: string;
  keyTop: string;
  keyMain: string;
  keyDeep: string;
  glow: string;
  spark: string;
  pillBg: string;
  pillText: string;
}

export const ROLE_PALETTES: Record<NoteRole, RolePalette> = {
  bass: {
    barTop: '#818cf8',
    barBottom: '#4f46e5',
    keyTop: '#c7d2fe',
    keyMain: '#6366f1',
    keyDeep: '#3730a3',
    glow: 'rgba(99, 102, 241, 0.8)',
    spark: '#a5b4fc',
    pillBg: 'rgba(99, 102, 241, 0.24)',
    pillText: '#c7d2fe',
  },
  harmony: {
    barTop: '#7dd3fc',
    barBottom: '#0ea5e9',
    keyTop: '#bae6fd',
    keyMain: '#38bdf8',
    keyDeep: '#0284c7',
    glow: 'rgba(56, 189, 248, 0.78)',
    spark: '#bae6fd',
    pillBg: 'rgba(56, 189, 248, 0.22)',
    pillText: '#bae6fd',
  },
  melody: {
    barTop: '#fbcfe8',
    barBottom: '#ec4899',
    keyTop: '#fbcfe8',
    keyMain: '#f472b6',
    keyDeep: '#be185d',
    glow: 'rgba(244, 114, 182, 0.8)',
    spark: '#fbcfe8',
    pillBg: 'rgba(244, 114, 182, 0.24)',
    pillText: '#fbcfe8',
  },
};

export interface PianoKeyMeta {
  pitch: number;
  name: string;
  octave: number;
  semitone: number;
  isBlack: boolean;
  x: number;
  width: number;
  centerX: number;
}

export interface PianoRangeLayout {
  mode: Exclude<KeyboardRangeMode, 'auto'>;
  minPitch: number;
  maxPitch: number;
  whiteKeyCount: number;
  keys: PianoKeyMeta[];
  keyByPitch: Map<number, PianoKeyMeta>;
}

export interface ActiveKeyState {
  note: NoteEvent;
  role: NoteRole;
  elapsed: number;
  progress: number;
  /** 0..1 fast attack at onset */
  attack: number;
  /** 1..0.38 sustain brightness decay across hold */
  decay: number;
  /** 0..1 impact flash strength right after landing */
  impact: number;
}

export interface FallingNoteItem {
  note: NoteEvent;
  role: NoteRole;
  keyMeta: PianoKeyMeta;
  top: number;
  height: number;
  isActive: boolean;
}

export interface LandingSpark {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  color: string;
}

export function midiToNoteName(pitch: number): string {
  const semitone = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

export function resolveKeyboardLayout(
  notes: NoteEvent[],
  mode: KeyboardRangeMode = 'auto',
  paddingSemitones = 0
): PianoRangeLayout {
  let chosen = KEYBOARD_PRESETS[KEYBOARD_PRESETS.length - 1];

  if (mode !== 'auto') {
    chosen = KEYBOARD_PRESETS.find((p) => p.mode === mode) ?? chosen;
  } else if (notes.length > 0) {
    let minP = MIDI_MAX;
    let maxP = MIDI_MIN;
    for (const n of notes) {
      if (n.pitch >= MIDI_MIN && n.pitch <= MIDI_MAX) {
        if (n.pitch < minP) minP = n.pitch;
        if (n.pitch > maxP) maxP = n.pitch;
      }
    }
    const targetMin = minP - paddingSemitones;
    const targetMax = maxP + paddingSemitones;
    chosen =
      KEYBOARD_PRESETS.find((p) => targetMin >= p.min && targetMax <= p.max) ??
      KEYBOARD_PRESETS[KEYBOARD_PRESETS.length - 1];
  }

  let whiteKeyCount = 0;
  for (let p = chosen.min; p <= chosen.max; p++) {
    if (!BLACK_SEMITONES.has(p % 12)) {
      whiteKeyCount += 1;
    }
  }

  const whiteWidth = 1 / whiteKeyCount;
  const blackWidth = whiteWidth * 0.62;
  const keys: PianoKeyMeta[] = [];
  let whiteIndex = 0;

  for (let pitch = chosen.min; pitch <= chosen.max; pitch++) {
    const semitone = pitch % 12;
    const octave = Math.floor(pitch / 12) - 1;
    const isBlack = BLACK_SEMITONES.has(semitone);
    const name = midiToNoteName(pitch);

    if (!isBlack) {
      const x = whiteIndex * whiteWidth;
      keys.push({
        pitch,
        name,
        octave,
        semitone,
        isBlack: false,
        x,
        width: whiteWidth,
        centerX: x + whiteWidth / 2,
      });
      whiteIndex += 1;
    } else {
      const offset = (BLACK_KEY_OFFSETS[semitone] ?? 0) * whiteWidth;
      const centerX = whiteIndex * whiteWidth + offset;
      keys.push({
        pitch,
        name,
        octave,
        semitone,
        isBlack: true,
        x: centerX - blackWidth / 2,
        width: blackWidth,
        centerX,
      });
    }
  }

  return {
    mode: chosen.mode,
    minPitch: chosen.min,
    maxPitch: chosen.max,
    whiteKeyCount,
    keys,
    keyByPitch: new Map(keys.map((k) => [k.pitch, k])),
  };
}

export function buildTrackRoleMap(notes: NoteEvent[]): Map<number, NoteRole> | null {
  const sums = new Map<number, { sum: number; count: number }>();
  for (const n of notes) {
    if (n.track === undefined) continue;
    const cur = sums.get(n.track) ?? { sum: 0, count: 0 };
    cur.sum += n.pitch;
    cur.count += 1;
    sums.set(n.track, cur);
  }
  if (sums.size < 2) {
    return null;
  }
  const ordered = Array.from(sums.entries())
    .map(([track, stat]) => ({ track, avg: stat.sum / stat.count }))
    .sort((a, b) => a.avg - b.avg);

  const roleMap = new Map<number, NoteRole>();
  roleMap.set(ordered[0].track, 'bass');
  roleMap.set(ordered[ordered.length - 1].track, 'melody');
  for (let i = 1; i < ordered.length - 1; i++) {
    roleMap.set(ordered[i].track, 'harmony');
  }
  return roleMap;
}

export function classifyNoteRole(
  note: NoteEvent,
  trackRoleMap: Map<number, NoteRole> | null,
  bassMaxPitch: number,
  melodyMinPitch: number
): NoteRole {
  if (trackRoleMap && note.track !== undefined) {
    const mapped = trackRoleMap.get(note.track);
    if (mapped) {
      return mapped;
    }
  }
  if (note.pitch <= bassMaxPitch) return 'bass';
  if (note.pitch >= melodyMinPitch) return 'melody';
  return 'harmony';
}

export function getActiveKeysAtTime(
  notes: NoteEvent[],
  currentTime: number,
  layout: PianoRangeLayout,
  trackRoleMap: Map<number, NoteRole> | null,
  bassMaxPitch: number,
  melodyMinPitch: number
): Map<number, ActiveKeyState> {
  const active = new Map<number, ActiveKeyState>();

  for (const note of notes) {
    if (note.pitch < layout.minPitch || note.pitch > layout.maxPitch) {
      continue;
    }
    if (currentTime >= note.startTime && currentTime <= note.endTime) {
      const duration = Math.max(note.endTime - note.startTime, 0.01);
      const elapsed = Math.max(0, currentTime - note.startTime);
      const progress = Math.min(elapsed / duration, 1);
      const attack = Math.min(elapsed / 0.06, 1);
      const decay = 0.42 + 0.58 * Math.exp(-elapsed * 1.1);
      const impact = elapsed <= 0.22 ? Math.pow(1 - elapsed / 0.22, 1.8) : 0;

      const existing = active.get(note.pitch);
      if (!existing || elapsed < existing.elapsed || note.velocity > existing.note.velocity) {
        active.set(note.pitch, {
          note,
          role: classifyNoteRole(note, trackRoleMap, bassMaxPitch, melodyMinPitch),
          elapsed,
          progress,
          attack,
          decay,
          impact,
        });
      }
    }
  }

  return active;
}

export function getVisibleFallingNotes(
  notes: NoteEvent[],
  currentTime: number,
  stageHeight: number,
  layout: PianoRangeLayout,
  trackRoleMap: Map<number, NoteRole> | null,
  bassMaxPitch: number,
  melodyMinPitch: number,
  lookaheadSeconds = 2.6
): FallingNoteItem[] {
  const windowEnd = currentTime + lookaheadSeconds;
  const visible: FallingNoteItem[] = [];

  for (const note of notes) {
    if (note.endTime < currentTime || note.startTime > windowEnd) {
      continue;
    }
    const keyMeta = layout.keyByPitch.get(note.pitch);
    if (!keyMeta) {
      continue;
    }

    const clampedStart = Math.max(note.startTime, currentTime);
    const clampedEnd = Math.min(note.endTime, windowEnd);

    const bottomY =
      stageHeight - ((clampedStart - currentTime) / lookaheadSeconds) * stageHeight;
    const topY =
      stageHeight - ((clampedEnd - currentTime) / lookaheadSeconds) * stageHeight;
    const height = Math.max(bottomY - topY, 4);

    visible.push({
      note,
      role: classifyNoteRole(note, trackRoleMap, bassMaxPitch, melodyMinPitch),
      keyMeta,
      top: Math.max(0, bottomY - height),
      height,
      isActive: currentTime >= note.startTime && currentTime <= note.endTime,
    });
  }

  return visible;
}

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function getLandingSparks(
  notes: NoteEvent[],
  currentTime: number,
  layout: PianoRangeLayout,
  trackRoleMap: Map<number, NoteRole> | null,
  bassMaxPitch: number,
  melodyMinPitch: number,
  boardWidth: number,
  stageHeight: number,
  sparksPerOnset = 5
): LandingSpark[] {
  const lifetime = 0.42;
  const sparks: LandingSpark[] = [];

  for (const note of notes) {
    const elapsed = currentTime - note.startTime;
    if (elapsed < 0 || elapsed > lifetime) {
      continue;
    }
    const keyMeta = layout.keyByPitch.get(note.pitch);
    if (!keyMeta) {
      continue;
    }

    const role = classifyNoteRole(note, trackRoleMap, bassMaxPitch, melodyMinPitch);
    const palette = ROLE_PALETTES[role];
    const t = elapsed / lifetime;
    const easeOut = 1 - Math.pow(1 - t, 2.2);
    const baseAlpha = (1 - t) * (0.45 + note.velocity * 0.55);

    for (let i = 0; i < sparksPerOnset; i++) {
      const seed = note.pitch * 97 + Math.round(note.startTime * 1000) * 13 + i * 31;
      const spreadX = (seededUnit(seed) - 0.5) * 46;
      const riseY = 14 + seededUnit(seed + 7) * (36 + note.velocity * 44);
      const size = 2.5 + seededUnit(seed + 19) * (2.5 + note.velocity * 2);

      sparks.push({
        id: `${note.pitch}-${note.startTime}-${i}`,
        x: keyMeta.centerX * boardWidth + spreadX * easeOut,
        y: stageHeight - 4 - riseY * easeOut,
        size,
        opacity: baseAlpha * (0.65 + 0.35 * seededUnit(seed + 41)),
        color: palette.spark,
      });
    }
  }

  return sparks;
}

export function getSmoothedMusicEnergy(notes: NoteEvent[], currentTime: number): number {
  let energy = 0;
  for (const n of notes) {
    if (currentTime >= n.startTime - 0.15 && currentTime <= n.endTime + 0.15) {
      energy += n.velocity;
    }
  }
  return Math.min(energy / 4.5, 1);
}
