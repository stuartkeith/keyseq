import React from "react";
import { Range } from "./Range";
import { LabelA } from "./LabelA";

export function RangeA({ children, ...props }) {
  return (
    <Range
      {...props}
      containerClassName="bg-white box-shadow-1"
      sliderClassName="bg-moon-gray"
    >
      <LabelA disabled={props.disabled}>{children}</LabelA>
    </Range>
  );
}
