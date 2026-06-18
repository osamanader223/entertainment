import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <Card className="glass-strong">
      <Suspense fallback={<div className="h-80 animate-pulse bg-muted/20 rounded-lg" />}>
        <LoginForm />
      </Suspense>
    </Card>
  );
}
