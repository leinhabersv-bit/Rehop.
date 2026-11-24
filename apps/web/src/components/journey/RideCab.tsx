import styles from './journey.module.css';

export function RideCab({ stalled = false, progress }: { stalled?: boolean; progress?: number }) {
  return (
    <span aria-hidden="true" className={styles.approachCar} data-stalled={stalled} data-pickup-cab
      style={progress === undefined ? undefined : { left: `${(progress * 100).toFixed(2)}%` }}>
      <span className={styles.cabModel}>
        <span className={styles.cabSide} />
        <span className={styles.cabHood} />
        <span className={styles.cabNose} />
        <span className={styles.cabWindows} />
        <span className={styles.cabWindshield} />
        <span className={styles.cabRoof} />
        <span className={styles.cabTaxiLight} />
      </span>
    </span>
  );
}
