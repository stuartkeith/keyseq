import React, { Suspense, useEffect } from 'react';
import { GainContext } from './components/GainRange';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { f } from './utils/function';
import audioContext from './webaudio/audioContext';

const KeySeq = React.lazy(() => import('./KeySeq'));

const gainNode = f(() => {
  const gainNode = audioContext.createGain();

  gainNode.connect(audioContext.destination);

  return gainNode;
});

function FallbackMessage() {
  return (
    <div className="vh-100 flex justify-center items-center">
      <p className="b f3">Loading...</p>
    </div>
  );
}

function App() {
  const [gain, setGain] = useLocalStorageState('gain', 1);

  useEffect(function () {
    gainNode.gain.value = Math.pow(gain, 1.6);
  }, [gain]);

  return (
    <Suspense fallback={<FallbackMessage />}>
      <GainContext.Provider value={{ gain, setGain, gainNode }}>
        <KeySeq />
      </GainContext.Provider>
    </Suspense>
  );
}

export default App;
