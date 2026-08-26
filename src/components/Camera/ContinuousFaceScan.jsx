import React, { useEffect, useRef, useState } from 'react';
import Human from '@vladmandic/human';

const ContinuousFaceScan = ({ onFaceDetected }) => {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('Loading models...');
  // Use a ref to ensure human instance is stable
    const human = useRef(new Human({
    modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models',
    backend: 'webgl',
    face: { enabled: true, embedding: true, embeddingSize: 1024 },
  }));

  useEffect(() => {
    let isMounted = true;
    let stream = null;

    const init = async () => {
      setStatus('Warming up models...');
      try {
        await human.current.warmup();
        if (!isMounted) return;

        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream;
          // Gracefully handle play interruption
          await videoRef.current.play().catch(e => console.warn('Play interrupted:', e.message));
          setStatus('Ready');
          runDetection();
        }
      } catch (err) {
        if (isMounted) {
            console.error('Initialization error:', err);
            setStatus('Error: ' + err.message);
        }
      }
    };

    const runDetection = async () => {
      const detect = async () => {
        if (!isMounted || !videoRef.current || videoRef.current.paused || videoRef.current.readyState !== 4) {
          if (isMounted) requestAnimationFrame(detect);
          return;
        }
        
        try {
          const result = await human.current.detect(videoRef.current);
          if (isMounted && result.faceCount > 0) {
            console.log('Detection result:', result);

            let embedding = null;
            if (result.face && result.face[0] && result.face[0].embedding) {
              embedding = result.face[0].embedding;
            } else if (result.embedding) {
              embedding = result.embedding;
            } else if (result.faces && result.faces[0] && result.faces[0].embedding) {
              embedding = result.faces[0].embedding;
            }

            if (embedding) {
              onFaceDetected(embedding);
            }
          }
        } catch (e) {
          console.error('Detection error:', e);
        }
        
        if (isMounted) requestAnimationFrame(detect);
      };
      detect();
    };

    init();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="cam-video-wrap">
        <video ref={videoRef} autoPlay playsInline muted />
        <div>Status: {status}</div>
    </div>
  );
};

export default ContinuousFaceScan;
