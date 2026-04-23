import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [5, 10, 15, 25, 50] as const;

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const totalPages = Math.ceil(total / pageSize);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-white/[0.18] px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-[rgba(255,255,255,0.38)]">
        <span>Rows per page:</span>
        <select
          className="h-7 rounded-lg border border-white/[0.14] bg-background/[0.78] px-2 text-xs text-[rgba(255,255,255,0.75)] outline-none focus:border-primary/[0.4]"
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-[rgba(255,255,255,0.38)]">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.18] text-[rgba(255,255,255,0.45)] transition-colors hover:border-white/[0.20] hover:text-[rgba(255,255,255,0.75)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.18] text-[rgba(255,255,255,0.45)] transition-colors hover:border-white/[0.20] hover:text-[rgba(255,255,255,0.75)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
