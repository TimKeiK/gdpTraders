import { useEffect, useRef, useState } from 'react';
import { Bell, Banknote, TrendingUp, TrendingDown, RefreshCw, CheckCircle2 } from 'lucide-react';

interface NotificationItem {
  id: string;
  icon: 'accrual' | 'market-up' | 'market-down' | 'deposit' | 'security';
  title: string;
  detail: string;
  time: string;
}

const DEFAULT_ITEMS: NotificationItem[] = [
  {
    id: 'nd-1',
    icon: 'accrual',
    title: 'Daily accrual credited',
    detail: 'Your Silver Plan earned +$3.80 in passive income today.',
    time: 'Today · 12:00 AM',
  },
  {
    id: 'nd-2',
    icon: 'market-down',
    title: 'BTC moving',
    detail: 'Bitcoin is down ~3% over the last hour — a normal market swing.',
    time: 'Today · 9:40 AM',
  },
  {
    id: 'nd-3',
    icon: 'deposit',
    title: 'Deposit confirmed',
    detail: 'Your last deposit was confirmed and allocated to BTC.',
    time: 'Yesterday',
  },
  {
    id: 'nd-4',
    icon: 'security',
    title: 'Account security tip',
    detail: 'Two-factor authentication is strongly recommended for withdrawals.',
    time: '2 days ago',
  },
];

const ICONS = {
  accrual: { Icon: Banknote, color: '#22C55E' },
  'market-up': { Icon: TrendingUp, color: '#22C55E' },
  'market-down': { Icon: TrendingDown, color: '#EF4444' },
  deposit: { Icon: CheckCircle2, color: '#A78BFA' },
  security: { Icon: RefreshCw, color: '#F59E0B' },
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);
  const [items] = useState<NotificationItem[]>(DEFAULT_ITEMS);

  const unread = items.filter((i) => !readIds.has(i.id)).length;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // Mark everything read when the panel closes after being opened.
  const toggle = () => {
    if (open) setReadIds(new Set(items.map((i) => i.id)));
    setOpen((o) => !o);
  };

  return (
    <div className={`notif-wrap ${open ? 'open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="notif-bell"
        onClick={toggle}
        aria-label={open ? 'Close notifications' : `Notifications, ${unread} unread`}
        aria-expanded={open}
      >
        <Bell size={20} />
        {unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            <span className="notif-clear" onClick={() => setReadIds(new Set(items.map((i) => i.id)))} role="button" tabIndex={0}>
              Mark all read
            </span>
          </div>
          <ul className="notif-list">
            {items.map((item) => {
              const { Icon, color } = ICONS[item.icon];
              const read = readIds.has(item.id);
              return (
                <li key={item.id} className={`notif-item ${read ? 'read' : ''}`}>
                  <span className="notif-icon" style={{ color, background: `${color}22` }}>
                    <Icon size={16} />
                  </span>
                  <div className="notif-body">
                    <strong className="notif-title">{item.title}</strong>
                    <p className="notif-detail">{item.detail}</p>
                    <span className="notif-time">{item.time}</span>
                  </div>
                  {!read && <span className="notif-unread-dot" aria-label="Unread" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}