import React, { Suspense, useEffect, useMemo } from "react";
import { GainContext, GainNodeContext } from "./components/GainRange";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import audioContext from "./webaudio/audioContext";

const f = callback => callback();

const KeySeq = React.lazy(() => import("./KeySeq"));

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
  const [gain, setGain] = useLocalStorageState("App.gain", 1);

  useEffect(
    function() {
      gainNode.gain.value = Math.pow(gain, 1.6);
    },
    [gain]
  );

  const providerValue = useMemo(() => {
    return {
      gain,
      setGain
    };
  }, [gain, setGain]);

  return (
    <Suspense fallback={<FallbackMessage />}>
      <GainContext.Provider value={providerValue}>
        <GainNodeContext.Provider value={gainNode}>
          <KeySeq />
        </GainNodeContext.Provider>
      </GainContext.Provider>
    </Suspense>
  );
}

export default App;
