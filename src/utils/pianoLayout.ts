import type { NoteEvent } from '../types/notes';

export const MIDI_MIN = 21; // A0
export const MIDI_MAX = 108; // C8
export const WHITE_KEY_COUNT = 52;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

// Slight realistic lateral offset relative to the white-key boundary (in white-key-width units)
const BLACK_KEY_OFFSETS: Record<number, number> = {
  1: -0.05, // C#
  3: 0.05, // D#
  6: -0.06, // F#
  8: 0.0, // G#
  10: 0.06, // A#
};

export interface PianoKeyMeta {
  pitch: number;
  name: string;
  octave: number;
  semitone: number;
  isBlack: boolean;
  /** Normalized X coordinate of the left edge (0..1) */
  x: number;
  /** Normalized width (0..1) */
  width: number;
  /** Normalized center X coordinate (0..1) */
  centerX: number;
}

export interface ActiveKeyState {
  note: NoteEvent;
  /** 0..1 progress across the note's duration */
  progress: number;
  /** 0..1 attack envelope during the initial press */
  attack: number;
}

export interface FallingNoteItem {
  note: NoteEvent;
  keyMeta: PianoKeyMeta;
  /** Top position in pixels inside the falling-notes stage */
  top: number;
  /** Height in pixels inside the falling-notes stage */
  height: number;
  /** Whether the note is currently touching/pressing the key */
  isActive: boolean;
}

export function midiToNoteName(pitch: number): string {
  const semitone = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[semitone]}${octave}`;
}

export function buildPianoKeys(): PianoKeyMeta[] {
  const keys: PianoKeyMeta[] = [];
  const whiteWidth = 1 / WHITE_KEY_COUNT;
  const blackWidth = whiteWidth * 0.62;
  let whiteIndex = 0;

  for (let pitch = MIDI_MIN; pitch <= MIDI_MAX; pitch++) {
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

  return keys;
}

export const PIANO_KEYS = buildPianoKeys();
export const PIANO_KEY_BY_PITCH = new Map<number, PianoKeyMeta>(
  PIANO_KEYS.map((key) => [key.pitch, key])
);

export function getActiveKeysAtTime(
  notes: NoteEvent[],
  currentTime: number
): Map<number, ActiveKeyState> {
  const active = new Map<number, ActiveKeyState>();

  for (const note of notes) {
    if (note.pitch < MIDI_MIN || note.pitch > MIDI_MAX) {
      continue;
    }
    if (currentTime >= note.startTime && currentTime <= note.endTime) {
      const duration = Math.max(note.endTime - note.startTime, 0.01);
      const elapsed = currentTime - note.startTime;
      const progress = Math.min(Math.max(elapsed / duration, 0), 1);
      const attack = Math.min(elapsed / 0.08, 1);

      const existing = active.get(note.pitch);
      if (!existing || note.velocity >= existing.note.velocity) {
        active.set(note.pitch, { note, progress, attack });
      }
    }
  }

  return active;
}

export function getVisibleFallingNotes(
  notes: NoteEvent[],
  currentTime: number,
  stageHeight: number,
  lookaheadSeconds = 2.6
): FallingNoteItem[] {
  const windowEnd = currentTime + lookaheadSeconds;
  const visible: FallingNoteItem[] = [];

  for (const note of notes) {
    if (note.endTime < currentTime || note.startTime > windowEnd) {
      continue;
    }

    const keyMeta = PIANO_KEY_BY_PITCH.get(note.pitch);
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
      keyMeta,
      top: Math.max(0, bottomY - height),
      height,
      isActive: currentTime >= note.startTime && currentTime <= note.endTime,
    });
  }

  return visible;
}
