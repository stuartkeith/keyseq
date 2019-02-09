import React, { Suspense, useEffect, useState } from 'react';
import { GainRange } from './components/GainRange';
import { f } from './utils/f';
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
      <GainRange gain={gain} onChange={setGain} />
    </Suspense>
  );
}

export default App;
