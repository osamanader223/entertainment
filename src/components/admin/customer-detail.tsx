'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import { formatMoney, cn } from '@/lib/utils';
import type { CustomerDetail as CustomerDetailData, CustomerNote } from '@/lib/customers';
import { updateCustomerProfileAction, addCustomerNoteAction, listCustomerNotesAction } from '@/app/admin/customers/actions';
import {
  ArrowLeft, DollarSign, Activity, Wallet, Trophy, Flame, Gamepad2,
  Pencil, X, Loader2,
} from 'lucide-react';

const TIER_BADGE: Record<string, string> = {
  silver: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  gold: 'bg-gold-500/15 text-gold-400 border-gold-500/30',
  platinum: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30',
  diamond: 'bg-violet-400/15 text-violet-300 border-violet-400/30',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US');
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US');
}
function fmtDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}

interface CustomerDetailProps {
  customerId: string;
  initialDetail: CustomerDetailData;
  initialNotes: CustomerNote[];
}

export function CustomerDetail({ customerId, initialDetail, initialNotes }: CustomerDetailProps) {
  const { t } = useT();
  const [detail, setDetail] = useState(initialDetail);
  const [notes, setNotes] = useState(initialNotes);
  const [noteInput, setNoteInput] = useState('');
  const [addingNote, startAddingNote] = useTransition();
  const [loadingNotes, startLoadingNotes] = useTransition();

  const [editOpen, setEditOpen] = useState(false);
  const [editFullName, setEditFullName] = useState(detail.profile.fullName ?? '');
  const [editConsent, setEditConsent] = useState(detail.profile.marketingWhatsappConsent);
  const [savingEdit, setSavingEdit] = useState(false);

  const saveEdit = async () => {
    setSavingEdit(true);
    const res = await updateCustomerProfileAction({
      customerId,
      fullName: editFullName.trim() || undefined,
      marketingWhatsappConsent: editConsent,
    });
    setSavingEdit(false);
    if (!res.ok) { toast.error(res.error); return; }
    setDetail((d) => ({ ...d, profile: { ...d.profile, fullName: editFullName.trim(), marketingWhatsappConsent: editConsent } }));
    toast.success(t('adminCustomers.profileSaved'));
    setEditOpen(false);
  };

  const submitNote = () => {
    if (!noteInput.trim()) return;
    startAddingNote(async () => {
      const res = await addCustomerNoteAction({ customerId, note: noteInput.trim() });
      if (!res.ok) { toast.error(res.error); return; }
      setNoteInput('');
      toast.success(t('adminCustomers.noteAdded'));
      startLoadingNotes(async () => {
        const notesRes = await listCustomerNotesAction(customerId);
        if (notesRes.ok) setNotes(notesRes.notes);
      });
    });
  };

  const { profile, loyalty, wallet, stats } = detail;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('adminCustomers.backToList')}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{profile.fullName ?? '—'}</h1>
            <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase', TIER_BADGE[loyalty.tier] ?? TIER_BADGE.silver)}>
              {t(`loyalty.tier.${loyalty.tier}`)}
            </span>
            {profile.isWalkInCreated && !profile.claimedAt && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                {t('adminCustomers.walkIn')}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-mono mt-1">{profile.phone ?? profile.email ?? ''}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('adminCustomers.memberSince')} {fmtDate(profile.createdAt)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setEditFullName(profile.fullName ?? ''); setEditConsent(profile.marketingWhatsappConsent); setEditOpen(true); }}>
          <Pencil className="h-3.5 w-3.5" />
          {t('adminCustomers.edit')}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard icon={DollarSign} label={t('adminCustomers.totalSpent')} value={formatMoney(stats.totalSpentCents)} gold />
        <StatCard icon={Activity} label={t('adminCustomers.totalSessions')} value={stats.totalSessions.toLocaleString()} />
        <StatCard icon={Wallet} label={t('adminCustomers.walletBalance')} value={formatMoney(wallet.balanceCents)} />
        <StatCard icon={Trophy} label={t('adminCustomers.points')} value={loyalty.pointsBalance.toLocaleString()} />
        <StatCard icon={Flame} label={t('adminCustomers.streak')} value={t('adminCustomers.dayCount', { n: String(loyalty.currentStreakDays) })} />
        <StatCard icon={Gamepad2} label={t('adminCustomers.favoriteGame')} value={stats.favoriteGameType ?? '—'} />
      </div>

      {/* Loyalty progress */}
      <Card className="glass">
        <CardContent className="p-5 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('adminCustomers.loyaltyProgress')}</h3>
          {loyalty.nextTier ? (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('loyalty.pointsToNextTier', { points: String(loyalty.pointsToNextTier ?? 0), tier: t(`loyalty.tier.${loyalty.nextTier}`) })}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300"
                  style={{ width: `${loyalty.progressPercent}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gradient-gold font-semibold">{t('loyalty.topTierReached')} 🎉</p>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
            <Flame className="h-3.5 w-3.5 text-gold-400" />
            {t('adminCustomers.currentStreak', { n: String(loyalty.currentStreakDays) })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title={t('adminCustomers.recentSessions')} empty={detail.recentSessions.length === 0} emptyLabel={t('adminCustomers.noSessions')}>
          {detail.recentSessions.map((s) => (
            <Row key={s.id}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.gameTypeName} · {s.stationCode}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(s.startedAt)} · {fmtDuration(s.durationSeconds)}</div>
              </div>
              <div className="text-end shrink-0">
                <div className="font-mono text-sm">{s.amountCents !== null ? formatMoney(s.amountCents) : '—'}</div>
                <StatusBadge status={s.status} />
              </div>
            </Row>
          ))}
        </Section>

        <Section title={t('adminCustomers.recentBookings')} empty={detail.recentBookings.length === 0} emptyLabel={t('adminCustomers.noBookings')}>
          {detail.recentBookings.map((b) => (
            <Row key={b.id}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{b.gameTypeName}</div>
                <div className="text-xs text-muted-foreground font-mono">{b.referenceCode} · {fmtDateTime(b.scheduledStartAt)}</div>
              </div>
              <StatusBadge status={b.status} />
            </Row>
          ))}
        </Section>

        <Section title={t('adminCustomers.recentPayments')} empty={detail.recentPayments.length === 0} emptyLabel={t('adminCustomers.noPayments')}>
          {detail.recentPayments.map((p, i) => (
            <Row key={i}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{p.purpose} · {p.method ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(p.createdAt)}</div>
              </div>
              <div className="text-end shrink-0">
                <div className="font-mono text-sm font-semibold">{formatMoney(p.amountCents)}</div>
                <StatusBadge status={p.status} />
              </div>
            </Row>
          ))}
        </Section>

        <Section title={t('adminCustomers.queueHistory')} empty={detail.queueHistory.length === 0} emptyLabel={t('adminCustomers.noQueueHistory')}>
          {detail.queueHistory.map((q, i) => (
            <Row key={i}>
              <div className="min-w-0">
                <div className="text-sm font-medium">#{q.ticketNumber} · {q.gameTypeName}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(q.createdAt)}</div>
              </div>
              <StatusBadge status={q.status} />
            </Row>
          ))}
        </Section>

        <Section title={t('adminCustomers.offersUsed')} empty={detail.offersUsed.length === 0} emptyLabel={t('adminCustomers.noOffersUsed')}>
          {detail.offersUsed.map((o, i) => (
            <Row key={i}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{o.offerName}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(o.redeemedAt)}</div>
              </div>
              <div className="font-mono text-sm text-emerald-400 shrink-0">−{formatMoney(o.discountCents)}</div>
            </Row>
          ))}
        </Section>

        <Section title={t('adminCustomers.walletLedger')} empty={detail.walletLedger.length === 0} emptyLabel={t('wallet.noTransactions')}>
          {detail.walletLedger.map((l, i) => {
            const isCredit = l.deltaCents > 0;
            return (
              <Row key={i}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{l.reason ?? l.kind}</div>
                  <div className="text-xs text-muted-foreground">{fmtDateTime(l.createdAt)}</div>
                </div>
                <div className={cn('font-mono text-sm font-semibold shrink-0', isCredit ? 'text-emerald-400' : 'text-rose-400')}>
                  {isCredit ? '+' : '−'}{formatMoney(Math.abs(l.deltaCents))}
                </div>
              </Row>
            );
          })}
        </Section>
      </div>

      {/* Quick actions */}
      <div>
        <Button variant="outline" asChild>
          <Link href="/admin/wallet">
            <Wallet className="h-4 w-4" />
            {t('adminCustomers.manageWallet')}
          </Link>
        </Button>
      </div>

      {/* Staff notes */}
      <Card className="glass">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('adminCustomers.staffNotes')}</h3>
          <div className="flex gap-2">
            <Input
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={t('adminCustomers.notePlaceholder')}
              disabled={addingNote}
            />
            <Button variant="gold" disabled={addingNote || !noteInput.trim()} onClick={submitNote}>
              {addingNote && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('adminCustomers.addNote')}
            </Button>
          </div>
          {loadingNotes && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">{t('adminCustomers.noNotes')}</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
                  <p className="text-sm">{n.note}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.authorName ?? '—'} · {fmtDateTime(n.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <Card className="w-full max-w-sm glass border-gold-500/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('adminCustomers.editProfile')}</h3>
                <button type="button" onClick={() => setEditOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('adminCustomers.fullName')}</Label>
                <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editConsent} onChange={(e) => setEditConsent(e.target.checked)} className="accent-gold-400 h-4 w-4" />
                {t('adminCustomers.marketingConsent')}
              </label>
              <div className="flex gap-3">
                <Button variant="gold" className="flex-1" disabled={savingEdit} onClick={saveEdit}>
                  {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('common.confirm')}
                </Button>
                <Button variant="outline" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, gold }: { icon: typeof DollarSign; label: string; value: string; gold?: boolean }) {
  return (
    <Card className={gold ? 'glass border-gold-500/30' : 'glass'}>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Icon className={cn('h-3.5 w-3.5', gold && 'text-gold-400')} />
          <span className="truncate">{label}</span>
        </div>
        <div className={cn('mt-2 text-lg font-bold tabular-nums truncate', gold && 'text-gradient-gold')}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Section({ title, empty, emptyLabel, children }: { title: string; empty: boolean; emptyLabel: string; children: React.ReactNode }) {
  return (
    <Card className="glass">
      <CardContent className="p-5 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        {empty ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{emptyLabel}</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground shrink-0">
      {status}
    </span>
  );
}
