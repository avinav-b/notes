// gprof-style sampling: one lane per function shows when it runs; a timer tick every N ms samples
// whichever function is running and credits it N ms. Sampled totals build up next to the true totals.
import { useEffect, useMemo, useRef, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './SamplingProfiler.module.css';

/** [function, start ms, end ms] */
type Seg = [string, number, number];

interface Props {
	functions?: string[];
	trace?: Seg[];
	intervals?: number[];
	interval?: number;
}

const DEFAULT_TRACE: Seg[] = [
	['main', 0, 4],
	['foo', 4, 47],
	['bar', 47, 53],
	['baz', 53, 57],
	['foo', 57, 96],
	['main', 96, 103],
	['bar', 103, 138],
	['baz', 138, 141],
	['foo', 141, 175],
	['bar', 175, 184],
	['main', 184, 200],
];

// Layout
const X0 = 72; // timeline start
const TOP = 34;
const LANE = 40;
const SERIES = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)', 'var(--viz-series-4)'];

export default function SamplingProfiler({ functions = ['main', 'foo', 'bar', 'baz'], trace = DEFAULT_TRACE, intervals = [20, 10, 5], interval = 10 }: Props) {
	const [iv, setIv] = useState(interval);
	const T = Math.max(...trace.map((g) => g[2]));
	const ticks = useMemo(() => Array.from({ length: Math.floor(T / iv) }, (_, i) => (i + 1) * iv), [T, iv]);
	// Function running at tick t: the segment with start < t <= end.
	const sampled = useMemo(() => ticks.map((t) => trace.find((g) => g[1] < t && t <= g[2])?.[0] ?? ''), [ticks, trace]);
	const last = ticks.length;
	const stepper = useStepper(last, { intervalMs: Math.max(280, iv * 70) });
	const step = Math.min(stepper.step, last);
	const now = step === 0 ? 0 : ticks[step - 1];

	// Narrow containers (phones): the histogram moves under the timeline.
	const ref = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 540));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const W = narrow ? 400 : 700;
	const X1 = narrow ? 388 : 476; // timeline end
	const HX = narrow ? X0 : 512; // histogram start
	const HW = narrow ? 250 : 150; // histogram width at the largest value
	const HTOP = narrow ? TOP + functions.length * LANE + 34 : TOP; // histogram top
	const histY = (fn: string) => HTOP + functions.indexOf(fn) * LANE;

	const px = (t: number) => X0 + (t / T) * (X1 - X0);
	const laneY = (fn: string) => TOP + functions.indexOf(fn) * LANE;
	const color = (fn: string) => SERIES[functions.indexOf(fn) % SERIES.length];

	const trueTotal = (fn: string, upTo: number) => trace.filter((g) => g[0] === fn).reduce((a, g) => a + Math.max(0, Math.min(g[2], upTo) - g[1]), 0);
	const sampleCount = (fn: string, k: number) => sampled.slice(0, k).filter((f) => f === fn).length;

	// Scale the histogram so every interval fits.
	const maxVal = useMemo(() => {
		let m = 0;
		for (const fn of functions) m = Math.max(m, trueTotal(fn, T));
		for (const v of intervals) {
			const ts = Array.from({ length: Math.floor(T / v) }, (_, i) => (i + 1) * v);
			for (const fn of functions) m = Math.max(m, ts.filter((t) => trace.find((g) => g[1] < t && t <= g[2])?.[0] === fn).length * v);
		}
		return m;
	}, [functions, trace, intervals, T]);
	const hx = (ms: number) => (ms / maxVal) * HW;

	// Calls that no tick ever landed in: the "missed" ones.
	const missed = trace.filter((g) => !ticks.some((t) => g[1] < t && t <= g[2]));
	const justMissed = missed.filter((g) => g[2] <= now && g[2] > now - iv);

	let message: string;
	if (step === 0) message = `Every ${iv} ms a timer interrupt checks which function is running.`;
	else if (step === last) message = 'Long-running functions come out close. Short calls are hit or miss.';
	else {
		const fn = sampled[step - 1];
		message = `${now} ms: ${fn} is running, so ${fn} gets +${iv} ms.`;
		if (justMissed.length) message += ` ${justMissed.map((g) => g[0]).join(', ')} ran ${justMissed.map((g) => g[2] - g[1]).join(', ')} ms unseen.`;
	}

	const laneH = LANE - 10;
	const H = HTOP + functions.length * LANE + 4;

	return (
		<div ref={ref} className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`${now} / ${T} ms`}>
				<div className={s.toggle} role="group" aria-label="Timer interval">
					<span className={s.toggleLbl}>Tick every</span>
					{intervals.map((v) => (
						<button
							key={v}
							className={`viz-btn ${v === iv ? s.on : ''}`}
							aria-pressed={v === iv}
							onClick={() => {
								setIv(v);
								stepper.reset();
							}}
						>
							{v} ms
						</button>
					))}
				</div>
			</StepControls>

			<p className={s.message}>{message}</p>

			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Function timeline with timer samples, and true versus sampled time per function">
				<defs>
					<clipPath id="sp-timeline">
						<rect x={X0} y={0} width={X1 - X0 + 1} height={H} />
					</clipPath>
				</defs>

				{/* Headers */}
				<text className={s.head} x={X0} y={14}>
					What is running
				</text>
				<text className={s.headSub} x={X1} y={14} textAnchor="end">
					{T} ms
				</text>
				<text className={s.head} x={HX} y={HTOP - 20}>
					Time per function
				</text>

				{/* Lanes */}
				{functions.map((fn) => {
					const y = laneY(fn);
					const hy = histY(fn);
					const tt = trueTotal(fn, now);
					const n = sampleCount(fn, step);
					return (
						<g key={fn}>
							<line className={s.laneLine} x1={X0} y1={y + laneH + 5} x2={X1} y2={y + laneH + 5} />
							<text className={s.fnName} x={X0 - 10} y={y + laneH / 2 + 5} textAnchor="end" style={{ fill: color(fn) }}>
								{fn}
							</text>

							{narrow && (
								<text className={s.fnName} x={X0 - 10} y={hy + laneH / 2 + 5} textAnchor="end" style={{ fill: color(fn) }}>
									{fn}
								</text>
							)}
							{/* Histogram: true time (outline) on top, sampled time (blocks) below */}
							<rect className={s.trueBar} x={HX} y={hy + 2} width={hx(tt)} height={laneH / 2 - 3} style={{ stroke: color(fn) }} />
							{Array.from({ length: n }, (_, b) => (
								<rect
									key={`${iv}-${b}`}
									className={s.block}
									x={HX + hx(b * iv)}
									y={hy + laneH / 2 + 1}
									width={Math.max(1, hx(iv) - 1)}
									height={laneH / 2 - 1}
									style={{ fill: color(fn) }}
								/>
							))}
							<text className={`${s.val} ${s.valTrue}`} x={HX + hx(tt) + 6} y={hy + laneH / 2 - 3}>
								{tt}
							</text>
							<text className={s.val} x={HX + hx(n * iv) + 6} y={hy + laneH - 1} style={{ fill: color(fn) }}>
								{n * iv}
							</text>
						</g>
					);
				})}

				{/* Trace segments */}
				<g clipPath="url(#sp-timeline)">
					{trace.map(([fn, a, b], i) => (
						<rect
							key={i}
							className={s.seg}
							x={px(a)}
							y={laneY(fn) + 3}
							width={px(b) - px(a)}
							height={laneH - 6}
							style={{ fill: color(fn), stroke: color(fn) }}
						/>
					))}
					{/* Future: dimmed until the program gets there */}
					<rect className={s.future} x={X0} y={TOP - 4} width={X1 - X0 + 2} height={functions.length * LANE + 4} style={{ transform: `translateX(${px(now) - X0}px)` }} />
				</g>

				{/* Timer ticks */}
				{ticks.map((t, i) => {
					const done = i < step;
					const cur = i === step - 1;
					const fn = sampled[i];
					const x = px(t);
					return (
						<g key={`${iv}-${t}`}>
							<line className={`${s.tick} ${done ? s.tickDone : ''} ${cur ? s.tickCur : ''}`} x1={x} y1={TOP - 6} x2={x} y2={TOP + functions.length * LANE - 6} />
							{done && fn && <circle className={`${s.dot} ${cur ? s.dotCur : ''}`} cx={x} cy={laneY(fn) + laneH / 2} r={cur ? 5.5 : 4} style={{ fill: color(fn) }} />}
						</g>
					);
				})}
			</svg>

			<div className={s.legend}>
				<span className={s.lgTick}>timer tick (sample)</span>
				<span className={s.lgTrue}>true time</span>
				<span className={s.lgSampled}>sampled time ({iv} ms per sample)</span>
			</div>
		</div>
	);
}
