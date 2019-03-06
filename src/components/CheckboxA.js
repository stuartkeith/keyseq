import React from 'react';
import { Checkbox } from './Checkbox';
import { LabelA } from './LabelA';

export function CheckboxA({ checked, children, ...props }) {
  return (
    <Checkbox
      className="bg-white"
      checked={checked}
      {...props}
    >
      <LabelA variant="icon">
        {children}
        &nbsp;&nbsp;
        <span
          style={{
            opacity: checked ? '1' : '0.2',
            willChange: 'opacity'
          }}
        >
          &#10003;
        </span>
      </LabelA>
    </Checkbox>
  );
}
