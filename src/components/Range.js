import React from "react";

export function Range({
  value,
  disabled,
  min,
  max,
  step,
  containerClassName = "",
  sliderClassName = "",
  children,
  onChange
}) {
  const scale = (value - min) / (max - min);

  const sliderStyle = {
    transformOrigin: "0 0",
    transform: `scaleX(${scale})`,
    willChange: "transform"
  };

  return (
    <div
      className={`relative tabular-nums overflow-hidden ${containerClassName}`}
    >
      <div
        className={`absolute absolute--fill ${sliderClassName}`}
        style={sliderStyle}
      />
      {children}
      <input
        type="range"
        className="input-range-reset absolute absolute--fill w-100 h-100"
        disabled={disabled}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(parseFloat(event.target.value))}
      />
    </div>
  );
}
