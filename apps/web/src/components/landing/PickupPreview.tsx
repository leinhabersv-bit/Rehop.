import Image from 'next/image';
import { CarFront, MapPin, ShieldCheck } from 'lucide-react';
import styles from './pickup-preview.module.css';

export default function PickupPreview() {
  return (
    <figure className={styles.preview} aria-label="Simulated pickup preview">
      <div className={styles.scene}>
        <Image
          src="/images/chennai-pickup.webp"
          alt="Silver taxi beside a lime-lit pickup curb on a rainy Chennai evening"
          fill
          priority
          sizes="(min-width: 1280px) 592px, (min-width: 1024px) 47vw, (min-width: 672px) 640px, calc(100vw - 32px)"
          className={styles.image}
        />
        <div className={styles.label}>Simulated pickup</div>
        <div className={styles.pin} aria-hidden="true">
          <MapPin size={18} strokeWidth={2.5} />
        </div>
        <div className={styles.location}>
          <span>Pickup point</span>
          <strong>VIT Chennai</strong>
        </div>
      </div>
      <figcaption className={styles.details}>
        <div className={styles.detail}>
          <CarFront size={21} aria-hidden="true" />
          <div><strong>4 min to pickup</strong><span>Provider A</span></div>
        </div>
        <div className={styles.detail}>
          <ShieldCheck size={21} aria-hidden="true" />
          <div><strong>Backup quote</strong><span>Provider B</span></div>
        </div>
      </figcaption>
    </figure>
  );
}
