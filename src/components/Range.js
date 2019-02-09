import React from 'react';

export function Range({ value, min, max, step, containerClassName = '', sliderClassName = '', children, onChange }) {
  const scale = (value - min) / (max - min);

  const sliderStyle = {
    transformOrigin: '0 100%',
    transform: `translate3d(${(1 - scale) * -100}%, 0, 0)`
  };

  return (
    <div className={`relative z-0 ${containerClassName}`}>
      <div className="absolute absolute--fill overflow-hidden w-100 h-100 z-minus-1">
        <div className={`absolute absolute--fill ${sliderClassName}`} style={sliderStyle} />
      </div>
      {children}
      <input
        type="range"
        className="input-range-reset pointer absolute absolute--fill w-100"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(parseFloat(event.target.value))}
      />
    </div>
  );
}
