// The processor-memory performance gap: processor and DRAM performance relative to 1980, on a log
// scale. The shaded band between the lines is the gap. Hover or tap a year to read it.
// Default values are read off Hennessy & Patterson's figure, so they are approximate.
import { useRef, useState, type PointerEvent } from 'react';
import { useWidth } from './OooTimeline';
import s from './MemoryGapChart.module.css';

interface Props {
	startYear?: number;
	/** Processor performance per year, relative to the first year. */
	processor?: number[];
	/** Memory performance per year, relative to the first year. */
	memory?: number[];
	/** Year selected at first. */
	year?: number;
}

// 1980 to 2020, read off H&P (Computer Architecture: A Quantitative Approach) Figure "processor-memory gap".
const PROCESSOR = [
	1, 1.2, 1.45, 1.9, 2.25, 2.9, 3.6, 5.8, 8.5, 13, 19, 30, 45, 70, 105, 160, 230, 400, 570, 900, 1450, 2050, 3100, 4700, 7000, 9000, 9000,
	9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000,
];
const MEMORY = [
	1, 1.05, 1.1, 1.15, 1.2, 1.3, 1.4, 1.55, 1.6, 1.75, 1.8, 2, 2.15, 2.3, 2.55, 2.7, 2.85, 3.05, 3.3, 3.4, 3.6, 3.85, 4.3, 4.5, 4.9, 5.4, 5.7,
	5.8, 6.4, 6.7, 7.5, 8, 8.4, 8.9, 9.3, 9.9, 10, 10, 10, 9.9, 9.9,
];

const sig = (x: number) => (x >= 100 ? Math.round(x / 10 ** (Math.floor(Math.log10(x)) - 1)) * 10 ** (Math.floor(Math.log10(x)) - 1) : Math.round(x * 10) / 10);
const fmt = (x: number) => sig(x).toLocaleString('en-US');

export default function MemoryGapChart({ startYear = 1980, processor = PROCESSOR, memory = MEMORY, year = 2005 }: Props) {
	const wrap = useRef<HTMLDivElement>(null);
	const [width] = useWidth(wrap);
	const narrow = width < 500;
	const n = Math.min(processor.length, memory.length);
	const [sel, setSel] = useState(Math.min(n - 1, Math.max(0, year - startYear)));

	const H = narrow ? 250 : 290;
	const L = narrow ? 50 : 58;
	const R = narrow ? 12 : 20;
	const T = 16;
	const B = 36;
	const pw = width - L - R;
	const ph = H - T - B;
	const decades = Math.ceil(Math.log10(Math.max(...processor.slice(0, n))));
	const x = (i: number) => L + (i / (n - 1)) * pw;
	const y = (v: number) => T + ph - (Math.log10(v) / decades) * ph;
	const line = (vals: number[]) => vals.slice(0, n).map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
	const band =
		processor
			.slice(0, n)
			.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
			.join(' ') +
		' ' +
		memory
			.slice(0, n)
			.map((v, i) => [i, v] as const)
			.reverse()
			.map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
			.join(' ') +
		' Z';
	const yearStep = narrow ? 10 : 5;

	const pick = (e: PointerEvent<SVGRectElement>) => {
		const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
		const px = ((e.clientX - box.left) / box.width) * width;
		setSel(Math.max(0, Math.min(n - 1, Math.round(((px - L) / pw) * (n - 1)))));
	};
	const gap = processor[sel] / memory[sel];

	return (
		<figure className={`not-content ${s.root}`}>
			<p className={s.readout} aria-live="polite">
				<b>{startYear + sel}</b>
				<span className={s.chip}>
					<span className={s.swCpu} /> processor {fmt(processor[sel])}×
				</span>
				<span className={s.chip}>
					<span className={s.swMem} /> memory {fmt(memory[sel])}×
				</span>
				<span className={s.gapTag}>gap {fmt(gap)}×</span>
			</p>
			<div ref={wrap} className={s.wrap}>
				<svg className={s.svg} width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Processor vs memory performance since 1980, log scale">
					{Array.from({ length: decades + 1 }, (_, d) => (
						<g key={d}>
							<line className={s.grid} x1={L} x2={L + pw} y1={y(10 ** d)} y2={y(10 ** d)} />
							<text className={s.tick} x={L - 6} y={y(10 ** d) + 4} textAnchor="end">
								{(10 ** d).toLocaleString('en-US')}
							</text>
						</g>
					))}
					{Array.from({ length: n }, (_, i) =>
						(startYear + i) % yearStep === 0 ? (
							<text key={i} className={s.tick} x={x(i)} y={T + ph + 16} textAnchor="middle">
								{startYear + i}
							</text>
						) : null,
					)}
					<text className={s.axisTitle} transform={`translate(12, ${T + ph / 2}) rotate(-90)`} textAnchor="middle">
						performance (log)
					</text>
					<line className={s.axis} x1={L} x2={L} y1={T} y2={T + ph} />
					<line className={s.axis} x1={L} x2={L + pw} y1={T + ph} y2={T + ph} />

					<path className={s.band} d={band} />
					<path className={s.cpu} d={line(processor)} />
					<path className={s.mem} d={line(memory)} />
					<text className={s.cpuLbl} x={x(Math.round(n * 0.32))} y={y(processor[Math.round(n * 0.32)]) - 10} textAnchor="end">
						Processor
					</text>
					<text className={s.memLbl} x={x(Math.round(n * 0.55))} y={y(memory[Math.round(n * 0.55)]) + 18} textAnchor="middle">
						Memory
					</text>
					<text className={s.gapLbl} x={x(Math.round(n * 0.78))} y={(y(processor[Math.round(n * 0.78)]) + y(memory[Math.round(n * 0.78)])) / 2 + 4} textAnchor="middle">
						the gap
					</text>

					{/* Selected year */}
					<line className={s.guide} x1={x(sel)} x2={x(sel)} y1={y(processor[sel])} y2={y(memory[sel])} />
					<circle className={s.ptCpu} cx={x(sel)} cy={y(processor[sel])} r={5} />
					<circle className={s.ptMem} cx={x(sel)} cy={y(memory[sel])} r={5} />

					<rect className={s.hit} x={L} y={T} width={pw} height={ph} onPointerMove={pick} onPointerDown={pick} />
				</svg>
			</div>
			<figcaption className={s.caption}>
				Relative to {startYear}. Approximate values read off the figure in Hennessy and Patterson, <i>Computer Architecture: A Quantitative Approach</i>.
			</figcaption>
			<div className={s.legend}>
				<span className={s.lg}>
					<span className={s.swCpu} /> Processor
				</span>
				<span className={s.lg}>
					<span className={s.swMem} /> Memory
				</span>
				<span className={s.lg}>
					<span className={s.swBand} /> Gap
				</span>
			</div>
		</figure>
	);
}
