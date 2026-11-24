import { Suspense } from 'react';
import { CompareScreen } from '@/components/booking/CompareScreen';

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-sm text-[#475673]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#173ed7] border-t-transparent" />
          <span>Loading your recommended ride…</span>
        </div>
      }
    >
      <CompareScreen />
    </Suspense>
  );
}
