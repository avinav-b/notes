// Throughput vs number of threads: close to linear at first, then slower growth, then (in practice)
// decline. The ideal path levels off at the peak; the practical path falls. Hover or tap anywhere
// on the plot to read a point.
import { useRef, useState } from 'react';
import { useWidth } from './OooTimeline';
import s from './ThroughputCurve.module.css';

interface Props {
	/** Practical throughput at 1, 2, 3, ... threads. */
	practical?: number[];
	/** Ideal throughput at 1, 2, 3, ... threads. */
	ideal?: number[];
	/** Thread counts where "close to linear" ends and "increase slowly" ends. */
	regions?: [number, number];
}

const PRACTICAL = [1, 1.95, 2.85, 3.7, 4.3, 4.72, 4.98, 5.1, 5.02, 4.8, 4.48, 4.1, 3.7, 3.3];
const IDEAL = [1, 1.95, 2.85, 3.7, 4.3, 4.72, 4.98, 5.1, 5.15, 5.18, 5.2, 5.21, 5.22, 5.22];

const TOP = 46;
const BOTTOM = 40;
const LEFT = 34;
const RIGHT = 70;
const H = 300;

export default function ThroughputCurve({ practical = PRACTICAL, ideal = IDEAL, regions = [4, 8] }: Props) {
	const wrap = useRef<HTMLDivElement>(null);
	const [width] = useWidth(wrap);
	const n = practical.length;
	const peak = practical.indexOf(Math.max(...practical));
	const [sel, setSel] = useState(peak);

	const yMax = Math.ceil(Math.max(...ideal, ...practical) + 0.5);
	const plotW = width - LEFT - RIGHT;
	const plotH = H - TOP - BOTTOM;
	const x = (threads: number) => LEFT + ((threads - 1) / (n - 1)) * plotW;
	const y = (v: number) => TOP + plotH - (v / yMax) * plotH;
	const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
	const colW = plotW / (n - 1);
	const narrow = width < 480;

	const regionLabels = [
		{ from: 1, to: regions[0], text: narrow ? 'linear' : 'close to linear' },
		{ from: regions[0], to: regions[1], text: narrow ? 'slower' : 'increase slowly' },
		{ from: regions[1], to: n, text: narrow ? 'degrading' : 'degrading performance' },
	];

	const pct = Math.round((100 * practical[sel]) / practical[peak]);
	const thread = sel + 1;

	return (
		<figure className={`not-content ${s.root}`}>
			<p className={s.readout} aria-live="polite">
				<b>{thread} {thread === 1 ? 'thread' : 'threads'}</b>
				<span className={s.chip}>
					<span className={s.swPractical} /> practical {practical[sel].toFixed(1)}x
				</span>
				<span className={s.chip}>
					<span className={s.swIdeal} /> ideal {ideal[sel].toFixed(1)}x
				</span>
				<span className={sel === peak ? s.peakTag : s.pctTag}>{sel === peak ? 'peak' : `${pct}% of peak`}</span>
			</p>

			<div ref={wrap} className={s.wrap}>
				<svg
					className={s.svg}
					width={width}
					height={H}
					viewBox={`0 0 ${width} ${H}`}
					role="img"
					aria-label="Throughput against number of threads"
				>
					{/* Regions */}
					{regionLabels.map((r, i) => (
						<g key={r.text}>
							{i > 0 && <line x1={x(r.from)} x2={x(r.from)} y1={TOP - 22} y2={TOP + plotH} className={s.divider} />}
							<text x={(x(r.from) + x(r.to)) / 2} y={TOP - 26} textAnchor="middle" className={s.region}>
								{r.text}
							</text>
						</g>
					))}

					{/* Axes */}
					<line x1={LEFT} x2={LEFT} y1={TOP - 6} y2={TOP + plotH} className={s.axisLine} />
					<line x1={LEFT} x2={LEFT + plotW + 10} y1={TOP + plotH} y2={TOP + plotH} className={s.axisLine} />
					<text className={s.axisTitle} transform={`translate(${LEFT - 14}, ${TOP + plotH / 2}) rotate(-90)`} textAnchor="middle">
						throughput
					</text>
					<text className={s.axisTitle} x={LEFT + plotW / 2} y={H - 6} textAnchor="middle">
						number of threads
					</text>
					{practical.map((_, i) =>
						(i + 1) % (narrow ? 2 : 1) === 0 || i === 0 ? (
							<text key={i} x={x(i + 1)} y={TOP + plotH + 16} textAnchor="middle" className={s.tick}>
								{i + 1}
							</text>
						) : null,
					)}

					{/* Selection guide */}
					<line x1={x(thread)} x2={x(thread)} y1={TOP} y2={TOP + plotH} className={s.guide} />

					{/* Paths */}
					<path d={path(ideal)} className={s.ideal} />
					<path d={path(practical)} className={s.practical} />
					<text x={x(n) + 6} y={y(ideal[n - 1]) + 4} className={s.pathLabel}>
						ideal
					</text>
					<text x={x(n) + 6} y={y(practical[n - 1]) + 4} className={s.pathLabelP}>
						practical
					</text>

					{/* Peak */}
					<g className={s.peak}>
						<line x1={x(peak + 1)} x2={x(peak + 1)} y1={y(practical[peak]) + 10} y2={TOP + plotH - 2} />
						<text x={x(peak + 1) + 6} y={TOP + plotH - 10}>
							measure the peak
						</text>
					</g>

					{/* Points */}
					{practical.map((v, i) => (
						<circle key={i} cx={x(i + 1)} cy={y(v)} r={i === sel ? 6 : 3.5} className={i === sel ? s.ptSel : s.pt} />
					))}
					{!same(sel, practical, ideal) && <circle cx={x(thread)} cy={y(ideal[sel])} r={4.5} className={s.ptIdeal} />}

					{/* Hit areas: hover or tap anywhere in a column */}
					{practical.map((_, i) => (
						<rect
							key={i}
							x={x(i + 1) - colW / 2}
							y={TOP - 10}
							width={colW}
							height={plotH + 10}
							className={s.hit}
							onPointerEnter={() => setSel(i)}
							onPointerDown={() => setSel(i)}
						/>
					))}
				</svg>
			</div>

			<div className={s.legend}>
				<span className={s.lg}>
					<span className={s.swIdeal} /> Ideal path
				</span>
				<span className={s.lg}>
					<span className={s.swPractical} /> Practical path
				</span>
				<span className={s.lg}>
					<span className={s.swPeak} /> Peak throughput
				</span>
			</div>
		</figure>
	);
}

/** True when the ideal and practical values coincide (no separate ideal dot needed). */
const same = (i: number, p: number[], q: number[]) => Math.abs(p[i] - q[i]) < 0.05;
