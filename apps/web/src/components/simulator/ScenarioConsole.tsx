'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Play } from 'lucide-react';
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
  const featured = query.data?.scenarios.find((scenario) => scenario.id === 'S03');

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
      {featured && (
        <section aria-labelledby="featured-demo" className="mb-6 grid gap-5 rounded-3xl border border-[#B9FF45]/40 bg-gradient-to-br from-[#1c312e] to-[#101a2b] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#d8ffa1]"><Play size={15} aria-hidden="true" /> Start here</p>
            <h2 id="featured-demo" className="text-2xl font-black sm:text-3xl">Recover a stalled pickup</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#bdc9db]">A driver stops making progress. Advance the clock, see ReHop’s recommendation, then approve a switch and confirm boarding.</p>
          </div>
          <button type="button" aria-label="Run S03 stalled pickup demo" disabled={busy !== null || query.isError} onClick={() => void start(featured.id)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#B9FF45] px-5 text-sm font-extrabold text-[#0a121a] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9FF45]">
            {busy === featured.id ? 'Starting…' : 'Run recovery demo'} <ArrowRight size={17} aria-hidden="true" />
          </button>
        </section>
      )}
      {query.data && query.data.scenarios.length > 1 && <h2 className="mb-3 text-xl font-black">More scenarios</h2>}
      <ul className="scenario-list">
        {query.data?.scenarios.filter((scenario) => scenario.id !== featured?.id).map((scenario) => (
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
