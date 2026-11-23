'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, House } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface BrowserNavigation extends EventTarget {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

const back = 1;
const forward = 2;

function browserNavigation() {
  return (window as Window & { navigation?: BrowserNavigation }).navigation;
}

function availableDirections() {
  const navigation = browserNavigation();
  return (navigation?.canGoBack ? back : 0) | (navigation?.canGoForward ? forward : 0);
}

function subscribeToHistory(update: () => void) {
  const navigation = browserNavigation();
  navigation?.addEventListener('currententrychange', update);
  window.addEventListener('pageshow', update);
  return () => {
    navigation?.removeEventListener('currententrychange', update);
    window.removeEventListener('pageshow', update);
  };
}

function traverse(direction: typeof back | typeof forward) {
  if (availableDirections() & direction) window.history.go(direction === back ? -1 : 1);
}

const navButton = 'inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 font-bold focus-visible:outline-2 focus-visible:outline-[#173ed7] disabled:opacity-35 sm:min-h-9';

export function Navbar() {
  const path = usePathname();
  const rides = path === '/trips' || path.startsWith('/journey/');
  const directions = useSyncExternalStore(subscribeToHistory, availableDirections, () => 0);
  return (
    <header className="sticky top-0 z-50 border-b border-[#d9dbe7] bg-[#fff9f0]/95 backdrop-blur">
      <div className="mx-auto grid h-24 max-w-7xl grid-cols-[1fr_auto] grid-rows-2 items-center gap-x-2 px-4 sm:h-16 sm:grid-cols-[1fr_auto_1fr] sm:grid-rows-1 sm:gap-3 sm:px-8">
        <Link href="/" aria-label="RIDE & SEEK home" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-black tracking-tight text-[#171b37] sm:gap-2 sm:text-xl">
          <span className="grid size-8 place-items-center rounded-[11px] bg-[#173ed7] text-[#ffb27d] sm:size-9"><ArrowUpRight size={21} strokeWidth={3} aria-hidden="true" /></span>
          RIDE &amp; SEEK
        </Link>
        <nav aria-label="Page navigation" className="col-span-2 row-start-2 grid grid-cols-3 items-center gap-1 rounded-xl border border-[#e0d9d1] bg-[#fffdf8] text-xs text-[#171b37] sm:col-span-1 sm:row-start-1 sm:flex sm:p-0.5 sm:text-sm">
          <button type="button" className={`${navButton} enabled:hover:bg-[#edf1ff]`} disabled={!(directions & back)} onClick={() => traverse(back)}>
            <ArrowLeft size={15} aria-hidden="true" /> Back
          </button>
          <Link href="/" aria-current={path === '/' ? 'page' : undefined} className={`${navButton} text-[#173ed7] hover:bg-[#edf1ff] ${path === '/' ? 'bg-[#e4eaff]' : ''}`}>
            <House size={15} aria-hidden="true" /> Home
          </Link>
          <button type="button" className={`${navButton} enabled:hover:bg-[#edf1ff]`} disabled={!(directions & forward)} onClick={() => traverse(forward)}>
            Forward <ArrowRight size={15} aria-hidden="true" />
          </button>
        </nav>
        <nav aria-label="Main navigation" className="col-start-2 row-start-1 flex items-center justify-end gap-1 text-sm font-bold text-[#171b37] sm:col-start-3 sm:gap-3">
          <Link href="/trips" aria-current={rides ? 'page' : undefined} className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-2 hover:bg-[#eee8df] sm:min-h-10 sm:px-3 ${rides ? 'bg-[#e4eaff] text-[#173ed7]' : ''}`}>Your rides</Link>
          <Link href="/book" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#173ed7] px-3 text-white hover:bg-[#1232b5] sm:min-h-10 sm:px-4"><span>Book</span><ArrowRight size={15} aria-hidden="true" /></Link>
        </nav>
      </div>
    </header>
  );
}
