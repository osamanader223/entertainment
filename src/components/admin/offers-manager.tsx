'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n/context';
import { formatMoney } from '@/lib/utils';
import type { OfferRow } from '@/lib/offers';
import { OfferForm } from './offer-form';
import {
  createOfferAction,
  updateOfferAction,
  toggleOfferActiveAction,
  deleteOfferAction,
} from '@/app/admin/offers/actions';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

interface OffersManagerProps {
  initialOffers: OfferRow[];
  gameTypes: Array<{ id: string; display_name_en: string; display_name_ar: string }>;
}

export function OffersManager({ initialOffers, gameTypes }: OffersManagerProps) {
  const { t, locale } = useT();
  const [offers, setOffers] = useState<OfferRow[]>(initialOffers);
  const [editOffer, setEditOffer] = useState<OfferRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = () => {
    // Re-fetch after mutation via the server action list
    startTransition(async () => {
      const { listOffersAction } = await import('@/app/admin/offers/actions');
      const res = await listOffersAction();
      if (res.ok) setOffers(res.offers);
    });
  };

  const handleToggle = (offer: OfferRow) => {
    if (!window.confirm(offer.is_active ? t('admin.deactivateConfirm') : t('admin.activateConfirm'))) return;
    startTransition(async () => {
      const res = await toggleOfferActiveAction(offer.id, !offer.is_active);
      if (res.ok) { toast.success(t('admin.offerToggled')); refresh(); }
      else toast.error(res.error);
    });
  };

  const handleDelete = (offer: OfferRow) => {
    if (!window.confirm(t('admin.deleteConfirm'))) return;
    startTransition(async () => {
      const res = await deleteOfferAction(offer.id);
      if (res.ok) { toast.success(t('admin.offerDeleted')); refresh(); }
      else toast.error(res.error);
    });
  };

  const handleSaveCreate = async (data: Parameters<typeof createOfferAction>[0]) => {
    const res = await createOfferAction(data);
    if (res.ok) { toast.success(t('admin.offerSaved')); setShowCreate(false); refresh(); }
    else toast.error(res.error);
    return res.ok;
  };

  const handleSaveEdit = async (data: Parameters<typeof updateOfferAction>[1]) => {
    if (!editOffer) return false;
    const res = await updateOfferAction(editOffer.id, data);
    if (res.ok) { toast.success(t('admin.offerSaved')); setEditOffer(null); refresh(); }
    else toast.error(res.error);
    return res.ok;
  };

  const discountLabel = (o: OfferRow): string => {
    switch (o.discount_type) {
      case 'percent': return `${o.discount_value}%`;
      case 'fixed': return formatMoney(o.discount_value);
      case 'free_minutes': return `${o.discount_value} min`;
      case 'double_points': return `×${o.discount_value}`;
      default: return String(o.discount_value);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="gold" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t('admin.createOffer')}
        </Button>
      </div>

      {(showCreate || editOffer) && (
        <OfferForm
          mode={showCreate ? 'create' : 'edit'}
          initial={editOffer ?? undefined}
          gameTypes={gameTypes}
          onSave={showCreate ? handleSaveCreate : handleSaveEdit}
          onCancel={() => { setShowCreate(false); setEditOffer(null); }}
        />
      )}

      {offers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{t('admin.noOffers')}</p>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-start">{t('admin.offerName')}</th>
                <th className="px-4 py-3 text-start">{t('admin.offerCode')}</th>
                <th className="px-4 py-3 text-start">{t('admin.discountType')}</th>
                <th className="px-4 py-3 text-start">{t('admin.discountValue')}</th>
                <th className="px-4 py-3 text-start">Uses</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {offers.map((offer) => {
                const name = locale === 'ar'
                  ? (offer.description_ar ?? offer.name)
                  : offer.name;
                return (
                  <tr key={offer.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3 font-mono text-gold-400 text-xs">{offer.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{offer.discount_type}</td>
                    <td className="px-4 py-3 font-semibold">{discountLabel(offer)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {offer.max_uses
                        ? t('admin.usesCount', { count: String(offer.uses_count), max: String(offer.max_uses) })
                        : t('admin.usesUnlimited', { count: String(offer.uses_count) })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={offer.is_active ? 'default' : 'secondary'} className={offer.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}>
                        {offer.is_active ? t('admin.statusActive') : t('admin.statusInactive')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="icon" onClick={() => setEditOffer(offer)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleToggle(offer)}>
                          {offer.is_active
                            ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                            : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(offer)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
