'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarPlus, CarFront, House } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useActiveRide } from '@/components/journey/ActiveRide';

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
  const { active, checking } = useActiveRide();
  const showStandardNav = !active && !checking;
  const primary = active ? { href: `/journey/${encodeURIComponent(active.id)}`, label: 'Track ride', Icon: CarFront }
    : checking ? null : { href: '/book', label: 'Book', Icon: CalendarPlus };
  const home = { href: active || path === '/home' ? '/home' : '/', label: 'Home', Icon: House };
  const mobileTabs = primary ? [home, primary, ...(showStandardNav ? [{ href: '/trips', label: 'Your rides', Icon: CarFront }] : [])] : [];
  const rides = path === '/trips' || path.startsWith('/journey/');
  const booking = path === '/book' || path === '/compare' || path === '/quotes';
  const currentTab = primary?.href === path ? path : rides ? '/trips' : booking && !active ? '/book' : path;
  const directions = useSyncExternalStore(subscribeToHistory, availableDirections, () => 0);
  const brandClass = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-black tracking-tight text-[#171b37] sm:min-h-0 sm:gap-2 sm:text-xl';
  const brand = <>
    <span className="grid size-7 shrink-0 place-items-center rounded-[10px] bg-[#173ed7] text-[#ffb27d] sm:size-9 sm:rounded-[11px]"><ArrowUpRight size={21} strokeWidth={3} aria-hidden="true" /></span>
    RIDE &amp; SEEK
  </>;
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[#d9dbe7] bg-[#fff9f0]/95 backdrop-blur">
        <div className="mx-auto grid h-14 max-w-7xl grid-cols-[minmax(0,1fr)_auto] grid-rows-1 items-center gap-x-0.5 px-3 sm:h-16 sm:grid-cols-[1fr_auto_1fr] sm:grid-rows-1 sm:gap-3 sm:px-8">
          {(showStandardNav || active) ? <Link href={home.href} aria-label="RIDE & SEEK home" className={brandClass}>{brand}</Link> :
            <span className={brandClass}>{brand}</span>}
          {showStandardNav && <nav aria-label="Page navigation" className="col-start-2 row-start-1 flex items-center rounded-xl text-xs text-[#171b37] sm:col-span-1 sm:border sm:border-[#e0d9d1] sm:bg-[#fffdf8] sm:gap-1 sm:p-0.5 sm:text-sm">
            <button type="button" className={`${navButton} max-sm:w-11 enabled:hover:bg-[#edf1ff]`} disabled={!(directions & back)} onClick={() => traverse(back)}>
              <ArrowLeft size={15} className="max-sm:size-[18px]" aria-hidden="true" /> <span className="max-sm:sr-only">Back</span>
            </button>
            <Link href="/" aria-current={path === '/' ? 'page' : undefined} className={`${navButton} max-sm:hidden text-[#173ed7] hover:bg-[#edf1ff] ${path === '/' ? 'bg-[#e4eaff]' : ''}`}>
              <House size={15} aria-hidden="true" /> Home
            </Link>
            <button type="button" className={`${navButton} max-sm:w-11 enabled:hover:bg-[#edf1ff]`} disabled={!(directions & forward)} onClick={() => traverse(forward)}>
              <span className="max-sm:sr-only">Forward</span> <ArrowRight size={15} className="max-sm:size-[18px]" aria-hidden="true" />
            </button>
          </nav>}
          {(showStandardNav || active) && <nav aria-label="Main navigation" className="col-start-3 row-start-1 hidden items-center justify-end gap-0.5 text-sm font-bold text-[#171b37] sm:flex sm:gap-3">
            {active && <Link href={home.href} aria-current={path === home.href ? 'page' : undefined}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 hover:bg-[#eee8df]">
              <House size={15} aria-hidden="true" /> Home
            </Link>}
            {showStandardNav && <Link href="/trips" aria-current={rides ? 'page' : undefined} className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-2 hover:bg-[#eee8df] sm:min-h-10 sm:px-3 ${rides ? 'bg-[#e4eaff] text-[#173ed7]' : ''}`}>
              <span>Your rides</span>
            </Link>}
            {primary && <Link href={primary.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#173ed7] px-3 text-white hover:bg-[#1232b5] max-sm:px-2.5 max-sm:text-xs sm:min-h-10 sm:px-4"><span>{primary.label}</span><ArrowRight size={15} className="max-sm:hidden" aria-hidden="true" /></Link>}
          </nav>}
        </div>
      </header>
      {mobileTabs.length > 0 && <nav aria-label="Mobile navigation" className="mobile-tab-bar fixed inset-x-0 bottom-0 z-40 border-t border-[#d9dbe7] bg-[#fffdf8]/95 shadow-[0_-6px_20px_#171b370d] backdrop-blur sm:hidden">
        <div className={`grid gap-1 px-3 py-1.5 ${active ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {mobileTabs.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={currentTab === href ? 'page' : undefined}
              className="flex min-h-[51px] flex-col items-center justify-center gap-1 rounded-xl text-xs font-bold leading-none text-[#475673] aria-[current=page]:bg-[#e4eaff] aria-[current=page]:text-[#173ed7] focus-visible:outline-2 focus-visible:outline-[#173ed7]"
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </nav>}
    </>
  );
}
