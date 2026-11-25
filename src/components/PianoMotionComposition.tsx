import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { NotesData } from '../types/notes';
import { getActiveKeysAtTime } from '../utils/pianoLayout';
import { AudioSpectrum } from './AudioSpectrum';
import { PianoKeyboard } from './PianoKeyboard';

export type PianoMotionProps = {
  data: NotesData;
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

export const PianoMotionComposition: React.FC<PianoMotionProps> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const activeKeys = getActiveKeysAtTime(data.notes, currentTime);
  const activeNames = Array.from(activeKeys.values())
    .sort((a, b) => a.note.pitch - b.note.pitch)
    .map((item) => item.note.name);

  const audioSrc = data.audioUrl
    ? data.audioUrl
    : data.audioFile
    ? staticFile(data.audioFile)
    : null;

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse at 50% 25%, #162038 0%, #0b1120 55%, #050811 100%)',
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
      {audioSrc ? <Audio src={audioSrc} /> : null}

      {/* Top HUD: Title, Active Notes, Timecode */}
      <div
        style={{
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
            PianoMotion Visualizer
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

        {/* Active Notes Pill Readout */}
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
          {activeNames.length > 0 ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {activeNames.slice(0, 8).map((name, idx) => (
                <span
                  key={`${name}-${idx}`}
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: name.includes('#') ? '#e9d5ff' : '#bae6fd',
                    backgroundColor: name.includes('#')
                      ? 'rgba(192, 132, 252, 0.2)'
                      : 'rgba(56, 189, 248, 0.2)',
                    padding: '3px 10px',
                    borderRadius: 999,
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 14, color: '#64748b' }}>—</span>
          )}
        </div>

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

      {/* Main Stage: Thin Audio Spectrum + Falling Notes + 88-Key Piano */}
      <PianoKeyboard
        notes={data.notes}
        currentTime={currentTime}
        width={1792}
        keyboardHeight={290}
        stageHeight={485}
        lookaheadSeconds={2.6}
        backgroundSlot={
          audioSrc ? (
            <AudioSpectrum audioSrc={audioSrc} width={1792} height={150} barCount={64} />
          ) : null
        }
      />
    </AbsoluteFill>
  );
};
