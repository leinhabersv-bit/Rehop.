import './globals.css';
import type { Metadata } from 'next';
import Providers from './providers';
import { Navbar, Footer } from '@/components/ui';

export const metadata: Metadata = {
  title: 'ReHop | Your ride. No interruptions.',
  description: 'Simulation-first AI ride recovery companion.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-[#fff9f0] text-[#171b37] antialiased">
        <Providers>
          <Navbar />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
