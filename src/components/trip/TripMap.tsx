import type { TripPlan } from "@/lib/agent/types";
import { Card } from "@/components/ui/primitives";

const DAY_COLORS = ["#0f5f5c", "#b5532c", "#c99a2e", "#5f8a6a", "#7c6f9c", "#3f6fa3", "#9c4f6f", "#57524a"];
const WIDTH = 320;
const HEIGHT = 220;
const PADDING = 22;

/**
 * A schematic map of where each day's stops sit relative to your stay.
 * Plotted from approximate coordinates — for orientation, not navigation.
 */
export function TripMap({ plan }: { plan: TripPlan }) {
  const stay = { lat: plan.destination.lat, lng: plan.destination.lng };
  const days = plan.days.filter((d) => d.activities.length > 0);
  const points = [stay, ...days.flatMap((d) => d.activities)];
  if (points.length < 2) return null;

  const cosLat = Math.cos((stay.lat * Math.PI) / 180);
  const xs = points.map((p) => p.lng * cosLat);
  const ys = points.map((p) => p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY, 0.01);
  const scale = Math.min((WIDTH - PADDING * 2) / span, (HEIGHT - PADDING * 2) / span);
  const offsetX = (WIDTH - (maxX - minX) * scale) / 2;
  const offsetY = (HEIGHT - (maxY - minY) * scale) / 2;
  const project = (p: { lat: number; lng: number }) => ({
    x: offsetX + (p.lng * cosLat - minX) * scale,
    y: HEIGHT - (offsetY + (p.lat - minY) * scale),
  });
  const home = project(stay);
  const kmAcross = Math.round(span * 111);

  return (
    <Card className="p-5">
      <h2 className="font-display text-xl text-ink">Where things are</h2>
      <p className="mt-1 text-sm text-ink-soft">Stops by day, around your stay. About {kmAcross} km across.</p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-3 w-full rounded-xl bg-surface-muted/60"
        role="img"
        aria-label={`Map of ${days.reduce((n, d) => n + d.activities.length, 0)} stops around ${plan.destination.name}, spread over about ${kmAcross} km.`}
      >
        {days.map((day) => {
          const color = DAY_COLORS[(day.day - 1) % DAY_COLORS.length];
          const path = [home, ...day.activities.map(project)].map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          return <path key={`path-${day.day}`} d={path} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 3" />;
        })}
        {days.map((day) =>
          day.activities.map((activity) => {
            const p = project(activity);
            const color = DAY_COLORS[(day.day - 1) % DAY_COLORS.length];
            return (
              <g key={activity.id}>
                <circle cx={p.x} cy={p.y} r={7} fill={color} stroke="#fff" strokeWidth={1.5} />
                <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">
                  {day.day}
                </text>
                <title>{`Day ${day.day}: ${activity.name}`}</title>
              </g>
            );
          }),
        )}
        <g>
          <rect x={home.x - 6} y={home.y - 6} width={12} height={12} rx={3} fill="#1d1b18" stroke="#fff" strokeWidth={1.5} />
          <title>Your stay</title>
        </g>
      </svg>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-ink" aria-hidden /> Stay
        </li>
        {days.map((day) => (
          <li key={day.day} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DAY_COLORS[(day.day - 1) % DAY_COLORS.length] }} aria-hidden /> Day {day.day}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-faint">Approximate positions, for orientation only.</p>
    </Card>
  );
}
