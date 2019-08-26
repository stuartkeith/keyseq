import React from "react";
import { LabelA } from "./LabelA";

export function ButtonA({ disabled, onClick, children }) {
  return (
    <button
      className="input-reset bw0 pa0 flex-none dib bg-white"
      disabled={disabled}
      onClick={onClick}
    >
      <LabelA disabled={disabled}>{children}</LabelA>
    </button>
  );
}
