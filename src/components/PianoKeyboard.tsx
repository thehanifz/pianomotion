import React from 'react';
import {
  ROLE_PALETTES,
  getLandingSparks,
  getVisibleFallingNotes,
  type ActiveKeyState,
  type NoteRole,
  type PianoRangeLayout,
} from '../utils/pianoLayout';
import type { NoteEvent } from '../types/notes';

interface PianoKeyboardProps {
  notes: NoteEvent[];
  currentTime: number;
  layout: PianoRangeLayout;
  activeMap: Map<number, ActiveKeyState>;
  trackRoleMap: Map<number, NoteRole> | null;
  bassMaxPitch: number;
  melodyMinPitch: number;
  width?: number;
  keyboardHeight?: number;
  stageHeight?: number;
  lookaheadSeconds?: number;
  enableParticles?: boolean;
  particleCountPerOnset?: number;
  backgroundSlot?: React.ReactNode;
}

export const PianoKeyboard: React.FC<PianoKeyboardProps> = ({
  notes,
  currentTime,
  layout,
  activeMap,
  trackRoleMap,
  bassMaxPitch,
  melodyMinPitch,
  width = 1792,
  keyboardHeight = 295,
  stageHeight = 480,
  lookaheadSeconds = 2.6,
  enableParticles = true,
  particleCountPerOnset = 5,
  backgroundSlot,
}) => {
  const whiteKeys = layout.keys.filter((k) => !k.isBlack);
  const blackKeys = layout.keys.filter((k) => k.isBlack);

  const fallingNotes = getVisibleFallingNotes(
    notes,
    currentTime,
    stageHeight,
    layout,
    trackRoleMap,
    bassMaxPitch,
    melodyMinPitch,
    lookaheadSeconds
  );

  const sparks = enableParticles
    ? getLandingSparks(
        notes,
        currentTime,
        layout,
        trackRoleMap,
        bassMaxPitch,
        melodyMinPitch,
        width,
        stageHeight,
        particleCountPerOnset
      )
    : [];

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
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Middle Stage: Audio Spectrum + Falling Notes + Contact Impact Glow + Micro-Sparks */}
      <div
        style={{
          position: 'relative',
          width,
          height: stageHeight,
          overflow: 'hidden',
        }}
      >
        {/* Subtle vertical octave guide lines on every C key */}
        {whiteKeys
          .filter((k) => k.semitone === 0)
          .map((k) => (
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

        {/* Background layer (AudioSpectrum) */}
        {backgroundSlot}

        {/* Falling Note Bars aligned 1:1 with zoomed piano keys */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          {fallingNotes.map((item, idx) => {
            const { note, role, keyMeta, top, height, isActive } = item;
            const palette = ROLE_PALETTES[role];
            const rawWidth = keyMeta.width * width;
            const barWidth = keyMeta.isBlack
              ? Math.max(7, rawWidth * 0.9)
              : Math.max(10, rawWidth * 0.78);
            const left = keyMeta.centerX * width - barWidth / 2;

            // Stronger velocity-to-brightness contrast (soft notes dimmer, loud notes vivid)
            const velNorm = Math.min(Math.max(note.velocity, 0), 1);
            const restOpacity = 0.36 + velNorm * 0.56;
            const activeState = isActive ? activeMap.get(note.pitch) : undefined;
            const decayFactor = activeState ? activeState.decay : 1;
            const opacity = isActive
              ? Math.min(1, (0.55 + velNorm * 0.45) * (0.65 + 0.35 * decayFactor))
              : restOpacity;

            const glowSize = isActive
              ? (8 + velNorm * 22) * (0.6 + 0.4 * decayFactor)
              : velNorm * 6;

            return (
              <div
                key={`${note.pitch}-${note.startTime}-${idx}`}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: barWidth,
                  height,
                  borderRadius: 7,
                  background: `linear-gradient(180deg, ${palette.barTop} 0%, ${palette.barBottom} 100%)`,
                  opacity,
                  border: isActive
                    ? `1px solid rgba(255, 255, 255, ${(0.35 + velNorm * 0.5).toFixed(2)})`
                    : `1px solid rgba(255, 255, 255, ${(0.08 + velNorm * 0.16).toFixed(2)})`,
                  boxShadow:
                    glowSize > 1
                      ? `0 0 ${glowSize}px ${palette.glow}`
                      : '0 2px 8px rgba(2, 6, 23, 0.4)',
                  boxSizing: 'border-box',
                  zIndex: keyMeta.isBlack ? 2 : 1,
                }}
              />
            );
          })}
        </div>

        {/* Contact Impact Flash along the keyboard lip when a note lands */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 22,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        >
          {Array.from(activeMap.values()).map((active) => {
            if (active.impact <= 0.02) return null;
            const keyMeta = layout.keyByPitch.get(active.note.pitch);
            if (!keyMeta) return null;

            const palette = ROLE_PALETTES[active.role];
            const flashWidth = Math.max(24, keyMeta.width * width * 1.9);
            const left = keyMeta.centerX * width - flashWidth / 2;

            return (
              <div
                key={`impact-${active.note.pitch}`}
                style={{
                  position: 'absolute',
                  left,
                  bottom: -4,
                  width: flashWidth,
                  height: 18 + active.note.velocity * 10,
                  borderRadius: '50%',
                  background: `radial-gradient(ellipse at 50% 80%, #ffffff 0%, ${palette.keyMain} 45%, rgba(0,0,0,0) 75%)`,
                  opacity: active.impact * (0.55 + active.note.velocity * 0.45),
                }}
              />
            );
          })}
        </div>

        {/* Deterministic Micro-Sparks rising from contact points */}
        {sparks.length > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 4,
            }}
          >
            {sparks.map((spark) => (
              <div
                key={spark.id}
                style={{
                  position: 'absolute',
                  left: spark.x - spark.size / 2,
                  top: spark.y - spark.size / 2,
                  width: spark.size,
                  height: spark.size,
                  borderRadius: '50%',
                  backgroundColor: spark.color,
                  opacity: spark.opacity,
                  boxShadow: `0 0 ${spark.size * 2.2}px ${spark.color}`,
                }}
              />
            ))}
          </div>
        )}
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

      {/* Zoomed Piano Bed */}
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
        {whiteKeys.map((keyMeta) => {
          const active = activeMap.get(keyMeta.pitch);
          const isPressed = Boolean(active);
          const velocity = active?.note.velocity ?? 0;
          const decay = active?.decay ?? 1;
          const impact = active?.impact ?? 0;
          const palette = active ? ROLE_PALETTES[active.role] : null;
          const keyLeft = keyMeta.x * width;
          const keyWidth = keyMeta.width * width;

          const glowIntensity = isPressed
            ? (10 + velocity * 18) * decay + impact * 12
            : 0;

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
                background:
                  isPressed && palette
                    ? `linear-gradient(180deg, ${palette.keyTop} 0%, ${palette.keyMain} 68%, ${palette.keyDeep} 100%)`
                    : 'linear-gradient(180deg, #e2e8f0 0%, #f8fafc 18%, #ffffff 88%, #cbd5e1 100%)',
                opacity: isPressed ? 0.78 + 0.22 * decay : 1,
                borderBottomLeftRadius: 5,
                borderBottomRightRadius: 5,
                boxShadow:
                  isPressed && palette
                    ? `0 0 ${glowIntensity}px ${palette.glow}, inset 0 -4px 10px rgba(15,23,42,0.35)`
                    : 'inset 0 -6px 8px rgba(15, 23, 42, 0.16)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: 10,
              }}
            >
              {/* Pressed-key indicator dot */}
              {isPressed && palette && (
                <div
                  style={{
                    width: 10 + velocity * 6,
                    height: 10 + velocity * 6,
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    opacity: 0.7 + 0.3 * decay,
                    boxShadow: `0 0 10px #ffffff, 0 0 ${14 + impact * 10}px ${palette.keyMain}`,
                    marginBottom: keyMeta.semitone === 0 ? 8 : 16,
                  }}
                />
              )}

              {/* Octave C labels */}
              {keyMeta.semitone === 0 && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'system-ui, sans-serif',
                    color: isPressed ? '#0f172a' : '#64748b',
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
        {blackKeys.map((keyMeta) => {
          const active = activeMap.get(keyMeta.pitch);
          const isPressed = Boolean(active);
          const velocity = active?.note.velocity ?? 0;
          const decay = active?.decay ?? 1;
          const impact = active?.impact ?? 0;
          const palette = active ? ROLE_PALETTES[active.role] : null;
          const keyLeft = keyMeta.x * width;
          const keyWidth = keyMeta.width * width;

          const glowIntensity = isPressed
            ? (10 + velocity * 18) * decay + impact * 12
            : 0;

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
                background:
                  isPressed && palette
                    ? `linear-gradient(180deg, ${palette.keyTop} 0%, ${palette.keyMain} 58%, ${palette.keyDeep} 100%)`
                    : 'linear-gradient(180deg, #334155 0%, #1e293b 15%, #0f172a 82%, #020617 100%)',
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 4,
                borderLeft: '1px solid rgba(255,255,255,0.08)',
                borderRight: '1px solid rgba(0,0,0,0.75)',
                boxShadow:
                  isPressed && palette
                    ? `0 0 ${glowIntensity}px ${palette.glow}, 0 4px 10px rgba(0,0,0,0.6)`
                    : '0 6px 10px rgba(0, 0, 0, 0.55), inset 0 -4px 4px rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                paddingBottom: 12,
                zIndex: 2,
              }}
            >
              {isPressed && palette && (
                <div
                  style={{
                    width: 8 + velocity * 4,
                    height: 8 + velocity * 4,
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    opacity: 0.7 + 0.3 * decay,
                    boxShadow: `0 0 10px #ffffff, 0 0 ${14 + impact * 10}px ${palette.keyMain}`,
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
