'use client';

import { useEffect, useRef } from 'react';
import { CarFront, Check } from 'lucide-react';
import styles from './booking-progress.module.css';

export function BookingProgress({ pickup, dropoff, confirmed }: {
  pickup: string;
  dropoff: string;
  confirmed: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const panel = dialog.current;
    const clip = video.current;
    if (!panel || !clip) return;
    panel.showModal();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function syncVideo() {
      if (!clip) return;
      if (motion.matches || document.hidden) {
        clip.pause();
        return;
      }
      if (!clip.getAttribute('src')) clip.src = '/images/booking-background.mp4';
      void clip.play().catch(() => {});
    }
    syncVideo();
    motion.addEventListener('change', syncVideo);
    document.addEventListener('visibilitychange', syncVideo);
    return () => {
      motion.removeEventListener('change', syncVideo);
      document.removeEventListener('visibilitychange', syncVideo);
      clip.pause();
      panel.close();
    };
  }, []);
  const Icon = confirmed ? Check : CarFront;

  return (
    <dialog ref={dialog} aria-label="Booking progress" className={styles.dialog} onCancel={(event) => event.preventDefault()}>
      <div className={styles.scene}>
        <video ref={video} className={styles.video} poster="/images/booking-background.webp" preload="none"
          aria-hidden="true" muted playsInline loop />
        <div className={styles.card}>
          <span className={styles.icon}><Icon size={24} aria-hidden="true" /></span>
          <div role="status" aria-live="polite" aria-atomic="true">
            <h2>{confirmed ? 'Ride booked' : 'Confirming your ride'}</h2>
            <p>{confirmed ? 'Opening pickup tracking…' : 'Checking the fare and confirming with your provider.'}</p>
          </div>
          <p className={styles.route}>{pickup} <span aria-hidden="true">→</span><span className="sr-only"> to </span> {dropoff}</p>
          {!confirmed && <div className={styles.progress} aria-hidden="true" />}
        </div>
      </div>
    </dialog>
  );
}
