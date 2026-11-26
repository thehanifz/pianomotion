import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { NotesData, PianoMotionThemeConfig } from '../types/notes';
import { buildActiveHudDisplay } from '../utils/chordDetector';
import {
  ROLE_PALETTES,
  buildTrackRoleMap,
  getActiveKeysAtTime,
  getSmoothedMusicEnergy,
  resolveKeyboardLayout,
} from '../utils/pianoLayout';
import { AmbientBackdrop } from './AmbientBackdrop';
import { AudioSpectrum } from './AudioSpectrum';
import { PianoKeyboard } from './PianoKeyboard';
import { WatermarkOverlay } from './WatermarkOverlay';

export const PIANO_MOTION_DEFAULT_THEME: PianoMotionThemeConfig = {
  keyboardRangeMode: 'auto',
  rangePaddingSemitones: 0,
  bassMaxPitch: 54,
  melodyMinPitch: 72,
  lookaheadSeconds: 2.6,
  enableParticles: true,
  particleCountPerOnset: 5,
  enableDust: true,
  ambientDustCount: 24,
  enableSpectrum: true,
  enableBreathingBg: true,
  enableChordDetection: true,
  maxActiveNotesBeforeChord: 4,
  showActiveHud: true,
  watermarkText: '',
  watermarkLogoUrl: null,
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.72,
  backgroundMode: 'preset',
  backgroundPreset: 'midnight-navy',
  backgroundColor: '#0a101f',
  backgroundImageUrl: null,
  backgroundDim: 0.62,
  backgroundBlur: 4,
};

export type PianoMotionProps = {
  data: NotesData;
  theme?: Partial<PianoMotionThemeConfig>;
};

function formatTimecode(seconds: number): string {
  const totalCentis = Math.max(0, Math.round(seconds * 100));
  const mins = Math.floor(totalCentis / 6000);
  const secs = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(
    centis
  ).padStart(2, '0')}`;
}

export const PianoMotionComposition: React.FC<PianoMotionProps> = ({ data, theme }) => {
  const cfg: PianoMotionThemeConfig = {
    ...PIANO_MOTION_DEFAULT_THEME,
    ...theme,
  };

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const layout = useMemo(
    () => resolveKeyboardLayout(data.notes, cfg.keyboardRangeMode, cfg.rangePaddingSemitones),
    [data.notes, cfg.keyboardRangeMode, cfg.rangePaddingSemitones]
  );

  const trackRoleMap = useMemo(() => buildTrackRoleMap(data.notes), [data.notes]);

  const activeMap = getActiveKeysAtTime(
    data.notes,
    currentTime,
    layout,
    trackRoleMap,
    cfg.bassMaxPitch,
    cfg.melodyMinPitch
  );

  const hudDisplay = buildActiveHudDisplay(
    activeMap,
    cfg.maxActiveNotesBeforeChord,
    cfg.enableChordDetection
  );

  const energy = getSmoothedMusicEnergy(data.notes, currentTime);

  const audioSrc = data.audioUrl
    ? data.audioUrl
    : data.audioFile
    ? staticFile(data.audioFile)
    : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#050811',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '44px 64px 52px',
        boxSizing: 'border-box',
      }}
    >
      <AmbientBackdrop
        currentTime={currentTime}
        energy={energy}
        enableBreathingBg={cfg.enableBreathingBg}
        enableDust={cfg.enableDust}
        dustCount={cfg.ambientDustCount}
        backgroundMode={cfg.backgroundMode}
        backgroundPreset={cfg.backgroundPreset}
        backgroundColor={cfg.backgroundColor}
        backgroundImageUrl={cfg.backgroundImageUrl}
        backgroundDim={cfg.backgroundDim}
        backgroundBlur={cfg.backgroundBlur}
      />

      {audioSrc ? <Audio src={audioSrc} /> : null}

      {/* Top HUD: Title, Active Notes / Chord, Timecode */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          width: 1792,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
          paddingBottom: 18,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: '#38bdf8',
            }}
          >
            PianoMotion · {layout.mode} Keys
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 700,
              color: '#f1f5f9',
            }}
          >
            {data.title ?? 'Piano Note Transcription'}
          </h1>
        </div>

        {/* Active Notes / Smart Chord Pill Readout */}
        {cfg.showActiveHud && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 42,
              padding: '6px 18px',
              borderRadius: 999,
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          >
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>ACTIVE</span>

            {hudDisplay.mode === 'empty' && (
              <span style={{ fontSize: 14, color: '#64748b' }}>—</span>
            )}

            {hudDisplay.mode === 'notes' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {hudDisplay.notes.map((item) => {
                  const pal = ROLE_PALETTES[item.role];
                  return (
                    <span
                      key={item.note.pitch}
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: pal.pillText,
                        backgroundColor: pal.pillBg,
                        padding: '3px 10px',
                        borderRadius: 999,
                      }}
                    >
                      {item.note.name}
                    </span>
                  );
                })}
              </div>
            )}

            {hudDisplay.mode === 'chord' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#f8fafc',
                    backgroundColor: 'rgba(56, 189, 248, 0.25)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    padding: '3px 12px',
                    borderRadius: 999,
                    letterSpacing: 0.4,
                  }}
                >
                  {hudDisplay.label}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                  {hudDisplay.totalCount} notes
                </span>
              </div>
            )}

            {hudDisplay.mode === 'summary' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {hudDisplay.notes.map((item) => {
                  const pal = ROLE_PALETTES[item.role];
                  return (
                    <span
                      key={item.note.pitch}
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: pal.pillText,
                        backgroundColor: pal.pillBg,
                        padding: '3px 9px',
                        borderRadius: 999,
                      }}
                    >
                      {item.note.name}
                    </span>
                  );
                })}
                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
                  +{hudDisplay.overflow}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Timecode */}
        <div
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: 24,
            fontWeight: 600,
            color: '#cbd5e1',
          }}
        >
          {formatTimecode(currentTime)}{' '}
          <span style={{ color: '#64748b', fontSize: 18 }}>
            / {formatTimecode(data.durationInSeconds)}
          </span>
        </div>
      </div>

      {/* Main Stage: Audio Spectrum + Falling Notes + Contact Glow + Sparks + Zoomed Piano */}
      <PianoKeyboard
        notes={data.notes}
        currentTime={currentTime}
        layout={layout}
        activeMap={activeMap}
        trackRoleMap={trackRoleMap}
        bassMaxPitch={cfg.bassMaxPitch}
        melodyMinPitch={cfg.melodyMinPitch}
        width={1792}
        keyboardHeight={295}
        stageHeight={480}
        lookaheadSeconds={cfg.lookaheadSeconds}
        enableParticles={cfg.enableParticles}
        particleCountPerOnset={cfg.particleCountPerOnset}
        backgroundSlot={
          audioSrc && cfg.enableSpectrum ? (
            <AudioSpectrum audioSrc={audioSrc} width={1792} height={120} barCount={64} />
          ) : null
        }
      />

      <WatermarkOverlay
        text={cfg.watermarkText}
        logoUrl={cfg.watermarkLogoUrl}
        position={cfg.watermarkPosition}
        opacity={cfg.watermarkOpacity}
        currentTime={currentTime}
      />
    </AbsoluteFill>
  );
};
