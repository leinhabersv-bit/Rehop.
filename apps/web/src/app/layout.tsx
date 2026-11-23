import './globals.css';
import Link from 'next/link';
import Providers from './providers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RideRescue | Your cab cancelled. Your plans shouldn’t.',
  description: 'Simulation-first pickup monitoring and safe recovery demo.'
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body><Providers>
    <div className="app"><header className="topbar"><Link href="/" className="brand"><span className="brand-icon">RR</span>RIDE<span>RESCUE</span></Link>
    <nav><Link href="/">Book</Link><Link href="/demo">Demo console</Link></nav></header>
    <main className="main">{children}</main>
    <footer className="footer"><span>RideRescue • Hackathon simulator</span><strong>All providers, locations and fares are simulated.</strong></footer></div>
  </Providers></body></html>;
}
