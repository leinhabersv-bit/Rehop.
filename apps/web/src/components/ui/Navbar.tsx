'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Badge } from './Badge';

export interface NavbarProps {
  className?: string;
}

export function Navbar({ className = '' }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/book', label: 'Book' },
    { href: '/compare', label: 'Compare' },
    { href: '/demo', label: 'Demo' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href);
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b border-[#243249] bg-[#090F1D]/85 backdrop-blur-md transition-colors ${className}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center group transition-transform active:scale-95"
            aria-label="ReHop Home"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B9FF45] font-black text-[#090F1D] text-sm tracking-tight shadow-[0_0_16px_rgba(185,255,69,0.35)] mr-2.5 transition-transform group-hover:scale-105">
              RH
            </span>
            <div className="flex flex-col">
              <span className="text-xl font-extrabold tracking-tight text-[#F6F8FC]">
                ReHop
              </span>
            </div>
          </Link>

          <Badge variant="simulation" size="sm" dot className="hidden sm:inline-flex">
            Simulation
          </Badge>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5" aria-label="Main Navigation">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150
                  ${
                    active
                      ? 'bg-[#151F32] text-[#B9FF45] shadow-sm'
                      : 'text-[#98A5BC] hover:text-[#F6F8FC] hover:bg-[#151F32]/60'
                  }
                `}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop CTA / Status */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/book"
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-bold rounded-xl bg-[#B9FF45] text-[#090F1D] hover:brightness-105 transition-all shadow-[0_2px_10px_rgba(185,255,69,0.2)] active:scale-95"
          >
            Find a ride
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center gap-2">
          <Badge variant="simulation" size="sm" dot>
            Sim
          </Badge>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-xl text-[#98A5BC] hover:text-[#F6F8FC] hover:bg-[#151F32] transition-colors focus:outline-none focus:ring-2 focus:ring-[#B9FF45]"
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {isOpen && (
        <div className="md:hidden border-t border-[#243249] bg-[#090F1D]/95 px-4 pt-3 pb-5 space-y-2 backdrop-blur-lg">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`
                  flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-colors
                  ${
                    active
                      ? 'bg-[#151F32] text-[#B9FF45]'
                      : 'text-[#98A5BC] hover:text-[#F6F8FC] hover:bg-[#151F32]/60'
                  }
                `}
              >
                <span>{link.label}</span>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-[#B9FF45]" />}
              </Link>
            );
          })}
          <div className="pt-2">
            <Link
              href="/book"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center justify-center py-3 text-sm font-bold rounded-xl bg-[#B9FF45] text-[#090F1D] hover:brightness-105 transition-all"
            >
              Find a ride
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;
