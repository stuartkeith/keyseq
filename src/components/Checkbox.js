import React from "react";

export function Checkbox({ className = "", checked, onChange, children }) {
  return (
    <label className={`relative dib ${className}`}>
      <input
        type="checkbox"
        className="input-reset absolute absolute--fill w-100"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}
