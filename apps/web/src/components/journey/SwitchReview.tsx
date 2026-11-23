'use client';

import { useEffect, useRef } from 'react';
import { providerName, type Journey } from '@/types';
import styles from './journey.module.css';

export default function SwitchReview({
  reviewed,
  current,
  available,
  onClose,
  onApprove,
}: {
  reviewed: Journey;
  current: Journey;
  available: boolean;
  onClose: () => void;
  onApprove: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const candidate = reviewed.pending_backup;
  const original = reviewed.active_ride;
  const fee = reviewed.cancellation_fee_notice;
  const changed = current.version !== reviewed.version;
  const exceedsFeeLimit = fee !== null && fee.potential_fee_upper_bound_inr > reviewed.policy.max_cancellation_fee_inr;
  const canApprove = available && !changed && (!original || (fee !== null && !exceedsFeeLimit));

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    back.current?.focus();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  if (!candidate) return null;

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="switch-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="stack">
        <h2 id="switch-title">{original ? 'Review and switch providers' : 'Review replacement ride'}</h2>
        <p>
          {original
            ? `Your current ride is with ${providerName[original.provider]}.`
            : 'The original driver already cancelled.'}
        </p>
        <div className="inline-note">
          <strong>{providerName[candidate.provider]}</strong>
          <p>Estimated fare ₹{candidate.estimated_fare_inr} · Pickup in {Math.ceil(candidate.pickup_eta_sec / 60)} min</p>
        </div>
        {original && (
          <div className="inline-note">
            {fee ? (
              <>
                <strong>Possible cancellation fee up to ₹{fee.potential_fee_upper_bound_inr}</strong>
                <p>{fee.caution}</p>
                <p>Your cancellation fee limit is ₹{reviewed.policy.max_cancellation_fee_inr}.</p>
                {exceedsFeeLimit && <p className="error">The possible fee exceeds your limit. ReHop will keep the current ride.</p>}
              </>
            ) : <p>The fee estimate is unavailable. Review the offer again before switching.</p>}
          </div>
        )}
        <p>
          ReHop checks the backup again{original ? ' before asking the original provider to cancel' : ''}.
          The provider can withdraw the quote before booking is confirmed.
        </p>
        {changed && <p role="status" className="error">The journey changed. Go back and review the latest offer.</p>}
        {!changed && !available && <p role="status" className="error">Approval is unavailable until ReHop verifies the current journey status.</p>}
        <div className="button-row">
          <button className="btn" disabled={!canApprove} onClick={onApprove}>
            {original ? 'Approve switch' : 'Approve replacement'}
          </button>
          <button ref={back} className="btn ghost" onClick={onClose}>Go back</button>
        </div>
      </div>
    </dialog>
  );
}
