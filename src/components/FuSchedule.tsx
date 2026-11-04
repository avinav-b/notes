// Cycle-by-cycle functional-unit schedule of the vsum loop (ECE454 program optimizations).
// Rows are functional units, columns are cycles. Each op is a block as long as its latency, coloured
// by loop iteration. The schedule comes from a list scheduler over the loop's dependency graph, so
// the CPE readout is computed by the model, not typed in.
import { useEffect, useMemo, useRef, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import { listSchedule, type Placed, type SchedOp, type UnitDef } from './listSchedule';
import s from './FuSchedule.module.css';

export interface FuMode {
	label: string;
	/** Elements summed per loop iteration (1 = vsum4, 3 = vsum5). */
	unroll: number;
	/** 'unlimited': as many units as needed; 'assumed': 1 load unit, 2 integer units (one does branches). */
	resources: 'unlimited' | 'assumed';
	/** Measured CPE from the slides, shown next to the model's number. */
	measured?: number;
	/** One short line shown above the figure. */
	caption?: string;
}

interface Props {
	modes?: FuMode[];
	/** Cycles drawn on wide screens (narrow screens draw fewer). */
	cycles?: number;
	/** Load latency in cycles. */
	loadLatency?: number;
}

interface LoopOp extends SchedOp {
	iter: number;
	name: string;
	asm: string;
	/** For the adds into sum: which element (0-based) this add accumulates. */
	elem?: number;
}

/** The dynamic op stream of `iters` iterations of the (possibly unrolled) vsum loop. */
function buildLoop(unroll: number, iters: number, loadLat: number): LoopOp[] {
	const ops: LoopOp[] = [];
	let prevIdx = -1; // op that produced the current %edx (i)
	let prevSum = -1; // op that produced the current %ecx (sum)
	for (let it = 0; it < iters; it++) {
		const loads: number[] = [];
		for (let k = 0; k < unroll; k++) {
			loads.push(ops.length);
			const off = k ? `+${k}` : '';
			ops.push({ kind: 'load', lat: loadLat, deps: prevIdx >= 0 ? [prevIdx] : [], iter: it, name: 'load', asm: `load data[i${off}]` });
		}
		for (let k = 0; k < unroll; k++) {
			const off = k ? `+${k}` : '';
			const deps = [loads[k], ...(prevSum >= 0 ? [prevSum] : [])];
			prevSum = ops.length;
			ops.push({ kind: 'int', lat: 1, deps, iter: it, name: 'addl', asm: `addl: sum += data[i${off}]`, elem: it * unroll + k });
		}
		const inc = ops.length;
		const incName = unroll === 1 ? 'incl' : `i+=${unroll}`;
		ops.push({ kind: 'int', lat: 1, deps: prevIdx >= 0 ? [prevIdx] : [], iter: it, name: incName, asm: unroll === 1 ? 'incl: i++' : `addl: i += ${unroll}` });
		const cmp = ops.length;
		ops.push({ kind: 'int', lat: 1, deps: [inc], iter: it, name: 'cmpl', asm: 'cmpl: compare i, limit' });
		ops.push({ kind: 'branch', lat: 1, deps: [cmp], iter: it, name: 'jl', asm: 'jl: loop again if i < limit' });
		prevIdx = inc;
	}
	return ops;
}
function unitsFor(resources: FuMode['resources']): UnitDef[] {
	if (resources === 'unlimited')
		return [
			{ name: 'Load', accepts: ['load'], count: Infinity },
			{ name: 'Int', accepts: ['int', 'branch'], count: Infinity },
		];
	return [
		{ name: 'Load', accepts: ['load'] },
		{ name: 'Int 1', accepts: ['int', 'branch'] },
		{ name: 'Int 2', accepts: ['int'] },
	];
}

/** Steady-state cycles per element: slope of the sum chain over a long run. */
function steadyCpe(mode: FuMode, loadLat: number) {
	const iters = Math.ceil(240 / mode.unroll);
	const ops = buildLoop(mode.unroll, iters, loadLat);
	const pl = listSchedule(ops, unitsFor(mode.resources));
	const ends = ops.flatMap((o, k) => (o.elem !== undefined ? [pl[k].end] : []));
	const a = Math.floor(ends.length / 2);
	const b = ends.length - 1;
	return (ends[b] - ends[a]) / (b - a);
}

const DEFAULT_MODES: FuMode[] = [
	{ label: 'Unlimited units', unroll: 1, resources: 'unlimited' },
	{ label: 'Assumed CPU', unroll: 1, resources: 'assumed', measured: 2.0 },
	{ label: 'Unroll ×2', unroll: 2, resources: 'assumed', measured: 1.5 },
	{ label: 'Unroll ×3', unroll: 3, resources: 'assumed', measured: 1.33 },
];

// ---- layout ----
const COL = 40;
const HEAD_H = 22;
const LANE_H = 17; // one in-flight load
const ROW_H = 26; // an integer unit
const GAP = 6;

interface Row {
	label: string;
	sub?: string;
	unit: number;
	copy: number; // for integer rows; -1 for the load row
	y: number;
	h: number;
	lanes: number;
}

export default function FuSchedule({ modes = DEFAULT_MODES, cycles = 14, loadLatency = 3 }: Props) {
	const [modeIdx, setModeIdx] = useState(0);
	const mode = modes[Math.min(modeIdx, modes.length - 1)];
	const [focus, setFocus] = useState<number | null>(null);

	// Fewer columns on narrow screens so the text stays readable.
	const rootRef = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = rootRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const C = narrow ? Math.min(cycles, 8) : cycles;
	const LABEL_W = narrow ? 58 : 62;
	const UTIL_W = narrow ? 50 : 66;

	const model = useMemo(() => {
		const units = unitsFor(mode.resources);
		const ops = buildLoop(mode.unroll, cycles + 6, loadLatency);
		const pl = listSchedule(ops, units);
		return { units, ops, pl, cpe: steadyCpe(mode, loadLatency) };
	}, [mode, cycles, loadLatency]);

	const stepper = useStepper(C, { intervalMs: 1100 });
	const step = stepper.step;
	useEffect(() => setFocus(null), [modeIdx]);

	const { units, ops, pl, cpe } = model;
	const shown = ops.map((_, k) => k).filter((k) => pl[k].start <= C);

	// Load lanes: stack loads that are in flight at the same time.
	const loadLane = new Map<number, number>();
	const laneEnd: number[] = [];
	for (const k of shown) {
		if (ops[k].kind !== 'load') continue;
		let lane = laneEnd.findIndex((e) => e < pl[k].start);
		if (lane < 0) lane = laneEnd.length;
		laneEnd[lane] = pl[k].end;
		loadLane.set(k, lane);
	}
	const loadLanes = Math.max(loadLatency, laneEnd.length);

	// Rows: the load unit, then one row per integer unit (or per lane needed, if unlimited).
	const intCopies =
		mode.resources === 'unlimited'
			? Math.max(1, ...shown.filter((k) => ops[k].kind !== 'load').map((k) => pl[k].copy + 1))
			: 2;
	const rows: Row[] = [];
	let y = HEAD_H + 4;
	rows.push({ label: 'Load', sub: 'pipelined', unit: 0, copy: -1, y, h: loadLanes * LANE_H, lanes: loadLanes });
	y += loadLanes * LANE_H + GAP;
	for (let c = 0; c < intCopies; c++) {
		const unit = mode.resources === 'unlimited' ? 1 : 1 + c;
		rows.push({ label: `Int ${c + 1}`, sub: mode.resources === 'assumed' && c === 0 ? '+ branch' : undefined, unit, copy: c, y, h: ROW_H, lanes: 1 });
		y += ROW_H + GAP;
	}
	const sumY = y + 4;
	const H = sumY + 30;
	const plotW = C * COL;
	const W = LABEL_W + plotW + UTIL_W;
	const cx = (cycle: number) => LABEL_W + (cycle - 1) * COL; // left edge of a cycle column

	const blockRect = (k: number) => {
		const p = pl[k];
		const x = cx(p.start) + 2;
		const w = Math.min(p.end, C) - p.start + 1;
		if (ops[k].kind === 'load') {
			const r = rows[0];
			return { x, y: r.y + loadLane.get(k)! * LANE_H + 1.5, w: w * COL - 4, h: LANE_H - 3 };
		}
		const r = rows.find((rr) => rr.copy >= 0 && (mode.resources === 'unlimited' ? rr.copy === p.copy : rr.unit === p.unit))!;
		return { x, y: r.y + 2, w: w * COL - 4, h: ROW_H - 4 };
	};

	// Steady-state busy fraction of each row (issue slots used per cycle).
	const util = useMemo(() => {
		const iters = Math.ceil(240 / mode.unroll);
		const lops = buildLoop(mode.unroll, iters, loadLatency);
		const lpl = listSchedule(lops, units);
		const lo = Math.floor(lpl[Math.floor(lops.length / 3)].start);
		const hi = Math.floor(lpl[Math.floor((2 * lops.length) / 3)].start);
		const span = hi - lo;
		const count = (pred: (k: number) => boolean) => {
			let n = 0;
			lops.forEach((_, k) => {
				if (lpl[k].start >= lo && lpl[k].start < hi && pred(k)) n++;
			});
			return n / span;
		};
		return rows.map((r) =>
			r.copy < 0
				? count((k) => lops[k].kind === 'load')
				: mode.resources === 'unlimited'
					? count((k) => lops[k].kind !== 'load' && lpl[k].copy === r.copy)
					: count((k) => lpl[k].unit === r.unit),
		);
	}, [mode, loadLatency, rows.length]);

	const sumEnds = shown.filter((k) => ops[k].elem !== undefined && pl[k].end <= C);
	const doneNow = sumEnds.filter((k) => pl[k].end <= step).length;

	const focusOp = focus !== null && shown.includes(focus) && pl[focus].start <= step ? focus : null;
	const related = new Set<number>(focusOp !== null ? ops[focusOp].deps : []);

	const fmt = (x: number) => x.toFixed(2);
	// Busy meters only mean something when the number of units is limited.
	const meters = mode.resources === 'assumed';

	return (
		<div ref={rootRef} className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`cycle ${step} / ${C}`}>
				{modes.length > 1 &&
					modes.map((m, i) => (
						<button
							key={m.label}
							className={i === modeIdx ? s.modeOn : undefined}
							aria-pressed={i === modeIdx}
							onClick={() => {
								setModeIdx(i);
								stepper.reset();
							}}
						>
							{m.label}
						</button>
					))}
			</StepControls>

			<div className={s.top}>
				<p className={s.caption}>{mode.caption ?? ''}</p>
				<div className={s.readout} aria-label={`model CPE ${fmt(cpe)}`}>
					<span className={s.cpeLabel}>CPE</span>
					<span className={s.cpe}>{fmt(cpe)}</span>
					{mode.measured !== undefined && <span className={s.measured}>measured {fmt(mode.measured)}</span>}
				</div>
			</div>

			<svg className={`${s.svg} ${narrow ? s.narrow : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Schedule of the vsum loop, ${mode.label}`}>
				{/* current cycle column */}
				{step > 0 && <rect className={s.now} x={cx(step)} y={HEAD_H - 2} width={COL} height={H - HEAD_H} rx={3} />}
				{Array.from({ length: C }, (_, i) => (
					<text key={i} className={`${s.head} ${i + 1 === step ? s.headNow : ''}`} x={cx(i + 1) + COL / 2} y={15} textAnchor="middle">
						{i + 1}
					</text>
				))}
				{Array.from({ length: C + 1 }, (_, i) => (
					<line key={i} className={s.grid} x1={cx(i + 1)} x2={cx(i + 1)} y1={HEAD_H} y2={H - 4} />
				))}
				{meters && (
					<text className={s.util} x={LABEL_W + plotW + UTIL_W / 2 + 4} y={15} textAnchor="middle">
						busy
					</text>
				)}

				{rows.map((r, ri) => {
					const u = util[ri] ?? 0;
					const full = mode.resources === 'assumed' && u > 0.99;
					const bx = LABEL_W + plotW + 8;
					const bw = UTIL_W - 12;
					return (
						<g key={ri}>
							<rect className={s.rowBg} x={LABEL_W} y={r.y} width={plotW} height={r.h} />
							<text className={s.rowLabel} x={LABEL_W - 8} y={r.y + r.h / 2 + (r.sub ? -1 : 4)} textAnchor="end">
								{r.label}
							</text>
							{r.sub && (
								<text className={s.rowSub} x={LABEL_W - 8} y={r.y + r.h / 2 + 11} textAnchor="end">
									{r.sub}
								</text>
							)}
							{meters && (
								<>
									<rect className={s.meterBg} x={bx} y={r.y + r.h / 2 - 6} width={bw} height={12} rx={3} />
									<rect
										className={`${s.meter} ${full ? s.meterFull : ''}`}
										x={bx}
										y={r.y + r.h / 2 - 6}
										width={bw * Math.min(1, u)}
										height={12}
										rx={3}
									/>
									<text className={s.meterText} x={bx + bw / 2} y={r.y + r.h / 2 + 4} textAnchor="middle">
										{Math.round(u * 100)}%
									</text>
								</>
							)}
						</g>
					);
				})}

				{/* the sum: one dot per element added */}
				<text className={s.rowLabel} x={LABEL_W - 8} y={sumY + 15} textAnchor="end">
					sum
				</text>
				{sumEnds.map((k) => {
					const p = pl[k];
					const on = p.end <= step;
					return (
						<g key={k} className={`${s.dot} ${on ? s.dotOn : ''}`} style={{ ['--it' as string]: `var(--viz-series-${(ops[k].iter % 4) + 1})` }}>
							<circle cx={cx(p.end) + COL / 2} cy={sumY + 11} r={9} />
							<text x={cx(p.end) + COL / 2} y={sumY + 15} textAnchor="middle">
								{ops[k].elem}
							</text>
						</g>
					);
				})}

				{/* ops */}
				{shown.map((k) => {
					const p = pl[k];
					const r = blockRect(k);
					const started = p.start <= step;
					const frac = started ? Math.min(1, (step - p.start + 1) / (Math.min(p.end, C) - p.start + 1)) : 0;
					const done = p.end <= step;
					const isFocus = focusOp === k;
					const isDep = related.has(k);
					return (
						<g
							key={k}
							className={`${s.op} ${started ? s.opOn : ''} ${done ? s.opDone : ''} ${isFocus ? s.opFocus : ''} ${isDep ? s.opDep : ''}`}
							style={{ ['--it' as string]: `var(--viz-series-${(ops[k].iter % 4) + 1})` }}
							onMouseEnter={() => setFocus(k)}
							onMouseLeave={() => setFocus(null)}
							onClick={() => setFocus(k)}
						>
							<rect className={s.opBox} x={r.x} y={r.y} width={r.w} height={r.h} rx={4} />
							<rect className={s.opFill} x={r.x} y={r.y} width={r.w * frac} height={r.h} rx={4} />
							<text className={s.opText} x={r.x + Math.min(r.w, COL - 4) / 2} y={r.y + r.h / 2 + 3.8} textAnchor="middle">
								{ops[k].name}
							</text>
						</g>
					);
				})}

				{/* dependency arrows for the focused op */}
				{focusOp !== null &&
					ops[focusOp].deps
						.filter((d) => shown.includes(d))
						.map((d) => {
							const a = blockRect(d);
							const b = blockRect(focusOp);
							const x1 = a.x + a.w;
							const y1 = a.y + a.h / 2;
							const x2 = b.x;
							const y2 = b.y + b.h / 2;
							const mx = (x1 + x2) / 2;
							return (
								<path key={d} className={s.arrow} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}`} markerEnd="url(#fu-head)" />
							);
						})}
				<defs>
					<marker id="fu-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.arrowHead} />
					</marker>
				</defs>
			</svg>

			<div className={s.detail}>
				{focusOp !== null ? (
					<>
						<span className={s.mono}>{ops[focusOp].asm}</span> (iteration {ops[focusOp].iter + 1}),{' '}
						{pl[focusOp].end > pl[focusOp].start ? `cycles ${pl[focusOp].start}-${pl[focusOp].end}` : `cycle ${pl[focusOp].start}`}
					</>
				) : (
					<>
						{doneNow} element{doneNow === 1 ? '' : 's'} summed in {step} cycle{step === 1 ? '' : 's'}. Hover or tap a block to see what it waits for.
					</>
				)}
			</div>

			<div className={s.legend}>
				<span className={s.lgIter}>
					{[1, 2, 3, 4].map((i) => (
						<i key={i} style={{ background: `var(--viz-series-${i})` }} />
					))}
					colour = loop iteration
				</span>
				<span>block length = latency</span>
				<span className={s.lgDot}>element added to sum</span>
				{mode.resources === 'assumed' && <span className={s.lgFull}>unit busy every cycle</span>}
				<span className={s.lgArrow}>waits for</span>
			</div>
		</div>
	);
}
