'use client';

import { useEffect, useRef } from 'react';
import { ArrowDown } from 'lucide-react';
import styles from './ride-intro.module.css';

const clip = '/images/ride-seek-intro.mp4?v=loop';

export function RideIntro() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    function syncPlayback() {
      if (!element) return;
      if (!visible || document.hidden || motion.matches) {
        element.pause();
        return;
      }
      if (!element.getAttribute('src')) element.src = clip;
      void element.play().catch(() => {
        // The matching poster remains visible if autoplay is blocked.
      });
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(element);
    motion.addEventListener('change', syncPlayback);
    document.addEventListener('visibilitychange', syncPlayback);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', syncPlayback);
      document.removeEventListener('visibilitychange', syncPlayback);
      element.pause();
    };
  }, []);

  return (
    <section aria-labelledby="intro-title" className={styles.scene}>
      <video
        ref={video}
        className={styles.video}
        poster="/images/ride-seek-intro.webp?v=loop"
        preload="none"
        muted
        playsInline
        loop
        aria-hidden="true"
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
    </section>
  );
}
