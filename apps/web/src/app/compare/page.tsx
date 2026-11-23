import { Suspense } from 'react';
import { CompareScreen } from '@/components/booking/CompareScreen';

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-sm text-[#98A5BC]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B9FF45] border-t-transparent" />
          <span>Loading simulated ride comparisons…</span>
        </div>
      }
    >
      <CompareScreen />
    </Suspense>
  );
}
