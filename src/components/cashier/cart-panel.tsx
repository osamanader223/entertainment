'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Receipt, X, Trash2, Plus, Minus, Percent, Printer, Search, Check, ShoppingBasket } from 'lucide-react';
import { formatMoney, normalizePhone } from '@/lib/utils';
import { useT } from '@/i18n/context';
import {
  getCartAction,
  removeCartItemAction,
  voidCartAction,
  settleCartAction,
  getCustomerWalletBalanceAction,
  lookupWalletPayerAction,
  updateCartItemQuantityAction,
  applyCartDiscountAction,
  applyLineDiscountAction,
  clearCartDiscountAction,
} from '@/app/(dashboard)/dashboard/cashier/actions';

interface ActiveCartItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineDiscountCents: number;
  amountCents: number;
}

interface CartPanelProps {
  /** The customer's current basket, opened by cashier-flow.tsx when the first game is added. */
  activeCartId: string | null;
  refreshKey: number;
  /** Called with the newly-issued invoice id right after a successful settle, so the invoice can show in the side panel instead of a new tab. */
  onSettled?: (invoiceId: string) => void;
  /** The basket was cancelled — the parent should clear its activeCartId. */
  onVoided?: () => void;
}

const QUICK_CASH_AMOUNTS = [5000, 10000, 20000, 50000]; // 50 / 100 / 200 / 500 SAR, in halalas

interface WalletPayer {
  id: string;
  full_name: string | null;
  phone: string;
}

interface SettleLine {
  method: 'cash' | 'card' | 'wallet';
  amount: string;
  cardReference: string;
  /** wallet only — "pay from another wallet" sub-flow. null payer = the basket's own customer pays. */
  showPayerLookup: boolean;
  payerPhone: string;
  payerLookupPending: boolean;
  payerCustomer: WalletPayer | null;
  payerBalanceCents: number | null;
  payerConfirmed: boolean;
}

const EMPTY_SETTLE_LINE: SettleLine = {
  method: 'cash',
  amount: '',
  cardReference: '',
  showPayerLookup: false,
  payerPhone: '',
  payerLookupPending: false,
  payerCustomer: null,
  payerBalanceCents: null,
  payerConfirmed: false,
};

/**
 * The customer's current basket — one game/line at a time, settled once.
 * Deliberately just ONE basket at a time (no multi-tab list): cashier-flow.tsx
 * owns creating/clearing `activeCartId`, this component only displays and
 * settles whatever cart id it's handed.
 */
export function CartPanel({ activeCartId, refreshKey, onSettled, onVoided }: CartPanelProps) {
  const { t } = useT();
  const [activeItems, setActiveItems] = useState<ActiveCartItem[]>([]);
  const [activeSubtotalCents, setActiveSubtotalCents] = useState(0);
  const [activeDiscountCents, setActiveDiscountCents] = useState(0);
  const [activeTotalCents, setActiveTotalCents] = useState(0);
  const [itemsPending, startItems] = useTransition();
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [lineDiscountFor, setLineDiscountFor] = useState<string | null>(null);
  const [lineDiscountValue, setLineDiscountValue] = useState('');

  const [settleCartId, setSettleCartId] = useState<string | null>(null);
  const [settleTotalCents, setSettleTotalCents] = useState(0);
  const [settleItems, setSettleItems] = useState<Array<{ description: string; amountCents: number }>>([]);
  const [settleCustomerId, setSettleCustomerId] = useState<string | null>(null);
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null);
  const [lines, setLines] = useState<SettleLine[]>([{ ...EMPTY_SETTLE_LINE }]);
  const [settlePending, startSettle] = useTransition();
  const [settleResult, setSettleResult] = useState<{ changeCents: number; invoiceId?: string } | null>(null);

  const loadActiveCartItems = (cartId: string | null) => {
    if (!cartId) {
      setActiveItems([]);
      setActiveSubtotalCents(0);
      setActiveDiscountCents(0);
      setActiveTotalCents(0);
      return;
    }
    startItems(async () => {
      const res = await getCartAction({ cartId });
      if (res.error || !res.cart) {
        toast.error(res.error ?? 'Failed to load cart');
        return;
      }
      setActiveItems(
        res.cart.items.map((i) => ({
          id: i.id,
          description: i.description,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          lineDiscountCents: i.lineDiscountCents,
          amountCents: i.amountCents,
        }))
      );
      setActiveSubtotalCents(res.cart.subtotalCents);
      setActiveDiscountCents(res.cart.discountCents);
      setActiveTotalCents(res.cart.totalCents);
    });
  };

  useEffect(() => {
    loadActiveCartItems(activeCartId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCartId, refreshKey]);

  const handleRemoveItem = (cartItemId: string) => {
    startItems(async () => {
      const res = await removeCartItemAction({ cartItemId });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      loadActiveCartItems(activeCartId);
    });
  };

  const handleQuantityChange = (cartItemId: string, quantity: number) => {
    if (quantity < 1) return;
    startItems(async () => {
      const res = await updateCartItemQuantityAction({ cartItemId, quantity });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      loadActiveCartItems(activeCartId);
    });
  };

  const handleApplyCartDiscount = () => {
    if (!activeCartId) return;
    const value = Number.parseFloat(discountValue || '0');
    if (!Number.isFinite(value) || value <= 0) return;
    startItems(async () => {
      const res = await applyCartDiscountAction({ cartId: activeCartId, type: discountType, value });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('pos.discountApplied'));
      setDiscountValue('');
      loadActiveCartItems(activeCartId);
    });
  };

  const handleClearCartDiscount = () => {
    if (!activeCartId) return;
    startItems(async () => {
      const res = await clearCartDiscountAction({ cartId: activeCartId });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('pos.discountCleared'));
      loadActiveCartItems(activeCartId);
    });
  };

  const handleApplyLineDiscount = (cartItemId: string, type: 'flat' | 'percent') => {
    const value = Number.parseFloat(lineDiscountValue || '0');
    if (!Number.isFinite(value) || value <= 0) return;
    startItems(async () => {
      const res = await applyLineDiscountAction({ cartItemId, type, value });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setLineDiscountFor(null);
      setLineDiscountValue('');
      loadActiveCartItems(activeCartId);
    });
  };

  const openSettle = () => {
    if (!activeCartId) return;
    const cartId = activeCartId;
    startSettle(async () => {
      const res = await getCartAction({ cartId });
      if (res.error || !res.cart) {
        toast.error(res.error ?? 'Failed to load cart');
        return;
      }
      setSettleCartId(cartId);
      setSettleTotalCents(res.cart.totalCents);
      setSettleItems(res.cart.items.map((i) => ({ description: i.description, amountCents: i.amountCents })));
      setSettleCustomerId(res.cart.customerId);
      setWalletBalanceCents(null);
      setLines([{ ...EMPTY_SETTLE_LINE }]);
      setSettleResult(null);

      if (res.cart.customerId) {
        const balRes = await getCustomerWalletBalanceAction({ customerId: res.cart.customerId });
        if (!balRes.error) setWalletBalanceCents(balRes.balanceCents ?? 0);
      }
    });
  };

  const paidSoFarCents = lines.reduce((sum, l) => {
    const n = Math.round(Number.parseFloat(l.amount || '0') * 100);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const remainingCents = settleTotalCents - paidSoFarCents;
  const underpaid = remainingCents > 0;

  const handleAddLine = () => setLines((ls) => [...ls, { ...EMPTY_SETTLE_LINE }]);
  const handleRemoveLine = (idx: number) => setLines((ls) => ls.filter((_, i) => i !== idx));
  const handleLineChange = (idx: number, patch: Partial<SettleLine>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const handleQuickTender = (idx: number, cents: number) => {
    handleLineChange(idx, { amount: (cents / 100).toFixed(2) });
  };

  const handleTogglePayerLookup = (idx: number) => {
    setLines((ls) =>
      ls.map((l, i) =>
        i === idx
          ? { ...l, showPayerLookup: !l.showPayerLookup, payerPhone: '', payerCustomer: null, payerBalanceCents: null, payerConfirmed: false }
          : l
      )
    );
  };

  const handlePayerPhoneChange = (idx: number, phone: string) => {
    // Any edit to the phone invalidates a prior lookup/confirmation — a
    // mistyped number must never carry over a stale "confirmed" state.
    handleLineChange(idx, { payerPhone: phone, payerCustomer: null, payerBalanceCents: null, payerConfirmed: false });
  };

  const handleLookupPayer = (idx: number) => {
    const line = lines[idx];
    const normalized = normalizePhone(line.payerPhone, 'SA');
    if (!normalized) {
      toast.error(t('cashier.enterSaudiPhone'));
      return;
    }
    handleLineChange(idx, { payerLookupPending: true });
    startItems(async () => {
      const res = await lookupWalletPayerAction({ phone: normalized });
      handleLineChange(idx, { payerLookupPending: false });
      if (res.error || !res.customer) {
        toast.error(res.error ?? t('pos.walletPayerNotFound'));
        handleLineChange(idx, { payerCustomer: null, payerBalanceCents: null });
        return;
      }
      handleLineChange(idx, { payerCustomer: res.customer, payerBalanceCents: res.balanceCents ?? 0, payerConfirmed: false });
    });
  };

  const handleConfirmPayer = (idx: number) => handleLineChange(idx, { payerConfirmed: true });

  const handleSettle = () => {
    if (!settleCartId) return;
    if (underpaid) {
      toast.error(t('tabs.notEnoughPaid'));
      return;
    }
    // A wallet line whose cashier opened the "pay from another wallet"
    // lookup must be explicitly confirmed before it can be charged — this
    // is the hard stop against silently charging a mistyped stranger.
    const unconfirmedPayer = lines.some((l) => l.method === 'wallet' && l.showPayerLookup && l.payerCustomer && !l.payerConfirmed);
    if (unconfirmedPayer) {
      toast.error(t('pos.confirmWalletPayerFirst'));
      return;
    }

    const payments = lines
      .map((l) => ({
        method: l.method,
        amountCents: Math.round(Number.parseFloat(l.amount || '0') * 100),
        cardReference: l.method === 'card' ? l.cardReference.trim() || undefined : undefined,
        payerCustomerId: l.method === 'wallet' && l.payerConfirmed && l.payerCustomer ? l.payerCustomer.id : undefined,
      }))
      .filter((p) => p.amountCents > 0);

    startSettle(async () => {
      const res = await settleCartAction({ cartId: settleCartId, payments });
      if (res.error || !res.result) {
        toast.error(res.error ?? t('tabs.failedToSettle'));
        return;
      }
      setSettleResult({ changeCents: res.result.changeCents, invoiceId: res.result.invoiceId });
      // Shows in the invoice side panel on this same screen instead of
      // opening a new browser tab — the cashier can still print manually
      // via the button below (or the side panel's own reprint button).
      if (res.result.invoiceId) onSettled?.(res.result.invoiceId);
    });
  };

  const handleVoidBasket = () => {
    if (!activeCartId) return;
    startSettle(async () => {
      const res = await voidCartAction({ cartId: activeCartId, reason: 'Cancelled at cashier' });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('tabs.tabVoided'));
      onVoided?.();
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <ShoppingBasket className="h-4 w-4 text-gold-400" />
          <CardTitle className="text-lg">{t('cashier.basket')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!activeCartId ? (
            <div className="text-sm text-muted-foreground text-center py-6">{t('cashier.basketEmpty')}</div>
          ) : (
            <div className="space-y-2">
              {itemsPending ? (
                <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
              ) : activeItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t('cashier.basketEmpty')}</div>
              ) : (
                <div className="space-y-2">
                  {activeItems.map((item) => (
                    <div key={item.id} className="space-y-1 text-sm border-b border-border/30 pb-1.5 last:border-0">
                      <div className="flex items-center justify-between">
                        <span>{item.description}</span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-5 text-center font-mono tabular-nums">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="font-mono tabular-nums">{formatMoney(item.amountCents)}</span>
                          <button
                            type="button"
                            onClick={() => setLineDiscountFor(lineDiscountFor === item.id ? null : item.id)}
                            className="text-muted-foreground hover:text-gold-400"
                            title={t('pos.discount')}
                          >
                            <Percent className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-muted-foreground hover:text-destructive"
                            title={t('pos.removeItem')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {item.lineDiscountCents > 0 && (
                        <div className="text-xs text-emerald-400 text-end">
                          {t('pos.discount')} −{formatMoney(item.lineDiscountCents)}
                        </div>
                      )}
                      {lineDiscountFor === item.id && (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            value={lineDiscountValue}
                            onChange={(e) => setLineDiscountValue(e.target.value)}
                            placeholder={t('pos.discountValuePlaceholder')}
                            className="h-8 text-xs"
                          />
                          <Button size="sm" variant="outline" onClick={() => handleApplyLineDiscount(item.id, 'flat')}>
                            {t('pos.flat')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleApplyLineDiscount(item.id, 'percent')}>
                            %
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t('pos.subtotal')}</span>
                    <span className="font-mono tabular-nums">{formatMoney(activeSubtotalCents)}</span>
                  </div>
                  {activeDiscountCents > 0 && (
                    <div className="flex justify-between text-xs text-emerald-400">
                      <span>{t('pos.discount')}</span>
                      <span className="font-mono tabular-nums">−{formatMoney(activeDiscountCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-border/60 font-semibold">
                    <span>{t('tabs.totalDue')}</span>
                    <span className="font-mono tabular-nums">{formatMoney(activeTotalCents)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as 'flat' | 'percent')}
                      className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
                    >
                      <option value="percent">%</option>
                      <option value="flat">{t('pos.flat')}</option>
                    </select>
                    <Input
                      type="number"
                      min={0}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={t('pos.discountValuePlaceholder')}
                      className="h-8 text-xs"
                    />
                    <Button size="sm" variant="outline" onClick={handleApplyCartDiscount}>
                      {t('pos.applyDiscount')}
                    </Button>
                    {activeDiscountCents > 0 && (
                      <Button size="sm" variant="ghost" onClick={handleClearCartDiscount}>
                        {t('pos.clearDiscount')}
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleVoidBasket} title={t('cashier.cancelBasket')}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('cashier.cancelBasket')}
                    </Button>
                    <Button variant="gold" size="lg" className="flex-1" onClick={openSettle}>
                      <Receipt className="h-4 w-4" />
                      {t('tabs.settle')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {settleCartId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <Card className="w-full max-w-lg glass border-gold-500/30 max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('tabs.settle')}</h3>
                <button type="button" onClick={() => setSettleCartId(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!settleResult ? (
                <>
                  <div className="rounded-lg border border-border/60 p-3 text-sm space-y-1 max-h-32 overflow-y-auto">
                    {settleItems.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{item.description}</span>
                        <span className="font-mono tabular-nums">{formatMoney(item.amountCents)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-gold-500/10 border border-gold-500/20 p-3 flex justify-between items-center">
                    <span className="text-sm">{t('tabs.totalDue')}</span>
                    <span className="text-xl font-bold font-mono tabular-nums text-gold-400">{formatMoney(settleTotalCents)}</span>
                  </div>

                  <div className="space-y-3">
                    {lines.map((line, idx) => (
                      <div key={idx} className="space-y-1.5 rounded-lg border border-border/40 p-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={line.method}
                            onChange={(e) => handleLineChange(idx, { method: e.target.value as SettleLine['method'] })}
                            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="cash">{t('tabs.cash')}</option>
                            <option value="card">{t('tabs.card')}</option>
                            <option value="wallet">{t('tabs.wallet')}</option>
                          </select>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.amount}
                            onChange={(e) => handleLineChange(idx, { amount: e.target.value })}
                            placeholder="0.00"
                            className="h-10 font-mono tabular-nums"
                          />
                          {lines.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveLine(idx)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>

                        {line.method === 'cash' && (
                          <div className="flex flex-wrap gap-1.5">
                            {QUICK_CASH_AMOUNTS.map((cents) => (
                              <button
                                key={cents}
                                type="button"
                                onClick={() => handleQuickTender(idx, cents)}
                                className="rounded-md border border-border/60 px-2 py-1 text-xs font-mono tabular-nums hover:border-gold-500/50 hover:text-gold-400"
                              >
                                {formatMoney(cents)}
                              </button>
                            ))}
                          </div>
                        )}

                        {line.method === 'card' && (
                          <Input
                            value={line.cardReference}
                            onChange={(e) => handleLineChange(idx, { cardReference: e.target.value })}
                            placeholder={t('tabs.cardReferencePlaceholder')}
                            className="h-9 text-xs"
                          />
                        )}

                        {line.method === 'wallet' && !line.showPayerLookup && (
                          <div className="space-y-1.5">
                            <div className="text-xs text-muted-foreground">
                              {settleCustomerId
                                ? `${t('cashier.wallet')}: ${walletBalanceCents !== null ? formatMoney(walletBalanceCents) : '—'}`
                                : t('tabs.walletRequiresCustomer')}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleTogglePayerLookup(idx)}
                              className="text-xs text-gold-400 hover:underline"
                            >
                              {t('pos.payFromAnotherWallet')}
                            </button>
                          </div>
                        )}

                        {line.method === 'wallet' && line.showPayerLookup && (
                          <div className="space-y-1.5 rounded-lg border border-border/40 p-2">
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={line.payerPhone}
                                onChange={(e) => handlePayerPhoneChange(idx, e.target.value)}
                                placeholder={t('cashier.phoneNumber')}
                                dir="ltr"
                                inputMode="tel"
                                type="tel"
                                className="h-9 font-mono tabular-nums text-sm"
                              />
                              <Button size="sm" variant="outline" disabled={line.payerLookupPending} onClick={() => handleLookupPayer(idx)}>
                                {line.payerLookupPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                              </Button>
                              <button type="button" onClick={() => handleTogglePayerLookup(idx)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {line.payerCustomer && !line.payerConfirmed && (() => {
                              const amountCents = Math.round(Number.parseFloat(line.amount || '0') * 100);
                              const insufficientBalance = line.payerBalanceCents !== null && amountCents > 0 && line.payerBalanceCents < amountCents;
                              return (
                                <div className="rounded-lg border border-gold-500/30 bg-gold-500/5 p-2 space-y-1.5">
                                  <div className="text-xs">
                                    <span className="font-medium">{line.payerCustomer.full_name || line.payerCustomer.phone}</span>
                                    {' · '}
                                    {t('pos.walletBalance')}: <span className="font-mono tabular-nums">{formatMoney(line.payerBalanceCents ?? 0)}</span>
                                  </div>
                                  {insufficientBalance && <p className="text-xs text-destructive">{t('cashier.walletInsufficient')}</p>}
                                  <Button size="sm" variant="gold" className="w-full" disabled={insufficientBalance || amountCents <= 0} onClick={() => handleConfirmPayer(idx)}>
                                    {t('pos.chargeFromWalletConfirm', {
                                      amount: formatMoney(amountCents),
                                      name: line.payerCustomer.full_name || line.payerCustomer.phone,
                                    })}
                                  </Button>
                                </div>
                              );
                            })()}

                            {line.payerCustomer && line.payerConfirmed && (
                              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                                <Check className="h-3.5 w-3.5" />
                                {t('pos.chargingFromWallet', { name: line.payerCustomer.full_name || line.payerCustomer.phone })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={handleAddLine}>
                      + {t('tabs.splitPayment')}
                    </Button>
                  </div>

                  <div
                    className={`flex justify-between text-sm rounded-lg border p-3 ${
                      underpaid ? 'border-destructive/50 bg-destructive/5' : 'border-emerald-500/30 bg-emerald-500/5'
                    }`}
                  >
                    <span className="text-muted-foreground">{underpaid ? t('tabs.remaining') : t('tabs.changeDue')}</span>
                    <span className={`font-mono tabular-nums font-semibold ${underpaid ? 'text-destructive' : 'text-emerald-400'}`}>
                      {formatMoney(Math.abs(remainingCents))}
                    </span>
                  </div>

                  <Button
                    variant={underpaid ? 'destructive' : 'gold'}
                    size="lg"
                    className="w-full"
                    disabled={settlePending || underpaid}
                    onClick={handleSettle}
                  >
                    {settlePending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('tabs.settle')}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  {settleResult.changeCents > 0 && (
                    <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                      <div className="text-xs text-muted-foreground">{t('tabs.changeDue')}</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                        {formatMoney(settleResult.changeCents)}
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {settleResult.invoiceId ? t('tabs.invoiceIssued') : t('tabs.invoiceFailed')}
                  </p>
                  {settleResult.invoiceId && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full"
                      onClick={() => window.open(`/invoices/${settleResult.invoiceId}/receipt`, '_blank')}
                    >
                      <Printer className="h-4 w-4" />
                      {t('pos.printReceipt')}
                    </Button>
                  )}
                  <Button variant="gold" size="lg" className="w-full" onClick={() => setSettleCartId(null)}>
                    {t('common.done')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
