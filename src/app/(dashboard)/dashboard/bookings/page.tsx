import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { requireAuth } from '@/lib/auth';
import { getCustomerUpcomingBookings } from '@/lib/booking';
import { getServerDict } from '@/i18n/server';
import { UpcomingBookings } from '@/components/booking/upcoming-bookings';

export const metadata = { title: 'My bookings' };
export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

export default async function BookingsPage() {
  const ctx = await requireAuth('/dashboard/bookings');
  const { d } = await getServerDict();
  const upcomingBookings = await getCustomerUpcomingBookings(DEMO_TENANT_ID, ctx.userId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-[color:var(--neon-text-hi)]">{d.dashboard.navBookings}</h1>
        <Link
          href="/dashboard/book"
          className="inline-flex items-center gap-2 rounded-[12px] px-4 py-2.5 text-sm font-bold text-white [background:linear-gradient(135deg,#FF2D9E,#7B2FF7)] shadow-[0_0_14px_-4px_rgba(255,45,158,.8)] hover:shadow-[0_0_18px_-2px_rgba(255,45,158,.9)] transition-shadow"
        >
          <CalendarPlus className="h-4 w-4" />
          {d.dashboard.bookStation}
        </Link>
      </div>

      {upcomingBookings.length > 0 ? (
        <UpcomingBookings customerId={ctx.userId} initialBookings={upcomingBookings} />
      ) : (
        <div
          className="rounded-[20px] border border-[#241B39] p-6 text-center text-[color:var(--neon-text-mid)]"
          style={{ background: 'var(--neon-surface-card-2)' }}
        >
          {d.scheduling.noUpcomingBookings}
        </div>
      )}
    </div>
  );
}
