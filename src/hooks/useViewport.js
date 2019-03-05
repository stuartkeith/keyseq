import { useEffect, useState } from 'react';

function getViewport() {
  return [window.innerWidth, window.innerHeight];
}

export function useViewport() {
  const [dimensions, setDimensions] = useState(getViewport);

  useEffect(function () {
    const onResize = function () {
      setDimensions(getViewport());
    };

    window.addEventListener('resize', onResize);

    return function () {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return dimensions;
}
