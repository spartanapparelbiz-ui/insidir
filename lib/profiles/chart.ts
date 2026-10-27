/* The profit-over-time line on a trader's profile, as an SVG path (pure, server-rendered, no chart library). */

export interface ChartGeom { path: string; zeroY: number; width: number; height: number; min: number; max: number; first: number; last: number }

export function profitPath(series: ReadonlyArray<{ at: number; profit: number }>, width = 640, height = 180, pad = 8): ChartGeom | null {
  if (series.length < 2) return null;
  const xs = series.map(p => p.at), ys = [0, ...series.map(p => p.profit)];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), min = Math.min(...ys), max = Math.max(...ys);
  const sx = (x: number) => pad + ((x - x0) / Math.max(1, x1 - x0)) * (width - 2 * pad);
  const sy = (y: number) => pad + (1 - (y - min) / Math.max(1e-9, max - min)) * (height - 2 * pad);
  // A step line: profit only changes when a market resolves.
  let path = `M${sx(xs[0]!).toFixed(1)},${sy(0).toFixed(1)} V${sy(series[0]!.profit).toFixed(1)}`;
  for (let i = 1; i < series.length; i++) path += ` H${sx(series[i]!.at).toFixed(1)} V${sy(series[i]!.profit).toFixed(1)}`;
  return { path, zeroY: sy(0), width, height, min, max, first: series[0]!.profit, last: series.at(-1)!.profit };
}
