'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/i18n/context';
import type { StaffMember } from '@/lib/staff';
import { Loader2 } from 'lucide-react';

interface StaffFormProps {
  mode: 'add' | 'edit';
  initial?: StaffMember;
  branches: Array<{ id: string; display_name: string }>;
  canManageAdmin: boolean;
  onSave: (data: unknown) => Promise<boolean>;
  onCancel: () => void;
}

export function StaffForm({ mode, initial, branches, canManageAdmin, onSave, onCancel }: StaffFormProps) {
  const { t } = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<'tenant_admin' | 'manager' | 'staff'>(initial?.role ?? 'staff');
  const [branchId, setBranchId] = useState(initial?.branchId ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'add' && !phone.trim() && !email.trim()) {
      setError(t('adminStaff.phoneOrEmailRequired'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      const payload = mode === 'add'
        ? { fullName: fullName.trim(), phone: phone.trim() || null, email: email.trim() || null, role, branchId: branchId || null }
        : { userId: initial?.userId, role, branchId: branchId || null };
      const ok = await onSave(payload);
      if (!ok) setPending(false);
    } catch {
      setPending(false);
    }
  };

  return (
    <Card className="glass border-gold-500/20">
      <CardHeader>
        <CardTitle className="text-lg">
          {mode === 'add' ? t('adminStaff.addStaff') : t('adminStaff.editRole')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'add' && (
            <>
              <FieldRow label={t('adminStaff.fullName')}>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </FieldRow>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldRow label={t('adminStaff.phone')}>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" inputMode="tel" dir="ltr" />
                </FieldRow>
                <FieldRow label={t('adminStaff.email')}>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" />
                </FieldRow>
              </div>
              <p className="text-xs text-muted-foreground">{t('adminStaff.loginHint')}</p>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldRow label={t('adminStaff.role')}>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="staff">{t('adminStaff.roleStaff')}</option>
                <option value="manager">{t('adminStaff.roleManager')}</option>
                {canManageAdmin && <option value="tenant_admin">{t('adminStaff.roleAdmin')}</option>}
              </select>
            </FieldRow>
            <FieldRow label={t('adminStaff.branchAssignment')}>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('adminStaff.allBranches')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.display_name}</option>
                ))}
              </select>
            </FieldRow>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="gold" disabled={pending} className="flex-1">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('admin.save')}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>{t('admin.cancel')}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
