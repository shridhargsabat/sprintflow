import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { GLASS_PANEL } from '../constants';
import Scrollable from './Scrollable';

export const MODAL_HEADER_CLASS =
  'px-6 py-4 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between';

export const MODAL_CLOSE_BUTTON_CLASS =
  'w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-white/60 dark:hover:bg-white/10 flex items-center justify-center';

interface ModalProps {
  onClose: () => void;
  /** Header left content (title block). */
  title: ReactNode;
  /** Scroll-body content. */
  children: ReactNode;
  /** Rendered inside the scroll container after children (Close/Cancel row). */
  footer?: ReactNode;
  /** Rendered inside the backdrop after the panel (nested confirm dialogs). */
  after?: ReactNode;
  label?: string;
  labelledBy?: string;
  role?: 'dialog' | 'alertdialog';
  zClass?: string;
  maxWidth?: string;
  rounded?: string;
  /** Extra panel classes (e.g. flex-column mobile layouts). */
  panelLayout?: string;
  headerClassName?: string;
  /** X-button aria-label (omit = no aria-label, like most modals); null hides the X. */
  closeLabel?: string | null;
  closeButtonClassName?: string;
  /** Full X-button override (e.g. tooltip-wrapped). Null hides it. */
  closeButton?: ReactNode | null;
  bodyClassName?: string;
  /** Scroll cap for the body; null = no cap. */
  bodyMaxH?: string | null;
  /** False renders a plain div body (no scroll container). */
  scroll?: boolean;
  slim?: boolean;
}

/**
 * Shared modal shell: backdrop + glass panel + header/X + scroll body
 * (via Scrollable) + footer slot. Extracted from the SprintReportModal
 * pattern; pixel-neutral with the per-modal copies it replaces.
 */
export function Modal({
  onClose,
  title,
  children,
  footer,
  after,
  label,
  labelledBy,
  role = 'dialog',
  zClass = 'z-50',
  maxWidth = 'max-w-lg',
  rounded = 'rounded-[32px]',
  panelLayout = '',
  headerClassName = MODAL_HEADER_CLASS,
  closeLabel,
  closeButtonClassName = MODAL_CLOSE_BUTTON_CLASS,
  closeButton,
  bodyClassName = 'p-6 space-y-4',
  bodyMaxH = '80vh',
  scroll = true,
  slim = true
}: ModalProps) {
  const close =
    closeButton !== undefined ? (
      closeButton
    ) : closeLabel === null ? null : (
      <button
        type="button"
        onClick={onClose}
        {...(closeLabel !== undefined ? { 'aria-label': closeLabel } : {})}
        className={closeButtonClassName}
      >
        <X className="w-4 h-4" />
      </button>
    );

  return (
    <div
      onClick={onClose}
      className={`lg-modal-backdrop fixed inset-0 ${zClass} flex items-center justify-center p-4 bg-slate-950/35 backdrop-blur-md`}
    >
      <div
        onClick={e => e.stopPropagation()}
        role={role}
        aria-modal="true"
        {...(labelledBy !== undefined ? { 'aria-labelledby': labelledBy } : label !== undefined ? { 'aria-label': label } : {})}
        className={`lg-modal-panel w-full ${maxWidth} ${rounded} overflow-hidden ${GLASS_PANEL}${panelLayout ? ` ${panelLayout}` : ''}`}
      >
        <div className={headerClassName}>
          {title}
          {close}
        </div>

        {scroll ? (
          <Scrollable slim={slim} maxH={bodyMaxH ?? undefined} className={bodyClassName}>
            {children}
            {footer}
          </Scrollable>
        ) : (
          <div className={bodyClassName}>
            {children}
            {footer}
          </div>
        )}
      </div>
      {after}
    </div>
  );
}

export default Modal;
