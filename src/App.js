import React, { Suspense, useEffect } from 'react';
import { GainContext } from './components/GainRange';
import { useLocalStorageState } from './effects/useLocalStorageState';
import { f } from './utils/function';
import audioContext from './webaudio/audioContext';

const KeySeq = React.lazy(() => import('./KeySeq'));

const gainNode = f(() => {
  const gainNode = audioContext.createGain();

  gainNode.connect(audioContext.destination);

  return gainNode;
});

function App() {
  const [gain, setGain] = useLocalStorageState('gain', 1);

  useEffect(function () {
    gainNode.gain.value = Math.pow(gain, 1.6);
  }, [gain]);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <GainContext.Provider value={{ gain, setGain, gainNode }}>
        <KeySeq />
      </GainContext.Provider>
    </Suspense>
  );
}

export default App;
