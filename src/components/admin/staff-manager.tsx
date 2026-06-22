'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n/context';
import type { StaffMember } from '@/lib/staff';
import { StaffForm } from './staff-form';
import {
  listStaffAction, addStaffAction, updateStaffRoleAction,
  toggleStaffActiveAction, removeStaffAction,
} from '@/app/admin/staff/actions';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

interface StaffManagerProps {
  initialStaff: StaffMember[];
  branches: Array<{ id: string; display_name: string }>;
  currentUserId: string;
  canManageAdmin: boolean;
}

export function StaffManager({ initialStaff, branches, currentUserId, canManageAdmin }: StaffManagerProps) {
  const { t } = useT();
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      const res = await listStaffAction();
      if (res.ok) setStaff(res.staff);
    });
  };

  const handleToggle = (member: StaffMember) => {
    if (!window.confirm(member.isActive ? t('adminStaff.deactivateConfirm') : t('adminStaff.activateConfirm'))) return;
    startTransition(async () => {
      const res = await toggleStaffActiveAction(member.userId, !member.isActive);
      if (res.ok) { toast.success(t('adminStaff.toggled')); refresh(); }
      else toast.error(res.error);
    });
  };

  const handleRemove = (member: StaffMember) => {
    if (member.userId === currentUserId) { toast.error(t('adminStaff.cannotModifySelf')); return; }
    if (!window.confirm(t('adminStaff.removeConfirm', { name: member.fullName ?? member.phone ?? '' }))) return;
    startTransition(async () => {
      const res = await removeStaffAction(member.userId);
      if (res.ok) { toast.success(t('adminStaff.removed')); refresh(); }
      else {
        const msg = res.error.includes('cannot_modify_self') ? t('adminStaff.cannotModifySelf') : res.error;
        toast.error(msg);
      }
    });
  };

  const handleSaveAdd = async (data: unknown) => {
    const res = await addStaffAction(data);
    if (res.ok) { toast.success(t('adminStaff.added')); setShowAdd(false); refresh(); }
    else toast.error(res.error);
    return res.ok;
  };

  const handleSaveEdit = async (data: unknown) => {
    if (!editMember) return false;
    const res = await updateStaffRoleAction(data);
    if (res.ok) { toast.success(t('adminStaff.updated')); setEditMember(null); refresh(); }
    else toast.error(res.error);
    return res.ok;
  };

  const roleBadgeClass = (role: string) => {
    if (role === 'tenant_admin') return 'bg-gold-500/20 text-gold-400 border-gold-500/30';
    if (role === 'manager') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-muted/40 text-muted-foreground';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="gold" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          {t('adminStaff.addStaff')}
        </Button>
      </div>

      {(showAdd || editMember) && (
        <StaffForm
          mode={showAdd ? 'add' : 'edit'}
          initial={editMember ?? undefined}
          branches={branches}
          canManageAdmin={canManageAdmin}
          onSave={showAdd ? handleSaveAdd : handleSaveEdit}
          onCancel={() => { setShowAdd(false); setEditMember(null); }}
        />
      )}

      {staff.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{t('adminStaff.noStaff')}</p>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-start">{t('adminStaff.name')}</th>
                <th className="px-4 py-3 text-start">{t('adminStaff.contact')}</th>
                <th className="px-4 py-3 text-start">{t('adminStaff.role')}</th>
                <th className="px-4 py-3 text-start">{t('adminStaff.branch')}</th>
                <th className="px-4 py-3 text-start">{t('admin.statusActive')}</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {staff.map((member) => {
                const isSelf = member.userId === currentUserId;
                return (
                  <tr key={member.userId} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {member.fullName ?? '—'}
                      {isSelf && (
                        <span className="ms-2 text-[10px] font-semibold bg-gold-500/20 text-gold-400 px-1.5 py-0.5 rounded">
                          {t('adminStaff.you')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {member.phone ?? member.email ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={roleBadgeClass(member.role)}>{member.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {member.branchName ?? t('adminStaff.allBranches')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={member.isActive ? 'default' : 'secondary'} className={member.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}>
                        {member.isActive ? t('admin.statusActive') : t('admin.statusInactive')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="icon" onClick={() => setEditMember(member)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled={isSelf} onClick={() => handleToggle(member)}>
                          {member.isActive
                            ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                            : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className={isSelf ? 'opacity-30 cursor-not-allowed' : 'text-destructive hover:text-destructive'}
                          disabled={isSelf}
                          onClick={() => !isSelf && handleRemove(member)}
                        >
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
