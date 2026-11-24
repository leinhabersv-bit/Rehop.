import styles from './journey.module.css';

export function RideCab({ stalled = false, progress }: { stalled?: boolean; progress?: number }) {
  return (
    <span aria-hidden="true" className={styles.approachCar} data-stalled={stalled} data-pickup-cab
      style={progress === undefined ? undefined : { left: `${(progress * 100).toFixed(2)}%` }}>
      <span className={styles.cabBody}><span className={styles.cabCabin} /></span>
    </span>
  );
}
