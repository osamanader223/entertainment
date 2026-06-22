'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n/context';
import type { StationAdmin } from '@/lib/stations-admin';
import { StationForm } from './station-form';
import { FloorPlanEditor } from './floor-plan-editor';
import {
  listStationsAction, createStationAction, updateStationAction,
  setStationStatusAction, deleteStationAction,
} from '@/app/admin/stations/actions';
import { Plus, Pencil, Trash2, Wrench, CheckCircle2, Wind } from 'lucide-react';

interface StationsManagerProps {
  initialStations: StationAdmin[];
  gameTypes: Array<{ id: string; display_name_en: string; display_name_ar: string; icon: string | null }>;
}

type Tab = 'list' | 'floor';

export function StationsManager({ initialStations, gameTypes }: StationsManagerProps) {
  const { t, locale } = useT();
  const [stations, setStations] = useState<StationAdmin[]>(initialStations);
  const [tab, setTab] = useState<Tab>('list');
  const [editStation, setEditStation] = useState<StationAdmin | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = () => {
    startTransition(async () => {
      const res = await listStationsAction();
      if (res.ok) setStations(res.stations);
    });
  };

  const handleDelete = (station: StationAdmin) => {
    if (!window.confirm(t('adminStations.deleteConfirm', { name: station.displayName }))) return;
    startTransition(async () => {
      const res = await deleteStationAction(station.id);
      if (res.ok) {
        toast.success(res.archived ? t('adminStations.archived') : t('adminStations.deleted'));
        refresh();
      } else {
        const msg = res.error.includes('station_in_use') ? t('adminStations.stationInUse') : res.error;
        toast.error(msg);
      }
    });
  };

  const handleStatusChange = (station: StationAdmin, status: 'available' | 'maintenance' | 'cleaning') => {
    startTransition(async () => {
      const res = await setStationStatusAction(station.id, status);
      if (res.ok) { toast.success(t('adminStations.statusChanged')); refresh(); }
      else {
        const msg = res.error.includes('station_in_use') ? t('adminStations.stationInUse') : res.error;
        toast.error(msg);
      }
    });
  };

  const handleSaveCreate = async (data: unknown) => {
    const res = await createStationAction(data);
    if (res.ok) { toast.success(t('adminStations.saved')); setShowCreate(false); refresh(); }
    else toast.error(res.error);
    return res.ok;
  };

  const handleSaveEdit = async (data: unknown) => {
    if (!editStation) return false;
    const res = await updateStationAction(editStation.id, data);
    if (res.ok) { toast.success(t('adminStations.saved')); setEditStation(null); refresh(); }
    else toast.error(res.error);
    return res.ok;
  };

  const statusColor = (status: string) => {
    if (status === 'available') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (status === 'occupied' || status === 'reserved') return 'bg-gold-500/20 text-gold-400 border-gold-500/30';
    return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
  };

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-border/50 pb-2">
        {(['list', 'floor'] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-t-md text-sm font-medium transition-colors ${
              tab === tabKey
                ? 'bg-gold-500/10 border border-gold-500/30 text-gold-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tabKey === 'list' ? t('adminStations.listTab') : t('adminStations.floorTab')}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="gold" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t('adminStations.createStation')}
            </Button>
          </div>

          {(showCreate || editStation) && (
            <StationForm
              mode={showCreate ? 'create' : 'edit'}
              initial={editStation ?? undefined}
              gameTypes={gameTypes}
              onSave={showCreate ? handleSaveCreate : handleSaveEdit}
              onCancel={() => { setShowCreate(false); setEditStation(null); }}
            />
          )}

          {stations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('adminStations.noStations')}</p>
          ) : (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('adminStations.code')}</th>
                    <th className="px-4 py-3 text-start">{t('adminStations.name')}</th>
                    <th className="px-4 py-3 text-start">{t('adminStations.gameType')}</th>
                    <th className="px-4 py-3 text-start">{t('adminStations.status')}</th>
                    <th className="px-4 py-3 text-start">{t('admin.isActive')}</th>
                    <th className="px-4 py-3 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {stations.map((station) => (
                    <tr key={station.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-xs">{station.code}</td>
                      <td className="px-4 py-3 font-medium">{station.displayName}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {locale === 'ar' ? station.gameTypeNameAr : station.gameTypeName}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={statusColor(station.status)}>{station.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={station.isActive ? 'default' : 'secondary'} className={station.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}>
                          {station.isActive ? t('admin.statusActive') : t('admin.statusInactive')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title={t('adminStations.setAvailable')} onClick={() => handleStatusChange(station, 'available')}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('adminStations.setMaintenance')} onClick={() => handleStatusChange(station, 'maintenance')}>
                            <Wrench className="h-3.5 w-3.5 text-rose-400" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('adminStations.setCleaning')} onClick={() => handleStatusChange(station, 'cleaning')}>
                            <Wind className="h-3.5 w-3.5 text-blue-400" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditStation(station)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(station)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'floor' && (
        <FloorPlanEditor stations={stations} gameTypes={gameTypes} />
      )}
    </div>
  );
}
