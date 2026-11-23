'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from './home.module.css';

const clips = ['/hero/roundabout.mp4', '/hero/night-street.mp4', '/hero/city-crossing.mp4'];

function randomClip(previous: string | null = null) {
  const choices = clips.filter((clip) => clip !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

export default function HeroFilm() {
  const video = useRef<HTMLVideoElement>(null);
  const [clip, setClip] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!motion.matches && !connection?.saveData) setClip(randomClip());

    function handleMotionChange(event: MediaQueryListEvent) {
      if (event.matches) video.current?.pause();
    }
    motion.addEventListener('change', handleMotionChange);
    return () => motion.removeEventListener('change', handleMotionChange);
  }, []);

  function togglePlayback() {
    if (!video.current) {
      setClip(randomClip());
    } else if (video.current.paused) {
      void video.current.play().catch(() => setPlaying(false));
    } else {
      video.current.pause();
    }
  }

  return (
    <>
      <div className={styles.film} aria-hidden="true">
        {clip && (
          <video
            key={clip}
            ref={video}
            className={styles.video}
            src={clip}
            autoPlay
            muted
            playsInline
            disablePictureInPicture
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setClip(randomClip(clip));
            }}
            onError={() => {
              setPlaying(false);
              setClip(null);
            }}
          />
        )}
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          onClick={togglePlayback}
          className={styles.filmControl}
          aria-label={playing ? 'Pause background video' : 'Play background video'}
        >
          {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          {playing ? 'Pause video' : 'Play video'}
        </button>
      </div>
    </>
  );
}
