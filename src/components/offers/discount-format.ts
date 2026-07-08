import { formatMoney } from '@/lib/utils';

type DiscountType = 'percent' | 'fixed' | 'free_minutes' | 'double_points';
type Translate = (path: string, vars?: Record<string, string>) => string;

/** Short uppercase badge text, e.g. "20% OFF" / "10.00 SAR OFF" / "+15 MIN" / "2× POINTS". */
export function discountBadgeText(t: Translate, discountType: DiscountType, discountValue: number): string {
  switch (discountType) {
    case 'percent':
      return t('customerOffers.badgePercent', { v: String(discountValue) });
    case 'fixed':
      return t('customerOffers.badgeFixed', { amount: formatMoney(discountValue) });
    case 'free_minutes':
      return t('customerOffers.badgeFreeMinutes', { v: String(discountValue) });
    case 'double_points':
      return t('customerOffers.badgeDoublePoints');
    default:
      return '';
  }
}

/** Lowercase sentence form, e.g. "20% off" / "10.00 SAR off" / "+15 min free" / "2× points". */
export function discountSentence(t: Translate, discountType: DiscountType, discountValue: number): string {
  switch (discountType) {
    case 'percent':
      return t('customerOffers.labelPercent', { v: String(discountValue) });
    case 'fixed':
      return t('customerOffers.labelFixed', { amount: formatMoney(discountValue) });
    case 'free_minutes':
      return t('customerOffers.labelFreeMinutes', { v: String(discountValue) });
    case 'double_points':
      return t('customerOffers.labelDoublePoints');
    default:
      return '';
  }
}
