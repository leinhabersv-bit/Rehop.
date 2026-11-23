import React from 'react';
import Link from 'next/link';
import { Badge } from './Badge';

export interface FooterProps {
  className?: string;
}

export function Footer({ className = '' }: FooterProps) {
  return (
    <footer className={`w-full border-t border-[#243249] bg-[#090F1D] text-[#98A5BC] ${className}`}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-[#243249]">
          {/* Brand & Tagline */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#B9FF45] font-black text-[#090F1D] text-xs">
                RH
              </span>
              <span className="text-xl font-extrabold text-[#F6F8FC] tracking-tight">
                ReHop
              </span>
              <Badge variant="simulation" size="sm" dot>
                Simulation
              </Badge>
            </div>
            <p className="text-sm text-[#F6F8FC] font-medium">
              Your ride. No interruptions.
            </p>
            <p className="text-xs text-[#98A5BC] max-w-md leading-relaxed">
              The intelligent ride companion that monitors pickup progress, flags driver anomalies,
              and prepares safe backup recoveries before plans are ruined.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#F6F8FC]">
              Navigation
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="hover:text-[#B9FF45] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/book" className="hover:text-[#B9FF45] transition-colors">
                  Book a ride
                </Link>
              </li>
              <li>
                <Link href="/compare" className="hover:text-[#B9FF45] transition-colors">
                  Compare providers
                </Link>
              </li>
              <li>
                <Link href="/demo" className="hover:text-[#B9FF45] transition-colors">
                  Demo console
                </Link>
              </li>
            </ul>
          </div>

          {/* Simulated Protocol */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#F6F8FC]">
              Architecture
            </h4>
            <p className="text-xs text-[#98A5BC] leading-relaxed">
              Built on an ONDC/Beckn-inspired simulated aggregator protocol. Features deterministic
              movement ticks, bounded LLM intent parsing, and policy-driven recovery.
            </p>
          </div>
        </div>

        {/* Simulation Truthfulness Banner */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#98A5BC]">
          <div className="flex items-center gap-2 text-center md:text-left">
            <span className="w-2 h-2 rounded-full bg-[#FFBD63] shrink-0" />
            <span className="font-semibold text-[#F6F8FC]">Simulation truthfulness notice:</span>
            <span>All providers (Provider A-D), fares and telemetry are simulated. No real cab is booked.</span>
          </div>

          <div className="text-center md:text-right text-[11px] text-[#98A5BC]/70">
            ReHop • Hackathon Demonstrator
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
