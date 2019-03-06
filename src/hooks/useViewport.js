import { useEffect, useState } from 'react';

function getViewport(hasTimedOut) {
  // hasTimedOut - set to false until a timeout has elapsed. this can be used to
  // temporarily disable transitions while the user is resizing the viewport.
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    hasTimedOut
  };
}

export function useViewport() {
  const [dimensions, setDimensions] = useState(getViewport(true));

  useEffect(function () {
    let timeoutId;

    const onResizeTimeout = function () {
      setDimensions(getViewport(true));
    };

    const onResize = function () {
      setDimensions(getViewport(false));

      clearTimeout(timeoutId);

      timeoutId = setTimeout(onResizeTimeout, 600);
    };

    window.addEventListener('resize', onResize);

    return function () {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return dimensions;
}
