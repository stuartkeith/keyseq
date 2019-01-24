import React, { Component, Suspense } from 'react';
const KeySeq = React.lazy(() => import('./KeySeq'));

class App extends Component {
  render() {
    return (
      <Suspense fallback={<p>Loading...</p>}>
        <KeySeq />
      </Suspense>
    );
  }
}

export default App;
