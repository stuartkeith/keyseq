import React, { Suspense } from 'react';
const KeySeq = React.lazy(() => import('./KeySeq'));

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <KeySeq />
    </Suspense>
  );
}

export default App;
