import { useRef } from 'react';

const notInitialised = Symbol();

export function useRefLazy(initFunction) {
  const ref = useRef(notInitialised);

  if (ref.current === notInitialised) {
    ref.current = initFunction();
  }

  return ref.current;
}
