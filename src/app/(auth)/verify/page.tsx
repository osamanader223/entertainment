import { Suspense } from 'react';
import { VerifyOtpForm } from '@/components/auth/verify-otp-form';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Verify Phone' };

export default function VerifyPage() {
  return (
    <Card className="glass-strong">
      <Suspense fallback={<div className="h-48 animate-pulse bg-muted/20 rounded-lg" />}>
        <VerifyOtpForm />
      </Suspense>
    </Card>
  );
}
