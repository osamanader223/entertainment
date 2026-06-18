import { Suspense } from 'react';
import { SignupForm } from '@/components/auth/signup-form';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Create Account' };

export default function SignupPage() {
  return (
    <Card className="glass-strong">
      <Suspense fallback={<div className="h-96 animate-pulse bg-muted/20 rounded-lg" />}>
        <SignupForm />
      </Suspense>
    </Card>
  );
}
