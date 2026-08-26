import React, { useState } from 'react';
import ContinuousFaceScan from './components/Camera/ContinuousFaceScan';
import { euclideanDistance, MATCH_THRESHOLD } from './utils/faceMatcher';

// Hardcoded reference embedding (1024-d) - Placeholder
const REFERENCE_EMBEDDING = new Array(1024).fill(0);

function App() {
  const [distance, setDistance] = useState(null);

  const handleFaceDetected = (embedding) => {
    // Log the structure to verify it's the expected array
    // console.log('Detected embedding:', embedding);
    const dist = euclideanDistance(embedding, REFERENCE_EMBEDDING);
    setDistance(dist);
  };

  return (
    <div className="App">
      <h1>Absensi Face Recognition</h1>
      <ContinuousFaceScan onFaceDetected={handleFaceDetected} />
      <div style={{ marginTop: '20px' }}>
        {distance !== null ? (
          <div>
            <p>Euclidean Distance: {distance.toFixed(4)}</p>
            <p style={{ color: distance < MATCH_THRESHOLD ? 'green' : 'red' }}>
              {distance < MATCH_THRESHOLD ? 'Match!' : 'No Match'}
            </p>
          </div>
        ) : (
          <p>Detecting face...</p>
        )}
      </div>
    </div>
  );
}

export default App;
