export interface NoteEvent {
  pitch: number;
  name: string;
  startTime: number;
  endTime: number;
  velocity: number;
  track?: number;
}

export interface NotesData {
  fps: number;
  durationInSeconds: number;
  audioFile?: string | null;
  audioUrl?: string | null;
  title?: string;
  notes: NoteEvent[];
}

export type KeyboardRangeMode = 'auto' | '49' | '61' | '76' | '88';

export type WatermarkPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'
  | 'center-stage'
  | 'random-drift';

export type BackgroundMode = 'preset' | 'custom-color' | 'image';

export type BackgroundPreset =
  | 'midnight-navy'
  | 'warm-espresso'
  | 'deep-forest'
  | 'velvet-plum'
  | 'pure-obsidian';

export type PianoMotionThemeConfig = {
  keyboardRangeMode: KeyboardRangeMode;
  rangePaddingSemitones: number;
  bassMaxPitch: number;
  melodyMinPitch: number;
  lookaheadSeconds: number;
  enableParticles: boolean;
  particleCountPerOnset: number;
  enableDust: boolean;
  ambientDustCount: number;
  enableSpectrum: boolean;
  enableBreathingBg: boolean;
  enableChordDetection: boolean;
  maxActiveNotesBeforeChord: number;
  showActiveHud: boolean;
  watermarkText: string;
  watermarkLogoUrl: string | null;
  watermarkPosition: WatermarkPosition;
  watermarkOpacity: number;
  backgroundMode: BackgroundMode;
  backgroundPreset: BackgroundPreset;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  backgroundDim: number;
  backgroundBlur: number;
};
