'use client';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/context';
import type { StationAdmin } from '@/lib/stations-admin';
import { updateStationPositionsAction } from '@/app/admin/stations/actions';
import { Save, Loader2, LayoutGrid } from 'lucide-react';

// The floor-plan stores x/y as integers 0-100 (percent of canvas), so the
// saved layout is resolution-independent — a future public/at-a-glance
// board can render it at any canvas size.

interface FloorPlanEditorProps {
  stations: StationAdmin[];
  gameTypes: Array<{ id: string; display_name_en: string; display_name_ar: string; icon: string | null }>;
}

type Pos = { x: number; y: number };
type Shape = { w: number; h: number; rounded: string };

const CANVAS_W = 900;
const CANVAS_H = 560;
const GRID = 20; // snap grid in pixels (~2.2% of canvas width)
const PADDING = 16;

// Tile footprint mirrors the physical shape of each game: pool/ping-pong
// tables are wide rectangles, bowling lanes are long and narrow, and
// PS5/VR/arcade cabinets are small squares.
const SHAPE_BY_CATEGORY: Record<string, Shape> = {
  billiard: { w: 100, h: 54, rounded: 'rounded-md' },
  ping_pong: { w: 92, h: 50, rounded: 'rounded-md' },
  bowling: { w: 176, h: 38, rounded: 'rounded-sm' },
  foosball: { w: 78, h: 42, rounded: 'rounded-md' },
  karaoke: { w: 66, h: 66, rounded: 'rounded-lg' },
  ps5: { w: 54, h: 54, rounded: 'rounded-xl' },
  vr: { w: 54, h: 54, rounded: 'rounded-xl' },
  arcade: { w: 54, h: 54, rounded: 'rounded-xl' },
  other: { w: 64, h: 64, rounded: 'rounded-lg' },
};

function shapeFor(category: string): Shape {
  return SHAPE_BY_CATEGORY[category] ?? SHAPE_BY_CATEGORY.other;
}

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function canvasToPct(px: number, dim: number): number {
  return Math.round((px / dim) * 100);
}

function pctToCanvas(pct: number, dim: number): number {
  return Math.round((pct / 100) * dim);
}

const STATUS_COLOR: Record<string, string> = {
  available: '#22c55e',
  occupied: '#eab308',
  reserved: '#f97316',
  maintenance: '#ef4444',
  cleaning: '#3b82f6',
};

/** Lay stations out in neat rows, grouped by game type — the escape hatch for a messy layout. */
function autoArrangePositions(stations: StationAdmin[]): Record<string, Pos> {
  const groups = new Map<string, StationAdmin[]>();
  for (const s of stations) {
    const arr = groups.get(s.gameTypeId) ?? [];
    arr.push(s);
    groups.set(s.gameTypeId, arr);
  }

  const positions: Record<string, Pos> = {};
  let y = PADDING;
  for (const group of groups.values()) {
    const shape = shapeFor(group[0].gameTypeCategory);
    let x = PADDING;
    for (const station of group) {
      if (x + shape.w > CANVAS_W - PADDING) {
        x = PADDING;
        y += shape.h + PADDING;
      }
      positions[station.id] = { x: snap(x), y: snap(y) };
      x += shape.w + PADDING;
    }
    y += shape.h + PADDING * 1.5;
  }
  return positions;
}

export function FloorPlanEditor({ stations, gameTypes }: FloorPlanEditorProps) {
  const { t, locale } = useT();

  const [positions, setPositions] = useState<Record<string, Pos>>(() => {
    const init: Record<string, Pos> = {};
    const fallback = autoArrangePositions(stations);
    stations.forEach((s) => {
      init[s.id] = s.positionX != null && s.positionY != null
        ? { x: pctToCanvas(s.positionX, CANVAS_W), y: pctToCanvas(s.positionY, CANVAS_H) }
        : (fallback[s.id] ?? { x: PADDING, y: PADDING });
    });
    return init;
  });

  const [savePending, startSave] = useTransition();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const gtMap = new Map(gameTypes.map((g) => [g.id, g]));
  const shapeByStation = useMemo(() => new Map(stations.map((s) => [s.id, shapeFor(s.gameTypeCategory)])), [stations]);

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
    const shape = shapeByStation.get(id) ?? SHAPE_BY_CATEGORY.other;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newX = Math.max(0, Math.min(CANVAS_W - shape.w, snap(origX + dx)));
    const newY = Math.max(0, Math.min(CANVAS_H - shape.h, snap(origY + dy)));
    setPositions((prev) => ({ ...prev, [id]: { x: newX, y: newY } }));
  }, [shapeByStation]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleAutoArrange = () => {
    setPositions(autoArrangePositions(stations));
    toast.success(t('adminStations.autoArranged'));
  };

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('adminStations.floorHint')}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleAutoArrange}>
            <LayoutGrid className="h-4 w-4" />
            {t('adminStations.autoArrange')}
          </Button>
          <Button variant="gold" onClick={handleSave} disabled={savePending}>
            {savePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('adminStations.saveLayout')}
          </Button>
        </div>
      </div>

      {/* Live-status legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {(['available', 'occupied', 'reserved', 'maintenance', 'cleaning'] as const).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
            {t(`station.${status === 'available' ? 'free' : status === 'occupied' ? 'busy' : status}`)}
          </span>
        ))}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ width: CANVAS_W, height: CANVAS_H, maxWidth: '100%' }}
        className="relative rounded-xl border border-border/60 bg-card/60 overflow-hidden select-none touch-none"
      >
        {/* Graph-paper grid background: fine lines every GRID px, bolder lines every 5th. */}
        <svg className="absolute inset-0 pointer-events-none" width={CANVAS_W} height={CANVAS_H} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-minor" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="0.5" />
            </pattern>
            <pattern id="grid-major" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
              <rect width={GRID * 5} height={GRID * 5} fill="url(#grid-minor)" />
              <path d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-major)" />
        </svg>

        {stations.map((station) => {
          const pos = positions[station.id] ?? { x: 0, y: 0 };
          const shape = shapeByStation.get(station.id) ?? SHAPE_BY_CATEGORY.other;
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
                width: shape.w,
                height: shape.h,
                cursor: 'grab',
                userSelect: 'none',
                borderColor: `${color}55`,
                backgroundColor: `${color}14`,
              }}
              className={`${shape.rounded} border bg-card/90 backdrop-blur-sm flex flex-col items-center justify-center gap-0.5 hover:border-gold-500/50 transition-colors shadow-md`}
            >
              <div className="text-xs font-bold font-mono leading-none" style={{ color }}>
                {station.code}
              </div>
              {gt?.icon && <div className="text-sm leading-none">{gt.icon}</div>}
              <div className="text-[9px] text-muted-foreground leading-none text-center px-1 truncate w-full">
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
