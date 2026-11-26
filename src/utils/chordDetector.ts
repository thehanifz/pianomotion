import type { ActiveKeyState } from './pianoLayout';

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

interface ChordTemplate {
  suffix: string;
  intervals: number[];
  priority: number;
}

const CHORD_TEMPLATES: ChordTemplate[] = [
  { suffix: '', intervals: [0, 4, 7], priority: 10 },
  { suffix: 'm', intervals: [0, 3, 7], priority: 10 },
  { suffix: 'maj7', intervals: [0, 4, 7, 11], priority: 9 },
  { suffix: 'm7', intervals: [0, 3, 7, 10], priority: 9 },
  { suffix: '7', intervals: [0, 4, 7, 10], priority: 8 },
  { suffix: 'sus2', intervals: [0, 2, 7], priority: 7 },
  { suffix: 'sus4', intervals: [0, 5, 7], priority: 7 },
  { suffix: 'add9', intervals: [0, 2, 4, 7], priority: 6 },
  { suffix: 'm(add9)', intervals: [0, 2, 3, 7], priority: 6 },
  { suffix: 'dim', intervals: [0, 3, 6], priority: 5 },
];

export type ActiveHudDisplay =
  | { mode: 'empty' }
  | { mode: 'notes'; notes: ActiveKeyState[] }
  | { mode: 'chord'; label: string; totalCount: number }
  | { mode: 'summary'; notes: ActiveKeyState[]; overflow: number };

function detectChordLabel(states: ActiveKeyState[]): string | null {
  const allByPitch = [...states].sort((a, b) => a.note.pitch - b.note.pitch);
  const lowestNote = allByPitch[0];

  // Filter out stale sustain tails so chord detection focuses on fresh/strong notes,
  // while preserving the active bass anchor so root notes aren't dropped mid-bar.
  let focused = states.filter((s) => s.elapsed <= 2.2 || s.note.velocity >= 0.42);
  if (lowestNote && (lowestNote.elapsed <= 5.0 || lowestNote.note.velocity >= 0.25)) {
    if (!focused.some((s) => s.note.pitch === lowestNote.note.pitch)) {
      focused = [lowestNote, ...focused];
    }
  }
  if (focused.length < 3) {
    focused = [...states]
      .sort((a, b) => a.elapsed - b.elapsed || b.note.velocity - a.note.velocity)
      .slice(0, 5);
  }

  const sortedByPitch = [...focused].sort((a, b) => a.note.pitch - b.note.pitch);
  const bassPc = sortedByPitch[0].note.pitch % 12;
  const pitchClasses = new Set(sortedByPitch.map((s) => s.note.pitch % 12));

  if (pitchClasses.size < 3 || pitchClasses.size > 6) {
    return null;
  }

  let bestScore = -1;
  let bestLabel: string | null = null;

  for (const rootPc of pitchClasses) {
    const relative = new Set(
      Array.from(pitchClasses).map((pc) => (pc - rootPc + 12) % 12)
    );

    for (const tpl of CHORD_TEMPLATES) {
      const matched = tpl.intervals.filter((iv) => relative.has(iv)).length;
      if (matched < tpl.intervals.length) {
        continue;
      }
      const extraNotes = relative.size - tpl.intervals.length;
      if (extraNotes > 1) {
        continue;
      }

      const rootBonus = rootPc === bassPc ? 4 : 0;
      const score = tpl.priority * 2 + rootBonus - extraNotes * 5;
      if (score > bestScore) {
        bestScore = score;
        const base = `${PC_NAMES[rootPc]}${tpl.suffix}`;
        bestLabel = rootPc === bassPc ? base : `${base}/${PC_NAMES[bassPc]}`;
      }
    }
  }

  return bestLabel;
}

export function buildActiveHudDisplay(
  activeMap: Map<number, ActiveKeyState>,
  maxNotesBeforeChord = 4,
  enableChordDetection = true
): ActiveHudDisplay {
  const sorted = Array.from(activeMap.values()).sort(
    (a, b) => a.note.pitch - b.note.pitch
  );

  if (sorted.length === 0) {
    return { mode: 'empty' };
  }

  if (sorted.length <= maxNotesBeforeChord) {
    return { mode: 'notes', notes: sorted };
  }

  if (enableChordDetection) {
    const chord = detectChordLabel(sorted);
    if (chord) {
      return { mode: 'chord', label: chord, totalCount: sorted.length };
    }
  }

  const prioritized = [...sorted]
    .sort((a, b) => a.elapsed - b.elapsed || b.note.velocity - a.note.velocity)
    .slice(0, Math.min(3, maxNotesBeforeChord))
    .sort((a, b) => a.note.pitch - b.note.pitch);

  return {
    mode: 'summary',
    notes: prioritized,
    overflow: sorted.length - prioritized.length,
  };
}
