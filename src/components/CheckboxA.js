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
        <span className={`${checked ? '' : 'o-20'}`}>&#10003;</span>
      </LabelA>
    </Checkbox>
  );
}
