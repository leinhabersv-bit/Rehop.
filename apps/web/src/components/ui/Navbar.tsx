'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function Navbar() {
  const path = usePathname();
  const rides = path === '/trips' || path.startsWith('/journey/');
  return (
    <header className="sticky top-0 z-50 border-b border-[#d9dbe7] bg-[#fff9f0]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
        <Link href="/" aria-label="ReHop home" className="inline-flex items-center gap-2 text-xl font-black tracking-tight text-[#171b37]">
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#173ed7] text-[#ffb27d]"><ArrowUpRight size={22} strokeWidth={3} aria-hidden="true" /></span>
          ReHop
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-1 text-sm font-bold text-[#171b37] sm:gap-3">
          <Link href="/trips" aria-current={rides ? 'page' : undefined} className={`rounded-full px-3 py-2 hover:bg-[#eee8df] ${rides ? 'bg-[#e4eaff] text-[#173ed7]' : ''}`}>Your rides</Link>
          <Link href="/book" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#173ed7] px-3 text-white hover:bg-[#1232b5] sm:px-4"><span>Book</span><ArrowRight size={15} aria-hidden="true" /></Link>
        </nav>
      </div>
    </header>
  );
}
