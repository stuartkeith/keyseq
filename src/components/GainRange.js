import React from 'react';
import { Range } from './Range';

export function GainRange({ gain, onChange }) {
  return (
    <div className="fixed right-1 top-1">
      <Range
        value={gain}
        min={0}
        max={1}
        step={0.05}
        containerClassName="bg-white box-shadow-1"
        sliderClassName="bg-moon-gray"
        onChange={onChange}
      >
        <span className="db pv2 ph4 near-black">Volume</span>
      </Range>
    </div>
  );
}
