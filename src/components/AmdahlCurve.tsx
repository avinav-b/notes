// Amdahl's law on n cores: the run on 1 CPU vs n CPUs (the parallel part f shrinks to f/n, the serial
// part 1-f does not), and speedup vs number of cores for several values of f against ideal scaling.
// Drag the slider (or hover/tap the chart) to change n; pick f with the chips.
import { useRef, useState, type PointerEvent } from 'react';
import { useWidth } from './OooTimeline';
import s from './AmdahlCurve.module.css';

interface Props {
	/** Parallel fractions, one curve each. */
	fractions?: number[];
	/** Core-count ranges for the x axis (buttons switch between them). */
	ranges?: number[];
	f?: number;
	n?: number;
}

const COLORS = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)', 'var(--viz-series-4)'];
const speedup = (f: number, n: number) => 1 / (1 - f + f / n);
const pctLabel = (f: number) => `${Math.round(f * 1000) / 10}%`;
const num = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));

export default function AmdahlCurve({ fractions = [0.8, 0.9, 0.99, 0.999], ranges = [16, 64], f: f0 = 0.9, n: n0 = 16 }: Props) {
	const [fi, setFi] = useState(Math.max(0, fractions.indexOf(f0)));
	const [range, setRange] = useState(ranges.find((r) => r >= n0) ?? ranges[0]);
	const [n, setN] = useState(Math.min(n0, range));
	const wrap = useRef<HTMLDivElement>(null);
	const [width] = useWidth(wrap);
	const narrow = width < 500;

	const f = fractions[fi];
	const S = speedup(f, n);
	const limit = 1 / (1 - f);
	const color = COLORS[fi % COLORS.length];

	// ---- Speedup chart ----
	const H = narrow ? 260 : 300;
	const L = 40;
	const R = narrow ? 14 : 24;
	const T = 14;
	const B = 38;
	const pw = width - L - R;
	const ph = H - T - B;
	const x = (c: number) => L + (c / range) * pw;
	const y = (v: number) => T + ph - (Math.min(v, range) / range) * ph;
	const tickStep = range / 8;
	const ticks = Array.from({ length: 9 }, (_, i) => i * tickStep);
	const curve = (ff: number) => {
		const pts: string[] = [];
		const steps = 96;
		for (let i = 0; i <= steps; i++) {
			const c = 1 + ((range - 1) * i) / steps;
			pts.push(`${i ? 'L' : 'M'}${x(c).toFixed(1)},${y(speedup(ff, c)).toFixed(1)}`);
		}
		return `M${x(0)},${y(0)} L` + pts.join(' ').slice(1);
	};
	const pickN = (e: PointerEvent<SVGRectElement>) => {
		const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
		const px = ((e.clientX - box.left) / box.width) * width;
		setN(Math.max(1, Math.min(range, Math.round(((px - L) / pw) * range))));
	};

	// ---- CPU x time picture ----
	const DH = 186;
	const X0 = narrow ? 58 : 74;
	const TW = width - X0 - 12; // width of time 1
	const BLOCK = 54; // height of "n CPUs"
	const lane = Math.max(BLOCK / n, 4);
	const row1 = 22;
	const row2 = 96;
	const fw = f * TW;
	const fwN = (f / n) * TW;
	const sw = (1 - f) * TW;

	return (
		<div className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.controls}`}>
				<div className={s.seg} role="group" aria-label="Parallel fraction f">
					{fractions.map((ff, i) => (
						<button
							key={ff}
							className={`viz-btn ${s.fBtn} ${i === fi ? s.on : ''}`}
							style={{ ['--c' as string]: COLORS[i % COLORS.length] }}
							aria-pressed={i === fi}
							onClick={() => setFi(i)}
						>
							<span className={s.dot} />
							{pctLabel(ff)}
						</button>
					))}
				</div>
				{ranges.length > 1 && (
					<div className={s.seg} role="group" aria-label="Core range">
						{ranges.map((r) => (
							<button
								key={r}
								className={`viz-btn ${r === range ? s.onPlain : ''}`}
								aria-pressed={r === range}
								onClick={() => {
									setRange(r);
									setN((v) => Math.min(v, r));
								}}
							>
								{r} cores
							</button>
						))}
					</div>
				)}
				<label className={s.slider}>
					<span className={s.sliderName}>n</span>
					<input type="range" min={1} max={range} step={1} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Number of cores" />
					<span className={s.sliderValue}>{n}</span>
				</label>
			</div>

			<div className={s.readout} style={{ ['--c' as string]: color }}>
				<span className={s.big}>{num(S)}×</span>
				<span className={s.formula}>
					= 1 / ({num(1 - f)} + {f}/{n})
				</span>
				<span className={s.limitText}>limit 1/(1−f) = {Math.round(limit)}×</span>
			</div>

			<div ref={wrap} className={s.wrap}>
				{/* CPUs x time, as on the slide */}
				<svg className={s.svg} width={width} height={DH} viewBox={`0 0 ${width} ${DH}`} role="img" aria-label={`f = ${pctLabel(f)} on ${n} cores: time ${num(1 / S)} instead of 1`}>
					<text className={s.rowName} x={X0 - 10} y={row1 + 12} textAnchor="end">
						1 CPU
					</text>
					<text className={s.rowName} x={X0 - 10} y={row2 + BLOCK / 2 + 4} textAnchor="end">
						{n} {n === 1 ? 'CPU' : 'CPUs'}
					</text>
					{/* 1 CPU: f then 1-f */}
					<rect className={s.par} style={{ ['--c' as string]: color }} x={X0} y={row1} width={fw} height={16} />
					<rect className={s.ser} x={X0 + fw} y={row1} width={sw} height={16} />
					<text className={s.inLabel} x={X0 + fw / 2} y={row1 + 12} textAnchor="middle">
						{fw > 50 ? `f = ${pctLabel(f)}` : ''}
					</text>
					<text className={s.inLabelSer} x={X0 + fw + sw / 2} y={row1 + 12} textAnchor="middle">
						{sw > 40 ? '1−f' : ''}
					</text>
					<text className={s.timeLbl} x={X0 + TW} y={row1 - 6} textAnchor="end">
						time 1
					</text>

					{/* Guides from the end of f and the end of the run */}
					<line className={s.guide} x1={X0 + fw} y1={row1 + 16} x2={X0 + fwN} y2={row2} />
					<line className={s.guide} x1={X0 + TW} y1={row1 + 16} x2={X0 + fwN + sw} y2={row2 + BLOCK - lane} />

					{/* n CPUs: f/n on every core, then 1-f on one core */}
					<rect className={s.idle} x={X0} y={row2} width={TW} height={BLOCK} />
					<rect className={s.par} style={{ ['--c' as string]: color }} x={X0} y={row2} width={fwN} height={BLOCK} />
					{n > 1 &&
						n <= 16 &&
						Array.from({ length: n - 1 }, (_, i) => (
							<line key={i} className={s.laneLine} x1={X0} x2={X0 + fwN} y1={row2 + ((i + 1) * BLOCK) / n} y2={row2 + ((i + 1) * BLOCK) / n} />
						))}
					<rect className={s.ser} x={X0 + fwN} y={row2 + BLOCK - lane} width={sw} height={lane} />
					<rect className={s.saved} x={X0 + fwN + sw} y={row2 + BLOCK - lane} width={Math.max(0, TW - fwN - sw)} height={lane} />
					<text className={s.underLabel} x={X0 + fwN + sw / 2} y={row2 + BLOCK + 14} textAnchor="middle">
						{sw > 30 ? '1−f: one core' : ''}
					</text>
					<text className={s.idleLbl} x={X0 + fwN + Math.max(sw, 0) + 6} y={row2 + 14}>
						{TW - fwN > 90 && n > 1 ? `${n - 1} cores idle` : ''}
					</text>
					<text className={s.timeLblAcc} style={{ ['--c' as string]: color }} x={X0 + fwN + sw} y={row2 + BLOCK + 30} textAnchor={fwN + sw > TW * 0.75 ? 'end' : 'start'}>
						time {num(1 / S)}, so {num(S)}× faster
					</text>
				</svg>

				{/* Speedup vs cores */}
				<svg className={s.svg} width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Speedup against number of cores">
					{ticks.map((t) => (
						<g key={t}>
							<line className={s.gridLine} x1={L} x2={L + pw} y1={y(t)} y2={y(t)} />
							<text className={s.tick} x={L - 6} y={y(t) + 4} textAnchor="end">
								{t}
							</text>
							<text className={s.tick} x={x(t)} y={T + ph + 16} textAnchor="middle">
								{t}
							</text>
						</g>
					))}
					<text className={s.axisTitle} x={L + pw / 2} y={H - 4} textAnchor="middle">
						number of cores n
					</text>
					<text className={s.axisTitle} transform={`translate(11, ${T + ph / 2}) rotate(-90)`} textAnchor="middle">
						speedup
					</text>
					<line className={s.axisLine} x1={L} x2={L} y1={T} y2={T + ph} />
					<line className={s.axisLine} x1={L} x2={L + pw} y1={T + ph} y2={T + ph} />

					{/* Ideal */}
					<line className={s.ideal} x1={x(0)} y1={y(0)} x2={x(range)} y2={y(range)} />
					{/* Limit of the selected curve */}
					{limit <= range && (
						<g style={{ ['--c' as string]: color }}>
							<line className={s.limit} x1={L} x2={L + pw} y1={y(limit)} y2={y(limit)} />
							<text className={s.limitLbl} x={L + pw - 4} y={y(limit) - 5} textAnchor="end">
								limit {Math.round(limit)}×
							</text>
						</g>
					)}
					{/* n guide */}
					<line className={s.nGuide} x1={x(n)} x2={x(n)} y1={T} y2={T + ph} />
					{fractions.map((ff, i) => (
						<path key={ff} d={curve(ff)} className={i === fi ? s.curveOn : s.curve} style={{ ['--c' as string]: COLORS[i % COLORS.length] }} />
					))}
					{fractions.map((ff, i) => (
						<circle
							key={ff}
							cx={x(n)}
							cy={y(speedup(ff, n))}
							r={i === fi ? 6 : 3.5}
							className={i === fi ? s.ptOn : s.pt}
							style={{ ['--c' as string]: COLORS[i % COLORS.length] }}
						/>
					))}
					<rect className={s.hit} x={L} y={T} width={pw} height={ph} onPointerMove={pickN} onPointerDown={pickN} />
				</svg>
			</div>

			<div className={s.legend}>
				<span className={s.lg}>
					<span className={s.swPar} style={{ ['--c' as string]: color }} /> f: parallel part
				</span>
				<span className={s.lg}>
					<span className={s.swSer} /> 1−f: serial part
				</span>
				<span className={s.lg}>
					<span className={s.swSaved} /> time saved
				</span>
				<span className={s.lg}>
					<span className={s.swIdeal} /> ideal (speedup = n)
				</span>
				<span className={s.lg}>
					<span className={s.swLimit} style={{ ['--c' as string]: color }} /> limit 1/(1−f)
				</span>
			</div>
		</div>
	);
}
