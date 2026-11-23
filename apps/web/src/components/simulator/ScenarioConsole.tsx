'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Ban, Route, ShieldCheck, Zap } from 'lucide-react';
import { api } from '@/lib/api/client';
import styles from './scenarios.module.css';

const walkthroughs: Record<string, string> = {
  S01: 'Advance 2 min, then confirm boarding.',
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
  const featured = query.data?.scenarios.find((scenario) => scenario.id === 'S04');

  const approvalDemo = query.data?.scenarios.find((scenario) => scenario.id === 'S03');

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
        <h1>Recovery demos<span className="highlight">.</span></h1>
        <p className="lead">See how ReHop responds when a driver cancels or a pickup stalls. All rides and provider responses are simulated.</p>
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
        <section aria-labelledby="featured-demo" className="mb-5 rounded-3xl border border-[#B9FF45]/40 bg-gradient-to-br from-[#1c342d] via-[#172831] to-[#101a2b] p-5 sm:p-8">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#d8ffa1]"><Zap size={16} aria-hidden="true" /> Automatic recovery</p>
          <h2 id="featured-demo" className="text-3xl font-black tracking-tight sm:text-5xl">Driver cancelled. ReHop takes it from here.</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#cad8e7] sm:text-base">This demo opts in ahead of time. ReHop checks and books an eligible backup after cancellation, without asking again.</p>
          <ol className="my-5 grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: Ban, label: 'Driver cancels' },
              { icon: Route, label: 'ReHop rechecks the backup' },
              { icon: ShieldCheck, label: 'Replacement confirmed' },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 rounded-xl border border-[#536473] bg-[#101a27] p-3 text-sm font-bold">
                <Icon size={17} className="shrink-0 text-[#B9FF45]" aria-hidden="true" /> {label}
              </li>
            ))}
          </ol>
          <button type="button" disabled={busy !== null || query.isError} onClick={() => void start(featured.id)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#B9FF45] px-5 text-sm font-extrabold text-[#0a121a] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9FF45] sm:w-auto">
            {busy === featured.id ? 'Starting…' : 'Run automatic recovery demo'} <ArrowRight size={17} aria-hidden="true" />
          </button>
        </section>
      )}
      {approvalDemo && (
        <section aria-labelledby="approval-demo" className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#34475e] bg-[#131e2f] p-5">
          <div>
            <h2 id="approval-demo" className="text-lg font-black">Driver stalled, ride still active</h2>
            <p className="mt-1 text-sm text-[#bdc9db]">ReHop can recommend a switch. The rider decides whether to cancel the active ride.</p>
          </div>
          <button type="button" aria-label="Run S03 stalled pickup demo" className="btn secondary" disabled={busy !== null || query.isError} onClick={() => void start(approvalDemo.id)}>
            {busy === approvalDemo.id ? 'Starting…' : 'Try the approval flow'}
          </button>
        </section>
      )}
      {!!query.data?.scenarios.some((scenario) => scenario.id !== featured?.id && scenario.id !== approvalDemo?.id) && (
        <details className="rounded-2xl border border-[#34475e] bg-[#101a29] p-5">
          <summary className="cursor-pointer rounded-md text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#B9FF45]">More scenarios</summary>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {query.data?.scenarios.filter((scenario) => scenario.id !== featured?.id && scenario.id !== approvalDemo?.id).map((scenario) => (
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
        </details>
      )}
    </>
  );
}
