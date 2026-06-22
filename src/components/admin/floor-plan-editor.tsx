'use client';
import { useCallback, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/context';
import type { StationAdmin } from '@/lib/stations-admin';
import { updateStationPositionsAction } from '@/app/admin/stations/actions';
import { Save, Loader2 } from 'lucide-react';

// The floor-plan stores x/y as integers 0-100 (percent of canvas).
// The public live board and station cards can consume these positions
// in a future step to render a real floor map (TODO: public board floor map).

interface FloorPlanEditorProps {
  stations: StationAdmin[];
  gameTypes: Array<{ id: string; display_name_en: string; display_name_ar: string; icon: string | null }>;
}

type Pos = { x: number; y: number };

const CANVAS_W = 900;
const CANVAS_H = 540;
const TILE_W = 80;
const TILE_H = 56;
const GRID = 20; // snap grid in pixels

function snap(v: number) {
  return Math.round(v / GRID) * GRID;
}

function canvasToPct(px: number, dim: number): number {
  return Math.round((px / dim) * 100);
}

const STATUS_COLOR: Record<string, string> = {
  available: '#22c55e',
  occupied: '#eab308',
  reserved: '#f97316',
  maintenance: '#ef4444',
  cleaning: '#3b82f6',
};

export function FloorPlanEditor({ stations, gameTypes }: FloorPlanEditorProps) {
  const { t, locale } = useT();

  const [positions, setPositions] = useState<Record<string, Pos>>(() => {
    const init: Record<string, Pos> = {};
    stations.forEach((s, i) => {
      init[s.id] = {
        x: s.positionX ?? (i % 8) * (CANVAS_W / 8),
        y: s.positionY ?? Math.floor(i / 8) * (CANVAS_H / 3),
      };
    });
    return init;
  });

  const [savePending, startSave] = useTransition();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const gtMap = new Map(gameTypes.map((g) => [g.id, g]));

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, stationId: string) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = positions[stationId] ?? { x: 0, y: 0 };
      dragRef.current = { id: stationId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    },
    [positions],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { id, startX, startY, origX, origY } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newX = Math.max(0, Math.min(CANVAS_W - TILE_W, snap(origX + dx)));
    const newY = Math.max(0, Math.min(CANVAS_H - TILE_H, snap(origY + dy)));
    setPositions((prev) => ({ ...prev, [id]: { x: newX, y: newY } }));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleSave = () => {
    const payload = Object.entries(positions).map(([stationId, pos]) => ({
      stationId,
      x: canvasToPct(pos.x, CANVAS_W),
      y: canvasToPct(pos.y, CANVAS_H),
    }));
    startSave(async () => {
      const res = await updateStationPositionsAction(payload);
      if (res.ok) toast.success(t('adminStations.layoutSaved'));
      else toast.error(res.error);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('adminStations.floorHint')}</p>
        <Button variant="gold" onClick={handleSave} disabled={savePending}>
          {savePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('adminStations.saveLayout')}
        </Button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ width: CANVAS_W, height: CANVAS_H, maxWidth: '100%' }}
        className="relative rounded-xl border border-border/60 bg-card/60 overflow-hidden select-none touch-none"
      >
        {/* Subtle grid background */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={CANVAS_W} height={CANVAS_H}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {stations.map((station) => {
          const pos = positions[station.id] ?? { x: 0, y: 0 };
          const gt = gtMap.get(station.gameTypeId);
          const color = STATUS_COLOR[station.status] ?? '#6b7280';
          const name = locale === 'ar' ? station.gameTypeNameAr : station.gameTypeName;
          return (
            <div
              key={station.id}
              onPointerDown={(e) => handlePointerDown(e, station.id)}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: TILE_W,
                height: TILE_H,
                cursor: 'grab',
                userSelect: 'none',
              }}
              className="rounded-lg border border-white/20 bg-card/90 backdrop-blur-sm flex flex-col items-center justify-center gap-0.5 hover:border-gold-500/50 transition-colors shadow-md"
            >
              <div className="text-xs font-bold font-mono leading-none" style={{ color }}>
                {station.code}
              </div>
              {gt?.icon && <div className="text-sm leading-none">{gt.icon}</div>}
              <div className="text-[9px] text-muted-foreground leading-none text-center px-1 truncate w-full text-center">
                {name}
              </div>
              <div className="h-1.5 w-1.5 rounded-full mt-0.5" style={{ backgroundColor: color }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
