import { useEffect } from 'react';

type Closer = () => void;

const stack: Closer[] = [];
let listenerAttached = false;

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (top) top();
}

function ensureListener(): void {
  if (listenerAttached || typeof document === 'undefined') return;
  document.addEventListener('keydown', handleKeyDown);
  listenerAttached = true;
}

export function useEscapeKey(onClose: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    ensureListener();
    stack.push(onClose);
    return () => {
      const idx = stack.lastIndexOf(onClose);
      if (idx !== -1) stack.splice(idx, 1);
    };
  }, [onClose, enabled]);
}
