import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useWindowedAudioData, visualizeAudio } from '@remotion/media-utils';

interface AudioSpectrumProps {
  audioSrc: string;
  width: number;
  height?: number;
  barCount?: number;
}

export const AudioSpectrum: React.FC<AudioSpectrumProps> = ({
  audioSrc,
  width,
  height = 120,
  barCount = 64,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src: audioSrc,
    frame,
    fps,
    windowInSeconds: 10,
  });

  if (!audioData) {
    return null;
  }

  const rawSpectrum = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: 256,
    optimizeFor: 'accuracy',
    dataOffsetInSeconds,
    smoothing: true,
  });

  const nyquist = audioData.sampleRate / 2;
  const minFreq = 55;
  const maxFreq = Math.min(5200, nyquist * 0.9);
  const bars: number[] = [];

  for (let i = 0; i < barCount; i++) {
    const f0 = minFreq * Math.pow(maxFreq / minFreq, i / barCount);
    const f1 = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / barCount);
    const b0 = Math.max(0, Math.floor((f0 / nyquist) * rawSpectrum.length));
    const b1 = Math.min(
      rawSpectrum.length - 1,
      Math.max(b0, Math.ceil((f1 / nyquist) * rawSpectrum.length))
    );

    let peak = 0;
    for (let b = b0; b <= b1; b++) {
      if (rawSpectrum[b] > peak) {
        peak = rawSpectrum[b];
      }
    }

    const ratio = i / Math.max(barCount - 1, 1);
    const tilt = 1 + ratio * 2.2;
    const boosted = Math.pow(Math.min(peak * 2.2 * tilt, 1), 0.72);
    bars.push(boosted);
  }

  const stepWidth = width / bars.length;
  const barWidth = Math.max(3, stepWidth * 0.4);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 4px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {bars.map((normalized, index) => {
        const barHeight = Math.max(2, normalized * height);
        const ratio = index / Math.max(bars.length - 1, 1);
        const barColor =
          ratio < 0.34
            ? 'rgba(99, 102, 241, 0.28)'
            : ratio < 0.7
            ? 'rgba(56, 189, 248, 0.26)'
            : 'rgba(244, 114, 182, 0.26)';

        return (
          <div
            key={index}
            style={{
              width: barWidth,
              height: barHeight,
              borderTopLeftRadius: barWidth / 2,
              borderTopRightRadius: barWidth / 2,
              background: `linear-gradient(180deg, ${barColor} 0%, rgba(56, 189, 248, 0.03) 100%)`,
            }}
          />
        );
      })}
    </div>
  );
};
