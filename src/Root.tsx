import React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import notesJson from '../data/notes.json';
import {
  PianoMotionComposition,
  type PianoMotionProps,
} from './components/PianoMotionComposition';
import type { NotesData } from './types/notes';

const defaultData = notesJson as NotesData;

const calculateMetadata: CalculateMetadataFunction<PianoMotionProps> = ({ props }) => {
  const fps = props.data.fps || 30;
  const durationInSeconds = Math.max(props.data.durationInSeconds || 8, 1);
  return {
    fps,
    durationInFrames: Math.max(1, Math.round(durationInSeconds * fps)),
    width: 1920,
    height: 1080,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="PianoMotion"
      component={PianoMotionComposition}
      width={1920}
      height={1080}
      fps={defaultData.fps || 30}
      durationInFrames={Math.max(
        1,
        Math.round((defaultData.durationInSeconds || 8) * (defaultData.fps || 30))
      )}
      defaultProps={{
        data: defaultData,
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};
