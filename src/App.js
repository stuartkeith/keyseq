import React, { Suspense, useEffect, useState } from 'react';
import { RangeA } from './components/RangeA';
import { f } from './utils/function';
import audioContext from './webaudio/audioContext';
const KeySeq = React.lazy(() => import('./KeySeq'));

const gainLocalStorageKey = 'gain';

function getInitialGain() {
  const gain = parseFloat(localStorage.getItem(gainLocalStorageKey));

  return gain >= 0 && gain <= 1 ? gain : 1;
}

const gainNode = f(() => {
  const gainNode = audioContext.createGain();

  gainNode.connect(audioContext.destination);

  return gainNode;
});

function App() {
  const [gain, setGain] = useState(getInitialGain);

  useEffect(function () {
    gainNode.gain.value = Math.pow(gain, 1.6);

    localStorage.setItem(gainLocalStorageKey, gain);
  }, [gain]);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <KeySeq destinationNode={gainNode} />
      <div className="fixed right-1 top-1">
        <RangeA
          value={gain}
          min={0}
          max={1}
          step={0.05}
          onChange={setGain}
        >
          Volume
        </RangeA>
      </div>
    </Suspense>
  );
}

export default App;
