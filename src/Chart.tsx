/** Tiny SVG charts; enough for daily bars and a growth line without a chart library. */
export function Bars({ data, label, fmt, color }: { data: { x: string; y: number }[]; label: string; fmt: (v: number) => string; color: string }) {
  const max = Math.max(...data.map(d => d.y), 1e-9)
  const w = 100 / data.length
  return (
    <figure className="chart">
      <figcaption>{label}</figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${label}: ${data.map(d => `${d.x} ${fmt(d.y)}`).join(', ')}`}>
        {data.map((d, i) => <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={40 - (d.y / max) * 38} height={(d.y / max) * 38} fill={color} rx={0.5} />)}
      </svg>
      <div className="axis"><span>{data[0]?.x}</span><span>max {fmt(max)}</span><span>{data.at(-1)?.x}</span></div>
    </figure>
  )
}

export function Line({ points, label, unit, color }: { points: { x: number; y: number }[]; label: string; unit: string; color: string }) {
  if (points.length === 0) return null
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const px = (x: number) => (x1 === x0 ? 50 : 4 + ((x - x0) / (x1 - x0)) * 92)
  const py = (y: number) => (y1 === y0 ? 20 : 37 - ((y - y0) / (y1 - y0)) * 34)
  return (
    <figure className="chart">
      <figcaption>{label} ({unit})</figcaption>
      <svg viewBox="0 0 100 40" role="img" aria-label={`${label}: ${points.map(p => p.y + ' ' + unit).join(', ')}`}>
        <polyline fill="none" stroke={color} strokeWidth={0.8} points={points.map(p => `${px(p.x)},${py(p.y)}`).join(' ')} />
        {points.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r={1.2} fill={color} />)}
      </svg>
      <div className="axis"><span>{y0} {unit}</span><span>{y1} {unit}</span></div>
    </figure>
  )
}
