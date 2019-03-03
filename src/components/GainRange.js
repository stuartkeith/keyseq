import React, { createContext, useContext } from 'react';
import { RangeA } from './RangeA';

export const GainContext = createContext({
  gain: null,
  setGain: null,
  gainNode: null
});

export function GainRange() {
  const { gain, setGain } = useContext(GainContext);

  return (
    <RangeA
      value={gain}
      min={0}
      max={1}
      step={0.05}
      onChange={setGain}
    >
      Volume
    </RangeA>
  );
}
