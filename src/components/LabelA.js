import React from 'react';

export function LabelA({ disabled, children }) {
  const className = `
    dark-gray dib f6 pa2 box-shadow-1 tc
    ${disabled ? 'moon-gray' : 'dark-gray'}
  `;

  return (
    <span
      className={className}
      style={{ width: '5rem' }}
    >
      {children}
    </span>
  );
}
