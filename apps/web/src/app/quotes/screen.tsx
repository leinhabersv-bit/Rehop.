'use client';
import { useSearchParams, redirect } from 'next/navigation';

export default function QuoteScreen() {
  const id = useSearchParams().get('journey');
  return redirect(id ? `/compare?journey=${encodeURIComponent(id)}` : '/book');
}
