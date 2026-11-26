import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { BackgroundMode, BackgroundPreset } from '../types/notes';

export const BACKGROUND_PRESET_STYLES: Record<
  BackgroundPreset,
  { label: string; bg: string; glowA: string; glowB: string }
> = {
  'midnight-navy': {
    label: 'Midnight Navy',
    bg: 'radial-gradient(ellipse at 50% 28%, #152039 0%, #0a101f 58%, #04070f 100%)',
    glowA: '56, 189, 248',
    glowB: '99, 102, 241',
  },
  'warm-espresso': {
    label: 'Warm Espresso',
    bg: 'radial-gradient(ellipse at 50% 28%, #2d1f18 0%, #160f0c 58%, #080504 100%)',
    glowA: '251, 191, 36',
    glowB: '244, 114, 182',
  },
  'deep-forest': {
    label: 'Deep Forest',
    bg: 'radial-gradient(ellipse at 50% 28%, #112a22 0%, #071612 58%, #030907 100%)',
    glowA: '52, 211, 153',
    glowB: '56, 189, 248',
  },
  'velvet-plum': {
    label: 'Velvet Plum',
    bg: 'radial-gradient(ellipse at 50% 28%, #281633 0%, #130a1a 58%, #06030a 100%)',
    glowA: '244, 114, 182',
    glowB: '139, 92, 246',
  },
  'pure-obsidian': {
    label: 'Pure Obsidian',
    bg: 'radial-gradient(ellipse at 50% 28%, #171a21 0%, #090b0f 58%, #020305 100%)',
    glowA: '148, 163, 184',
    glowB: '56, 189, 248',
  },
};

interface AmbientBackdropProps {
  currentTime: number;
  energy: number;
  enableBreathingBg: boolean;
  enableDust: boolean;
  dustCount: number;
  backgroundMode: BackgroundMode;
  backgroundPreset: BackgroundPreset;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  backgroundDim: number;
  backgroundBlur: number;
}

function hashUnit(seed: number): number {
  const x = Math.sin(seed * 91.3458 + 17.13) * 47453.5453;
  return x - Math.floor(x);
}

function scaleHexColor(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return '#0a101f';
  }
  const r = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

export const AmbientBackdrop: React.FC<AmbientBackdropProps> = ({
  currentTime,
  energy,
  enableBreathingBg,
  enableDust,
  dustCount,
  backgroundMode,
  backgroundPreset,
  backgroundColor,
  backgroundImageUrl,
  backgroundDim,
  backgroundBlur,
}) => {
  const preset = BACKGROUND_PRESET_STYLES[backgroundPreset] ?? BACKGROUND_PRESET_STYLES['midnight-navy'];
  const breath = enableBreathingBg ? 0.14 + energy * 0.2 : 0.14;
  const glowScale = enableBreathingBg ? 1 + energy * 0.12 : 1;

  const customGradient = `radial-gradient(ellipse at 50% 28%, ${scaleHexColor(
    backgroundColor,
    1.1
  )} 0%, ${scaleHexColor(backgroundColor, 0.55)} 58%, ${scaleHexColor(
    backgroundColor,
    0.22
  )} 100%)`;

  const showImage = backgroundMode === 'image' && Boolean(backgroundImageUrl);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {/* Base Gradient / Preset */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: backgroundMode === 'custom-color' ? customGradient : preset.bg,
        }}
      />

      {/* Optional Custom Background Image */}
      {showImage && backgroundImageUrl && (
        <>
          <Img
            src={backgroundImageUrl}
            style={{
              position: 'absolute',
              left: -24,
              top: -24,
              width: 'calc(100% + 48px)',
              height: 'calc(100% + 48px)',
              objectFit: 'cover',
              filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(ellipse at 50% 35%, rgba(4, 7, 15, ${Math.max(
                0,
                backgroundDim * 0.85
              ).toFixed(2)}) 0%, rgba(4, 7, 15, ${Math.min(
                0.96,
                backgroundDim + 0.14
              ).toFixed(2)}) 100%)`,
            }}
          />
        </>
      )}

      {/* Dynamic breathing atmospheric glow synced to note energy */}
      <div
        style={{
          position: 'absolute',
          left: '15%',
          right: '15%',
          top: '8%',
          height: '62%',
          transform: `scale(${glowScale})`,
          background: `radial-gradient(ellipse at 50% 55%, rgba(${preset.glowA}, ${breath.toFixed(
            3
          )}) 0%, rgba(${preset.glowB}, ${(breath * 0.55).toFixed(
            3
          )}) 45%, rgba(5, 8, 17, 0) 75%)`,
          filter: 'blur(42px)',
        }}
      />

      {/* Deterministic subtle ambient dust motes */}
      {enableDust &&
        Array.from({ length: dustCount }).map((_, idx) => {
          const xBase = hashUnit(idx * 3 + 1) * 1920;
          const speed = 10 + hashUnit(idx * 5 + 2) * 18;
          const yStart = hashUnit(idx * 7 + 3) * 1080;
          const yPos = (((yStart - currentTime * speed) % 1080) + 1080) % 1080;
          const sway = Math.sin(currentTime * 0.7 + idx * 1.9) * 14;
          const size = 2 + hashUnit(idx * 11 + 4) * 2.5;
          const baseOpacity = 0.06 + hashUnit(idx * 13 + 5) * 0.12;
          const pulse = 0.75 + 0.25 * Math.sin(currentTime * 1.3 + idx);

          return (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: xBase + sway,
                top: yPos,
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: idx % 3 === 0 ? '#fbcfe8' : '#bae6fd',
                opacity: baseOpacity * pulse,
              }}
            />
          );
        })}
    </AbsoluteFill>
  );
};
