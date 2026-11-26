import fs from 'node:fs';
import path from 'node:path';
import pkg from '@tonejs/midi';

const { Midi } = pkg;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/midi-to-notes.mjs <input.mid> [output.json] [--fps=30] [--audio=song.mp3]');
  process.exit(args.length === 0 ? 1 : 0);
}

const positional = args.filter((arg) => !arg.startsWith('--'));
const inputPath = path.resolve(positional[0]);
const outputPath = path.resolve(positional[1] ?? 'data/notes.json');

const fpsArg = args.find((arg) => arg.startsWith('--fps='));
const fps = fpsArg ? Number(fpsArg.split('=')[1]) : 30;
if (!Number.isFinite(fps) || fps <= 0) {
  console.error('Invalid --fps value.');
  process.exit(1);
}

const audioArg = args.find((arg) => arg.startsWith('--audio='));
const audioFile = audioArg ? audioArg.split('=')[1] : undefined;

const midiBuffer = fs.readFileSync(inputPath);
const midi = new Midi(midiBuffer);

const nonEmptyTracks = midi.tracks.filter((track) => track.notes.length > 0);
const isMultiTrack = nonEmptyTracks.length > 1;

const notes = nonEmptyTracks
  .flatMap((track, trackIdx) =>
    track.notes
      .filter((note) => note.midi >= 21 && note.midi <= 108)
      .map((note) => ({
        pitch: note.midi,
        name: note.name,
        startTime: Number(note.time.toFixed(4)),
        endTime: Number((note.time + note.duration).toFixed(4)),
        velocity: Number(Math.min(Math.max(note.velocity, 0), 1).toFixed(3)),
        ...(isMultiTrack ? { track: trackIdx } : {}),
      }))
  )
  .sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);

const maxEndTime = notes.reduce((max, n) => Math.max(max, n.endTime), 0);
const durationInSeconds = Number(Math.max(midi.duration, maxEndTime, 1).toFixed(2));

const payload = {
  fps,
  durationInSeconds,
  ...(audioFile ? { audioFile } : {}),
  title: midi.name || path.basename(inputPath, path.extname(inputPath)),
  notes,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
console.log(`Converted ${notes.length} notes (${durationInSeconds}s @ ${fps}fps) -> ${outputPath}`);
