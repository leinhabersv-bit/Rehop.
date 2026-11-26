import { Route } from 'lucide-react';

export function RoutePending({ message = 'Opening screen…' }: { message?: string }) {
  return (
    <div role="status" className="mx-auto flex min-h-20 max-w-6xl items-center gap-3 rounded-2xl border border-[#d9dbe7] bg-[#fffdf8] px-4 py-3 text-sm font-semibold text-[#43536b]">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf1ff] text-[#173ed7]"><Route size={20} aria-hidden="true" /></span>
      {message}
    </div>
  );
}
