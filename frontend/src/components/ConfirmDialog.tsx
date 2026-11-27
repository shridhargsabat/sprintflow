import { useEffect, useRef } from 'react';
import type React from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  children,
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element | null {
  useEscapeKey(onCancel, open);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <Modal
      onClose={onCancel}
      role="alertdialog"
      zClass="z-[60]"
      maxWidth="max-w-sm"
      rounded="rounded-[24px]"
      label={title}
      closeLabel={null}
      headerClassName="px-6 py-4 border-b border-slate-900/10 dark:border-white/10"
      scroll={false}
      title={<h3 className="text-sm font-semibold">{title}</h3>}
    >
      <p className="text-xs text-slate-600 dark:text-slate-300">{message}</p>
      {children}
      <div className="flex gap-2 justify-end">
        <button
          ref={cancelRef}
          autoFocus
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-full text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={
            danger
              ? 'px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-rose-500 to-rose-600 text-white'
              : 'px-4 py-2 rounded-full text-xs font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white'
          }
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
