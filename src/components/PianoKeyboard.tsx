import React from 'react';
import {
  PIANO_KEYS,
  getActiveKeysAtTime,
  getVisibleFallingNotes,
} from '../utils/pianoLayout';
import type { NoteEvent } from '../types/notes';

interface PianoKeyboardProps {
  notes: NoteEvent[];
  currentTime: number;
  width?: number;
  keyboardHeight?: number;
  stageHeight?: number;
  lookaheadSeconds?: number;
  backgroundSlot?: React.ReactNode;
}

const WHITE_KEYS = PIANO_KEYS.filter((k) => !k.isBlack);
const BLACK_KEYS = PIANO_KEYS.filter((k) => k.isBlack);

const WHITE_ACTIVE_COLOR = '#38bdf8';
const WHITE_ACTIVE_GLOW = 'rgba(56, 189, 248, 0.7)';
const BLACK_ACTIVE_COLOR = '#c084fc';
const BLACK_ACTIVE_GLOW = 'rgba(192, 132, 252, 0.78)';

export const PianoKeyboard: React.FC<PianoKeyboardProps> = ({
  notes,
  currentTime,
  width = 1792,
  keyboardHeight = 290,
  stageHeight = 480,
  lookaheadSeconds = 2.6,
  backgroundSlot,
}) => {
  const activeMap = getActiveKeysAtTime(notes, currentTime);
  const fallingNotes = getVisibleFallingNotes(
    notes,
    currentTime,
    stageHeight,
    lookaheadSeconds
  );

  const whiteHeight = keyboardHeight;
  const blackHeight = Math.round(keyboardHeight * 0.61);

  return (
    <div
      style={{
        width,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
      }}
    >
      {/* Middle Stage: Subtle Audio Spectrum + Falling Notes Piano Roll */}
      <div
        style={{
          position: 'relative',
          width,
          height: stageHeight,
          overflow: 'hidden',
        }}
      >
        {/* Subtle vertical octave guide lines on every C key */}
        {WHITE_KEYS.filter((k) => k.semitone === 0).map((k) => (
          <div
            key={`guide-${k.pitch}`}
            style={{
              position: 'absolute',
              left: k.x * width,
              top: 0,
              bottom: 0,
              width: 1,
              background:
                'linear-gradient(180deg, rgba(148,163,184,0.0) 0%, rgba(148,163,184,0.14) 100%)',
              zIndex: 0,
            }}
          />
        ))}

        {/* Background layer (e.g., thin AudioSpectrum) */}
        {backgroundSlot}

        {/* Falling Note Bars aligned 1:1 with the 88 piano keys */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          {fallingNotes.map((item, idx) => {
            const { note, keyMeta, top, height, isActive } = item;
            const rawWidth = keyMeta.width * width;
            const barWidth = keyMeta.isBlack
              ? Math.max(6, rawWidth * 0.9)
              : Math.max(8, rawWidth * 0.78);
            const left = keyMeta.centerX * width - barWidth / 2;

            const baseTop = keyMeta.isBlack ? '#d8b4fe' : '#7dd3fc';
            const baseBottom = keyMeta.isBlack ? BLACK_ACTIVE_COLOR : WHITE_ACTIVE_COLOR;
            const glowColor = keyMeta.isBlack ? BLACK_ACTIVE_GLOW : WHITE_ACTIVE_GLOW;
            const opacity = isActive ? 0.96 : 0.68 + note.velocity * 0.24;

            return (
              <div
                key={`${note.pitch}-${note.startTime}-${idx}`}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: barWidth,
                  height,
                  borderRadius: 6,
                  background: `linear-gradient(180deg, ${baseTop} 0%, ${baseBottom} 100%)`,
                  opacity,
                  border: isActive
                    ? '1px solid rgba(255, 255, 255, 0.75)'
                    : '1px solid rgba(255, 255, 255, 0.18)',
                  boxShadow: isActive
                    ? `0 0 ${12 + note.velocity * 18}px ${glowColor}`
                    : `0 2px 10px rgba(2, 6, 23, 0.45)`,
                  boxSizing: 'border-box',
                  zIndex: keyMeta.isBlack ? 2 : 1,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Piano Fallboard / Red Felt Strip */}
      <div
        style={{
          width,
          height: 16,
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 75%, #7f1d1d 100%)',
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      />

      {/* 88-Key Piano Bed */}
      <div
        style={{
          position: 'relative',
          width,
          height: whiteHeight,
          backgroundColor: '#090d16',
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* White Keys Layer */}
        {WHITE_KEYS.map((keyMeta) => {
          const active = activeMap.get(keyMeta.pitch);
          const isPressed = Boolean(active);
          const velocity = active?.note.velocity ?? 0;
          const keyLeft = keyMeta.x * width;
          const keyWidth = keyMeta.width * width;

          return (
            <div
              key={keyMeta.pitch}
              style={{
                position: 'absolute',
                left: keyLeft,
                top: 0,
                width: keyWidth - 1.5,
                height: whiteHeight,
                transform: isPressed ? 'translateY(3px)' : 'translateY(0px)',
                background: isPressed
                  ? `linear-gradient(180deg, #bae6fd 0%, ${WHITE_ACTIVE_COLOR} 72%, #0284c7 100%)`
                  : 'linear-gradient(180deg, #e2e8f0 0%, #f8fafc 18%, #ffffff 88%, #cbd5e1 100%)',
                borderBottomLeftRadius: 5,
                borderBottomRightRadius: 5,
                boxShadow: isPressed
                  ? `0 0 ${16 + velocity * 18}px ${WHITE_ACTIVE_GLOW}, inset 0 -4px 8px rgba(14,116,144,0.45)`
                  : 'inset 0 -6px 8px rgba(15, 23, 42, 0.16)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: 10,
              }}
            >
              {/* Pressed-key indicator dot (retained on key cap) */}
              {isPressed && (
                <div
                  style={{
                    width: 10 + velocity * 6,
                    height: 10 + velocity * 6,
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    boxShadow: `0 0 12px #ffffff, 0 0 20px ${WHITE_ACTIVE_COLOR}`,
                    marginBottom: keyMeta.semitone === 0 ? 8 : 16,
                  }}
                />
              )}

              {/* Octave C labels */}
              {keyMeta.semitone === 0 && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'system-ui, sans-serif',
                    color: isPressed ? '#082f49' : '#64748b',
                    letterSpacing: -0.3,
                  }}
                >
                  {keyMeta.name}
                </span>
              )}
            </div>
          );
        })}

        {/* Black Keys Layer */}
        {BLACK_KEYS.map((keyMeta) => {
          const active = activeMap.get(keyMeta.pitch);
          const isPressed = Boolean(active);
          const velocity = active?.note.velocity ?? 0;
          const keyLeft = keyMeta.x * width;
          const keyWidth = keyMeta.width * width;

          return (
            <div
              key={keyMeta.pitch}
              style={{
                position: 'absolute',
                left: keyLeft,
                top: 0,
                width: keyWidth,
                height: blackHeight,
                transform: isPressed ? 'translateY(3px)' : 'translateY(0px)',
                background: isPressed
                  ? `linear-gradient(180deg, #e9d5ff 0%, ${BLACK_ACTIVE_COLOR} 55%, #7e22ce 100%)`
                  : 'linear-gradient(180deg, #334155 0%, #1e293b 15%, #0f172a 82%, #020617 100%)',
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 4,
                borderLeft: '1px solid rgba(255,255,255,0.08)',
                borderRight: '1px solid rgba(0,0,0,0.75)',
                boxShadow: isPressed
                  ? `0 0 ${16 + velocity * 20}px ${BLACK_ACTIVE_GLOW}, 0 4px 10px rgba(0,0,0,0.6)`
                  : '0 6px 10px rgba(0, 0, 0, 0.55), inset 0 -4px 4px rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                paddingBottom: 12,
                zIndex: 2,
              }}
            >
              {isPressed && (
                <div
                  style={{
                    width: 8 + velocity * 4,
                    height: 8 + velocity * 4,
                    borderRadius: '50%',
                    backgroundColor: '#faf5ff',
                    boxShadow: `0 0 10px #ffffff, 0 0 18px ${BLACK_ACTIVE_COLOR}`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
