'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Search, UserPlus, Link2 } from 'lucide-react';
import { normalizePhone } from '@/lib/utils';
import { useT } from '@/i18n/context';
import {
  lookupCustomerAction,
  createWalkInCustomerAction,
  linkCustomerToCartAction,
} from '@/app/(dashboard)/dashboard/cashier/actions';

interface FoundCustomer {
  id: string;
  full_name: string | null;
  phone: string;
}

interface CustomerSearchBarProps {
  activeCartId: string | null;
  onLinked: (customer: FoundCustomer) => void;
}

/**
 * A persistent phone-search bar: as soon as the typed number normalizes to a
 * valid Saudi mobile, it looks the customer up automatically (no explicit
 * "search" click) and offers a one-click link to the active cart. No match
 * on a valid number → inline quick-add (name + phone) creates the profile
 * and links it in the same step.
 */
export function CustomerSearchBar({ activeCartId, onLinked }: CustomerSearchBarProps) {
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<FoundCustomer | null>(null);
  const [searched, setSearched] = useState(false);
  const [newName, setNewName] = useState('');
  const [pending, startPending] = useTransition();
  const [linkPending, startLink] = useTransition();

  const normalized = normalizePhone(phone, 'SA');

  useEffect(() => {
    if (!normalized) {
      setFound(null);
      setSearched(false);
      return;
    }
    startPending(async () => {
      const res = await lookupCustomerAction({ phone: normalized });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setFound(res.customer ?? null);
      setSearched(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized]);

  const handleLink = (customer: FoundCustomer) => {
    if (!activeCartId) {
      toast.error(t('tabs.noActiveCartToLink'));
      return;
    }
    startLink(async () => {
      const res = await linkCustomerToCartAction({ cartId: activeCartId, customerId: customer.id });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onLinked(customer);
      setPhone('');
      setFound(null);
      setSearched(false);
      toast.success(t('tabs.customerLinked'));
    });
  };

  const handleQuickAdd = () => {
    if (!normalized || newName.trim().length < 2) return;
    startPending(async () => {
      const res = await createWalkInCustomerAction({ phone: normalized, fullName: newName.trim() });
      if (res.error || !res.customer) {
        toast.error(res.error ?? 'Failed to create customer');
        return;
      }
      setNewName('');
      handleLink(res.customer);
    });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('tabs.searchPhonePlaceholder')}
            dir="ltr"
            inputMode="tel"
            type="tel"
            className="h-11 font-mono tabular-nums"
          />
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
        </div>

        {searched && !pending && found && (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div>
              <div className="font-medium text-sm">{found.full_name || t('cashier.walkInCustomer')}</div>
              <div className="text-xs text-muted-foreground font-mono" dir="ltr">
                {found.phone}
              </div>
            </div>
            <Button variant="gold" size="sm" disabled={linkPending || !activeCartId} onClick={() => handleLink(found)}>
              {linkPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Link2 className="h-3.5 w-3.5" />
              {t('tabs.linkToCart')}
            </Button>
          </div>
        )}

        {searched && !pending && !found && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 p-3">
            <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('cashier.fullName')}
              className="h-9"
            />
            <Button
              variant="gold"
              size="sm"
              disabled={pending || newName.trim().length < 2 || !activeCartId}
              onClick={handleQuickAdd}
            >
              {t('tabs.addAndLink')}
            </Button>
          </div>
        )}

        {searched && !found && !activeCartId && (
          <p className="text-xs text-muted-foreground">{t('tabs.noActiveCartToLink')}</p>
        )}
      </CardContent>
    </Card>
  );
}
