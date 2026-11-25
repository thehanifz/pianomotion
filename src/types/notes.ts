export interface NoteEvent {
  pitch: number;
  name: string;
  startTime: number;
  endTime: number;
  velocity: number;
}

export interface NotesData {
  fps: number;
  durationInSeconds: number;
  audioFile?: string | null;
  audioUrl?: string | null;
  title?: string;
  notes: NoteEvent[];
}
