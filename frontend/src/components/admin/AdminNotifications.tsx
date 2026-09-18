import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CircleDollarSign,
  LogIn,
  ShieldCheck,
  UserCheck,
  ScrollText,
  ChevronRight,
} from 'lucide-react';
import {
  adminApi,
  roundNumbersInText,
  type AdminNotification,
  type NotificationTier,
} from '../../api/client';
import './AdminNotifications.css';

/** Bell refresh cadence — no websocket/SSE in this stack, so interval polling. */
const POLL_MS = 45_000;

const TIER_META: Record<NotificationTier, { label: string; icon: typeof Bell }> = {
  urgent: { label: 'Needs a decision', icon: AlertTriangle },
  info: { label: 'Money movement', icon: CircleDollarSign },
  low: { label: 'Routine', icon: LogIn },
};

function itemIcon(n: AdminNotification) {
  if (n.action.startsWith('WITHDRAWAL')) return n.action === 'WITHDRAWAL_EXECUTED' ? ArrowUpCircle : ShieldCheck;
  if (n.action.startsWith('DEPOSIT')) return ArrowDownCircle;
  if (n.action.startsWith('KYC')) return UserCheck;
  return TIER_META[n.tier].icon;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function oneLine(details: string): string {
  const first = details.split(/[.\n]/, 1)[0] ?? details;
  return first.length > 110 ? `${first.slice(0, 109)}…` : first;
}

export default function AdminNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.getNotifications(50);
      setItems(res.items);
      setUnread(res.unreadCount);
    } catch {
      // The bell degrades to empty instead of breaking the admin shell.
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);


  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open ]);

  const groups = useMemo(() => {
    const order: NotificationTier[] = ['urgent', 'info', 'low'];
    return order
      .map((tier) => ({ tier, items: items.filter((i) => i.tier === tier) }))
      .filter((g) => g.items.length > 0);
  }, [items]);

  const markAllRead = async () => {
    if (marking || unread === 0) return;
    setMarking(true);
    try {
      const res = await adminApi.markNotificationsRead(undefined, true);
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setUnread(res.unreadCount);
    } catch {
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      setUnread(0);
    } finally {
      setMarking(false);
    }
  };

  const openItem = (n: AdminNotification) => {
    if (!n.read) {
      adminApi.markNotificationsRead([n.eventId])
        .then((res) => {
          setItems((prev) => prev.map((i) => (i.eventId === n.eventId ? { ...i, read: true } : i)));
          setUnread(res.unreadCount);
        })
        .catch(() => undefined);
    }
    setOpen(false);
    if (n.link) navigate(n.link.to);
  };

  return (
    <div className="admin-bell" ref={panelRef}>
      <button
        className="admin-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="admin-bell-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="admin-bell-panel" role="dialog" aria-label="Notifications">
          <div className="admin-bell-head">
            <span className="admin-bell-title">Notifications</span>
            <button
              className="admin-bell-markall"
              onClick={markAllRead}
              disabled={marking || unread === 0}
              title="Mark all read"
            >
              <CheckCheck size={14} /> {marking ? 'Marking…' : 'Mark all read'}
            </button>
          </div>

          <div className="admin-bell-body">
            {items.length === 0 && (
              <div className="admin-bell-empty">Nothing to review. New sign-ins, deposits and approvals land here.</div>
            )}
            {groups.map((g) => {
              const TierIcon = TIER_META[g.tier].icon;
              return (
                <div key={g.tier} className="admin-bell-group">
                  <div className="admin-bell-group-label">
                    <TierIcon size={12} /> {TIER_META[g.tier].label}
                  </div>
                  {g.items.map((n) => {
                    const Icon = itemIcon(n);
                    return (
                      <button
                        key={n.eventId}
                        className={`admin-bell-item tier-${n.tier}${n.read ? ' is-read' : ''}`}
                        onClick={() => openItem(n)}
                        title={n.link ? n.link.label : n.action}
                      >
                        <span className="admin-bell-item-icon"><Icon size={15} /></span>
                        <span className="admin-bell-item-main">
                          <span className="admin-bell-item-text">{oneLine(roundNumbersInText(n.details))}</span>
                          <span className="admin-bell-item-meta">
                            <span className="admin-bell-item-action">{n.action}</span>
                            <span aria-hidden="true">·</span>
                            <span>{timeAgo(n.createdAt)}</span>
                            {n.link && <ChevronRight size={12} className="admin-bell-item-go" />}
                          </span>
                        </span>
                        {!n.read && <span className="admin-bell-item-dot" aria-label="Unread" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <Link to="/admin/audit-logs" className="admin-bell-foot" onClick={() => setOpen(false)}>
            <ScrollText size={14} /> View all activity
          </Link>
        </div>
      )}
    </div>
  );
}
