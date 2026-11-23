'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import styles from './scenarios.module.css';

const walkthroughs: Record<string, string> = {
  S01: 'Advance 2 min, then confirm boarding.',
  S03: 'Advance 2 min. Review the fee and approve the switch.',
  S05: 'Advance the clock to see how ReHop handles repeated driver cancellations.',
  S11: 'Advance the clock until a backup is proposed, then stop the journey.',
  S12: 'Select a quote to see how ReHop handles an unresolved booking outcome.',
  S13: 'Advance the clock to see the advisory classification of a driver message.',
  S14: 'Advance 2 min, then approve the switch. The quote fails its recheck.',
  S15: 'Advance 2 min, then approve the switch. The quote disappears after cancellation.',
};

export default function ScenarioConsole() {
  const router = useRouter();
  const query = useQuery({ queryKey: ['scenarios'], queryFn: api.scenarios });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const starting = useRef(false);

  async function start(id: string) {
    if (starting.current) return;
    starting.current = true;
    setBusy(id);
    setMessage('');
    try {
      const journey = await api.scenarioRun(id);
      const journeyId = encodeURIComponent(journey.id);
      router.push(journey.state === 'WAITING_FOR_RIDE' ? `/compare?journey=${journeyId}` : `/journey/${journeyId}`);
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'Could not start the simulation.');
      starting.current = false;
      setBusy(null);
    }
  }

  return (
    <>
      <header className={styles.heading}>
        <span className="eyebrow">ReHop simulator</span>
        <h1>Demo console<span className="highlight">.</span></h1>
        <p className="lead">Run a scenario and advance the clock to inspect ReHop’s decisions. All rides, provider responses, and telemetry are simulated.</p>
      </header>
      {query.isPending && <p role="status">Loading scenarios…</p>}
      {query.error && (
        <div className="error" role="alert">
          <p>{query.error.message}</p>
          <button className="btn secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry connection</button>
        </div>
      )}
      {message && <p className="error" role="alert">{message}</p>}
      {query.data?.scenarios.length === 0 && <p className="muted">The simulator has no scenarios available.</p>}
      <ul className="scenario-list">
        {query.data?.scenarios.map((scenario) => (
          <li className={`panel ${styles.scenario}`} key={scenario.id}>
            <span className="badge">{scenario.id}</span>
            <h2>{scenario.name}</h2>
            {walkthroughs[scenario.id] && <p className="helper">{walkthroughs[scenario.id]}</p>}
            <div className={styles.action}>
              <button
                className="btn secondary"
                aria-label={`Run ${scenario.id} ${scenario.name}`}
                disabled={busy !== null || query.isError}
                onClick={() => void start(scenario.id)}
              >
                {busy === scenario.id ? 'Starting…' : 'Run scenario'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
