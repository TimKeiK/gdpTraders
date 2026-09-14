import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface KpiModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Accessible glassmorphism modal: Escape to close, backdrop click to close,
 * body scroll lock, and basic focus containment.
 */
export default function KpiModal({ open, title, subtitle, onClose, children }: KpiModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  // Scroll lock + focus retention while open.
  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const closeBtn = panelRef.current?.querySelector<HTMLButtonElement>('[data-modal-close]');
    closeBtn?.focus();
    return () => {
      document.body.style.overflow = '';
      lastFocused.current?.focus?.();
    };
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="kpi-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className="kpi-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kpi-modal-head">
          <div>
            <h3 className="kpi-modal-title">{title}</h3>
            {subtitle && <p className="kpi-modal-sub">{subtitle}</p>}
          </div>
          <button type="button" className="kpi-modal-close" data-modal-close aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="kpi-modal-body">{children}</div>
      </div>
    </div>
  );
}