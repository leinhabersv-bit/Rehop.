'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Pause, Play, RotateCcw } from 'lucide-react';
import styles from './ride-intro.module.css';

const clip = '/images/ride-seek-intro.mp4';

function playIntro(video: HTMLVideoElement) {
  if (!video.getAttribute('src')) video.src = clip;
  void video.play().catch(() => {
    // The poster and manual play button also work when autoplay is blocked.
  });
}

export function RideIntro() {
  const video = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState<'paused' | 'playing' | 'ended'>('paused');

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!motion.matches) playIntro(element);
    const pauseForReducedMotion = () => { if (motion.matches) element.pause(); };
    motion.addEventListener('change', pauseForReducedMotion);
    return () => motion.removeEventListener('change', pauseForReducedMotion);
  }, []);

  function togglePlayback() {
    const element = video.current;
    if (!element) return;
    if (element.paused || element.ended) playIntro(element);
    else element.pause();
  }

  const PlaybackIcon = playback === 'playing' ? Pause : playback === 'ended' ? RotateCcw : Play;
  const playbackLabel = playback === 'playing' ? 'Pause intro' : playback === 'ended' ? 'Replay intro' : 'Play intro';

  return (
    <section aria-labelledby="intro-title" className={styles.scene}>
      <video
        ref={video}
        className={styles.video}
        poster="/images/ride-seek-intro.webp"
        preload="none"
        muted
        playsInline
        aria-hidden="true"
        onPlaying={() => setPlayback('playing')}
        onPause={(event) => setPlayback(event.currentTarget.ended ? 'ended' : 'paused')}
        onEnded={() => setPlayback('ended')}
      />
      <div className={styles.content}>
        <h1 id="intro-title" className={styles.title}>
          <span>RIDE</span>{' '}<span className={styles.secondLine}><span className={styles.amp}>&amp;</span> SEEK</span>
        </h1>
        <p className={styles.tagline}>Rides with a backup plan.</p>
        <a href="#trip-planner" className={styles.action}>
          Plan your ride <ArrowDown size={17} aria-hidden="true" />
        </a>
      </div>
      <button type="button" onClick={togglePlayback} className={styles.playback} aria-label={playbackLabel}>
        <PlaybackIcon size={17} aria-hidden="true" />
        <span>{playbackLabel}</span>
      </button>
    </section>
  );
}
