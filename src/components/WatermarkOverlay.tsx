import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { WatermarkPosition } from '../types/notes';

interface WatermarkOverlayProps {
  text: string;
  logoUrl: string | null;
  position: WatermarkPosition;
  opacity: number;
  currentTime: number;
}

function hashUnit(seed: number): number {
  const x = Math.sin(seed * 78.233 + 31.415) * 43758.5453;
  return x - Math.floor(x);
}

function resolvePositionStyle(
  position: WatermarkPosition,
  currentTime: number
): { style: React.CSSProperties; fadeFactor: number } {
  switch (position) {
    case 'top-left':
      return { style: { left: 64, top: 138 }, fadeFactor: 1 };
    case 'top-right':
      return { style: { right: 64, top: 138 }, fadeFactor: 1 };
    case 'bottom-left':
      return { style: { left: 64, bottom: 378 }, fadeFactor: 1 };
    case 'center-stage':
      return {
        style: { left: '50%', top: 146, transform: 'translateX(-50%)' },
        fadeFactor: 1,
      };
    case 'random-drift': {
      // Deterministic 15s interval position switching with smooth 0.8s fade edges
      const intervalSec = 15;
      const slot = Math.floor(currentTime / intervalSec);
      const localT = currentTime - slot * intervalSec;
      const fadeDuration = 0.8;
      let fadeFactor = 1;
      if (localT < fadeDuration) {
        fadeFactor = localT / fadeDuration;
      } else if (localT > intervalSec - fadeDuration) {
        fadeFactor = Math.max(0, (intervalSec - localT) / fadeDuration);
      }

      const left = Math.round(90 + hashUnit(slot * 17 + 3) * 1420);
      const top = Math.round(146 + hashUnit(slot * 29 + 11) * 175);
      return {
        style: { left, top },
        fadeFactor,
      };
    }
    case 'bottom-right':
    default:
      return { style: { right: 64, bottom: 378 }, fadeFactor: 1 };
  }
}

export const WatermarkOverlay: React.FC<WatermarkOverlayProps> = ({
  text,
  logoUrl,
  position,
  opacity,
  currentTime,
}) => {
  const trimmedText = text.trim();
  if (!trimmedText && !logoUrl) {
    return null;
  }

  const { style, fadeFactor } = resolvePositionStyle(position, currentTime);
  const effectiveOpacity = Math.min(Math.max(opacity, 0), 1) * fadeFactor;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 5 }}>
      <div
        style={{
          position: 'absolute',
          ...style,
          opacity: effectiveOpacity,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: logoUrl && !trimmedText ? '6px 8px' : '8px 14px',
          borderRadius: 999,
          backgroundColor: 'rgba(6, 10, 19, 0.42)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
        }}
      >
        {logoUrl && (
          <Img
            src={logoUrl}
            style={{
              height: 28,
              width: 'auto',
              maxWidth: 110,
              objectFit: 'contain',
              borderRadius: 4,
              display: 'block',
            }}
          />
        )}
        {trimmedText && (
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: '#f8fafc',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
              whiteSpace: 'nowrap',
            }}
          >
            {trimmedText}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
