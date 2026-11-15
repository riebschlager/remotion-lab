import React, {createContext, useContext, useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {BeatState, getBeatState, TimingConfig} from './timing';

const BeatContext = createContext<BeatState | null>(null);

type Props = TimingConfig & {
  /**
   * Shifts which loop frame is shown. Used by the SeamCheck composition to
   * start just before the loop point and play across it.
   */
  frameOffset?: number;
  children: React.ReactNode;
};

/**
 * The single source of time for every layer. Layers call `useBeat()` —
 * they never call `useCurrentFrame()` directly. That one rule keeps
 * everything on the beat grid and guarantees the loop closes.
 */
export const BeatProvider: React.FC<Props> = ({
  bpm,
  bars,
  beatsPerBar,
  fps,
  frameOffset = 0,
  children,
}) => {
  const frame = useCurrentFrame();
  const state = useMemo(
    () => getBeatState(frame + frameOffset, {bpm, bars, beatsPerBar, fps}),
    [frame, frameOffset, bpm, bars, beatsPerBar, fps],
  );
  return <BeatContext.Provider value={state}>{children}</BeatContext.Provider>;
};

export const useBeat = (): BeatState => {
  const ctx = useContext(BeatContext);
  if (!ctx) {
    throw new Error('useBeat() must be used inside <BeatProvider>');
  }
  return ctx;
};
