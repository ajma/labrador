import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useAdoptable } from '../hooks/useAdoptable';
import { AdoptableStacksList } from './AdoptableStacksList';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AdoptStacksDialog({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { data: stacks, isLoading } = useAdoptable();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) el.showModal();
    else if (el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    const handle = () => onClose();
    el?.addEventListener('close', handle);
    return () => el?.removeEventListener('close', handle);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-md rounded-2xl border border-white/[0.22] bg-popover p-6 text-white backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Adopt stacks</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {stacks && stacks.length > 0 && (
        <AdoptableStacksList stacks={stacks} onAdopted={onClose} />
      )}
      {stacks && stacks.length === 0 && (
        <p className="text-sm text-muted-foreground">No adoptable stacks found.</p>
      )}
    </dialog>
  );
}
