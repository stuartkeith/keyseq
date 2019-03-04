import React from 'react';

const variantClassNames = {
  'textOnly': 'tc',
  'icon': 'flex justify-between ph3'
};

export function LabelA({ disabled, variant = 'textOnly', children }) {
  const variantClassName = variantClassNames[variant];

  if (variantClassName === undefined) {
    throw new Error('invalid LabelA variant - ' + variant);
  }

  const className = `
    dib f6 pa2 box-shadow-1 w-5rem
    ${disabled ? 'moon-gray' : 'dark-gray'}
    ${variantClassName}
  `;

  return (
    <span className={className}>
      {children}
    </span>
  );
}
