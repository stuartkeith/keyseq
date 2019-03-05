import { useRef } from 'react';

export function useRefLazy(initFunction) {
  const ref = useRef(null);

  if (ref.current === null) {
    ref.current = initFunction();
  }

  return ref.current;
}
