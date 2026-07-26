'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Receipt, X, Trash2, Plus, Minus, Percent, Printer } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useT } from '@/i18n/context';
import {
  getOpenCartsAction,
  getCartAction,
  removeCartItemAction,
  voidCartAction,
  settleCartAction,
  openCartAction,
  getCustomerWalletBalanceAction,
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

export interface OpenCartSummary {
  id: string;
  label: string | null;
  customerId: string | null;
  customerName: string | null;
  openedAt: string;
  itemCount: number;
  totalCents: number;
}

interface CartPanelProps {
  branchId: string;
  refreshKey: number;
  activeCartId: string | null;
  onActiveCartChange: (cartId: string | null) => void;
}

const QUICK_CASH_AMOUNTS = [5000, 10000, 20000, 50000]; // 50 / 100 / 200 / 500 SAR, in halalas

interface SettleLine {
  method: 'cash' | 'card' | 'wallet';
  amount: string;
  cardReference: string;
}

export function CartPanel({ branchId, refreshKey, activeCartId, onActiveCartChange }: CartPanelProps) {
  const { t } = useT();
  const [carts, setCarts] = useState<OpenCartSummary[]>([]);
  const [loading, startLoading] = useTransition();
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
  const [lines, setLines] = useState<SettleLine[]>([{ method: 'cash', amount: '', cardReference: '' }]);
  const [settlePending, startSettle] = useTransition();
  const [settleResult, setSettleResult] = useState<{ changeCents: number; invoiceId?: string } | null>(null);

  const refresh = () => {
    startLoading(async () => {
      const res = await getOpenCartsAction({ branchId });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setCarts(res.carts ?? []);
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, refreshKey]);

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

  const handleNewCart = () => {
    startLoading(async () => {
      const res = await openCartAction({ branchId });
      if (res.error || !res.result) {
        toast.error(res.error === 'no_open_shift' ? t('shifts.mustOpenShiftFirst') : (res.error ?? t('tabs.failedToOpen')));
        return;
      }
      onActiveCartChange(res.result.cartId);
      refresh();
    });
  };

  // Alt+N — Daftra-style shortcut for a new cart.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleNewCart();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const handleRemoveItem = (cartItemId: string) => {
    startItems(async () => {
      const res = await removeCartItemAction({ cartItemId });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      loadActiveCartItems(activeCartId);
      refresh();
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
      refresh();
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
      refresh();
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
      refresh();
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
      refresh();
    });
  };

  const openSettle = (cartId: string) => {
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
      setLines([{ method: 'cash', amount: '', cardReference: '' }]);
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

  const handleAddLine = () => setLines((ls) => [...ls, { method: 'cash', amount: '', cardReference: '' }]);
  const handleRemoveLine = (idx: number) => setLines((ls) => ls.filter((_, i) => i !== idx));
  const handleLineChange = (idx: number, patch: Partial<SettleLine>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const handleQuickTender = (idx: number, cents: number) => {
    handleLineChange(idx, { amount: (cents / 100).toFixed(2) });
  };

  const handleSettle = () => {
    if (!settleCartId) return;
    if (underpaid) {
      toast.error(t('tabs.notEnoughPaid'));
      return;
    }
    const payments = lines
      .map((l) => ({
        method: l.method,
        amountCents: Math.round(Number.parseFloat(l.amount || '0') * 100),
        cardReference: l.method === 'card' ? l.cardReference.trim() || undefined : undefined,
      }))
      .filter((p) => p.amountCents > 0);

    startSettle(async () => {
      const res = await settleCartAction({ cartId: settleCartId, payments });
      if (res.error || !res.result) {
        toast.error(res.error ?? t('tabs.failedToSettle'));
        return;
      }
      setSettleResult({ changeCents: res.result.changeCents, invoiceId: res.result.invoiceId });
      if (activeCartId === settleCartId) onActiveCartChange(null);
      refresh();
      // Auto-print: opens the dedicated receipt page in a new tab, which
      // triggers window.print() itself on load (see ReceiptAutoPrint). A
      // popup blocker just means the cashier uses the manual button below.
      if (res.result.invoiceId) {
        window.open(`/invoices/${res.result.invoiceId}/receipt`, '_blank');
      }
    });
  };

  const handleVoid = (cartId: string) => {
    startSettle(async () => {
      const res = await voidCartAction({ cartId, reason: 'Cancelled at cashier' });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('tabs.tabVoided'));
      if (activeCartId === cartId) onActiveCartChange(null);
      refresh();
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg">{t('tabs.openTabs')}</CardTitle>
          <Button variant="outline" size="sm" onClick={handleNewCart} title="Alt+N">
            <Plus className="h-3.5 w-3.5" />
            {t('tabs.newTab')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && carts.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : carts.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('tabs.noOpenTabs')}</div>
          ) : (
            carts.map((cart) => (
              <div
                key={cart.id}
                role="button"
                tabIndex={0}
                onClick={() => onActiveCartChange(cart.id)}
                className={`flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  activeCartId === cart.id ? 'border-gold-500/60 bg-gold-500/5' : 'border-border/60 hover:border-border'
                }`}
              >
                <div>
                  <div className="font-medium">{cart.customerName || cart.label || t('tabs.unlabeledTab')}</div>
                  <div className="text-xs text-muted-foreground">
                    {cart.itemCount} {t('tabs.items')} ·{' '}
                    <span className="font-mono tabular-nums" style={{ fontFamily: 'var(--font-orbitron, inherit)' }}>
                      {formatMoney(cart.totalCents)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => handleVoid(cart.id)} title={t('tabs.voidTab')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="gold" size="sm" onClick={() => openSettle(cart.id)}>
                    <Receipt className="h-3.5 w-3.5" />
                    {t('tabs.settle')}
                  </Button>
                </div>
              </div>
            ))
          )}

          {activeCartId && (
            <div className="rounded-lg border border-gold-500/30 bg-gold-500/5 p-3 space-y-2">
              <div className="text-xs font-medium text-gold-400">{t('tabs.activeCart')}</div>
              {itemsPending ? (
                <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
              ) : activeItems.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t('tabs.noOpenTabs')}</div>
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

                        {line.method === 'wallet' && (
                          <div className="text-xs text-muted-foreground">
                            {settleCustomerId
                              ? `${t('cashier.wallet')}: ${walletBalanceCents !== null ? formatMoney(walletBalanceCents) : '—'}`
                              : t('tabs.walletRequiresCustomer')}
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
