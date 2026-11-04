// The vprod multiply tree, drawn against time (ECE454 program optimizations).
// One row per multiply in program order; each bar spans the cycles it is in the multiplier and fills
// like a progress bar. A serial chain is a long staircase; breaking the chain lets bars overlap.
// The schedule comes from the shared list scheduler, so the totals and CPE are computed.
import { useEffect, useMemo, useRef, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import { listSchedule, type SchedOp } from './listSchedule';
import s from './ReductionTree.module.css';

export type ProdVariant = 'serial' | 'leftPairs' | 'reassoc' | 'twoAcc';

interface Props {
	variants?: ProdVariant[];
	/** Number of elements multiplied. */
	n?: number;
	/** Multiply latency in cycles. */
	latency?: number;
	/** Multiplies that can start per cycle (default: unlimited units). */
	issue?: number;
}

interface MulOp extends SchedOp {
	label: string;
}

const INFO: Record<ProdVariant, { name: string; short?: string; code: string; caption: string }> = {
	serial: { name: 'Serial', code: 'x = x * data[i];', caption: 'Each multiply waits for the one before it.' },
	leftPairs: { name: '(x*a)*b', code: 'x = (x * data[i]) * data[i+1];', caption: 'Still one chain: both multiplies need x.' },
	reassoc: { name: 'x*(a*b)', code: 'x = x * (data[i] * data[i+1]);', caption: 'data[i] * data[i+1] does not need x, so it runs early.' },
	twoAcc: { name: 'Two accumulators', short: 'x0, x1', code: 'x0 *= data[i];  x1 *= data[i+1];', caption: 'Two independent chains, combined at the end.' },
};

function buildOps(v: ProdVariant, n: number, lat: number): MulOp[] {
	const ops: MulOp[] = [];
	const add = (label: string, deps: number[]) => {
		ops.push({ kind: 'mul', lat, deps, label });
		return ops.length - 1;
	};
	if (v === 'serial' || v === 'leftPairs') {
		let x = -1;
		for (let k = 0; k < n; k++) x = add(`${x < 0 ? '1' : 'x'}·d${k}`, x < 0 ? [] : [x]);
	} else if (v === 'reassoc') {
		let x = -1;
		for (let k = 0; k + 1 < n; k += 2) {
			const t = add(`d${k}·d${k + 1}`, []);
			x = add(`${x < 0 ? '1' : 'x'}·(d${k}·d${k + 1})`, x < 0 ? [t] : [x, t]);
		}
	} else {
		let a = -1;
		let b = -1;
		for (let k = 0; k + 1 < n; k += 2) {
			a = add(`${a < 0 ? '1' : 'x0'}·d${k}`, a < 0 ? [] : [a]);
			b = add(`${b < 0 ? '1' : 'x1'}·d${k + 1}`, b < 0 ? [] : [b]);
		}
		add('x0·x1', [a, b]);
	}
	return ops;
}

function schedule(v: ProdVariant, n: number, lat: number, issue: number) {
	const ops = buildOps(v, n, lat);
	const pl = listSchedule(ops, [{ name: 'mul', accepts: ['mul'], count: issue }]);
	const total = Math.max(...pl.map((p) => p.end));
	// Zero-slack ops form the critical path.
	const latestEnd = ops.map(() => total);
	for (let k = ops.length - 1; k >= 0; k--)
		for (const d of ops[k].deps) latestEnd[d] = Math.min(latestEnd[d], latestEnd[k] - ops[k].lat);
	const critical = pl.map((p, k) => latestEnd[k] === p.end);
	return { ops, pl, total, critical };
}

// ---- layout ----
// Wide: drawn for the ~45rem column. Narrow (phones): a smaller drawing, so it scales down less.
const WIDE = { LABEL_W: 112, PLOT_W: 560 };
const NARROW = { LABEL_W: 86, PLOT_W: 300 };
const ROW = 19;
const AXIS_H = 24;
const CMP_ROW = 22;

export default function ReductionTree({ variants = ['serial', 'leftPairs', 'reassoc', 'twoAcc'], n = 12, latency = 4, issue = Infinity }: Props) {
	const [vi, setVi] = useState(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = rootRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const { LABEL_W, PLOT_W } = narrow ? NARROW : WIDE;
	const v = variants[Math.min(vi, variants.length - 1)];

	const all = useMemo(
		() =>
			variants.map((x) => {
				const sch = schedule(x, n, latency, issue);
				// Steady-state cycles per element: compare a run twice as long.
				const long = schedule(x, 2 * n, latency, issue);
				return { ...sch, cpe: (long.total - sch.total) / n };
			}),
		[variants.join('|'), n, latency, issue],
	);
	const cur = all[Math.min(vi, all.length - 1)];
	const maxTotal = Math.max(...all.map((a) => a.total));
	const unit = PLOT_W / (maxTotal + 1);
	const X = (cycle: number) => LABEL_W + cycle * unit; // x of the end of `cycle` (0 = start)

	const stepper = useStepper(cur.total, { intervalMs: 380 });
	const step = stepper.step;

	const rowsH = cur.ops.length * ROW;
	const plotTop = AXIS_H;
	const cmpTop = plotTop + Math.max(...all.map((a) => a.ops.length)) * ROW + 26;
	const H = cmpTop + all.length * CMP_ROW + 6;
	const W = LABEL_W + PLOT_W + 12;
	const rowY = (k: number) => plotTop + k * ROW;

	const tickEvery = maxTotal > 30 ? (narrow ? 8 : 4) : 2;
	const inFlight = cur.pl.filter((p) => p.start <= step && p.end > step).length;

	return (
		<div ref={rootRef} className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`cycle ${step}`}>
				{variants.length > 1 &&
					variants.map((x, i) => (
						<button
							key={x}
							className={i === vi ? s.modeOn : undefined}
							aria-pressed={i === vi}
							onClick={() => {
								setVi(i);
								stepper.reset();
							}}
						>
							{INFO[x].name}
						</button>
					))}
			</StepControls>

			<div className={s.top}>
				<div className={s.caption}>
					<code className={s.code}>{INFO[v].code}</code>
					<span>{INFO[v].caption}</span>
				</div>
				<div className={s.readout}>
					<span className={s.rLabel}>CPE</span>
					<span className={s.rValue}>{cur.cpe.toFixed(0)}</span>
					<span className={s.rSub}>{inFlight} in flight</span>
				</div>
			</div>

			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Multiply schedule, ${INFO[v].name}: ${cur.total} cycles`}>
				{/* time axis */}
				{Array.from({ length: Math.floor(maxTotal / tickEvery) + 1 }, (_, i) => i * tickEvery).map((c) => (
					<g key={c}>
						<line className={s.grid} x1={X(c)} x2={X(c)} y1={AXIS_H - 6} y2={cmpTop - 14} />
						<text className={s.tick} x={X(c)} y={12} textAnchor="middle">
							{c}
						</text>
					</g>
				))}
				<text className={s.axisName} x={LABEL_W - 8} y={12} textAnchor="end">
					cycle
				</text>

				{/* finish line */}
				<line className={s.finish} x1={X(cur.total)} x2={X(cur.total)} y1={AXIS_H - 6} y2={plotTop + rowsH + 4} />

				{/* edges: from the end of a producer to the start of its consumer */}
				{cur.ops.map((op, k) =>
					op.deps.map((d) => {
						const p = cur.pl[d];
						const c = cur.pl[k];
						const crit = cur.critical[d] && cur.critical[k] && p.end + 1 === c.start;
						const x1 = X(p.end);
						const y1 = rowY(d) + ROW / 2;
						const x2 = X(c.start - 1) + 4;
						const y2 = rowY(k) + 3;
						return (
							<path
								key={`${d}-${k}`}
								className={`${s.edge} ${crit ? s.edgeCrit : ''} ${p.end <= step ? s.edgeReady : ''}`}
								d={`M${x1},${y1} H${x2} V${y2}`}
							/>
						);
					}),
				)}

				{/* multiplies */}
				{cur.ops.map((op, k) => {
					const p = cur.pl[k];
					const x = X(p.start - 1);
					const w = X(p.end) - x;
					const frac = Math.max(0, Math.min(1, (step - (p.start - 1)) / op.lat));
					const state = p.end <= step ? s.done : p.start <= step ? s.running : s.waiting;
					return (
						<g key={k} className={`${s.mul} ${state} ${cur.critical[k] ? s.crit : ''}`}>
							<text className={s.label} x={LABEL_W - 8} y={rowY(k) + ROW / 2 + 4} textAnchor="end">
								{op.label}
							</text>
							<rect className={s.box} x={x + 1} y={rowY(k) + 3} width={w - 2} height={ROW - 6} rx={3} />
							<rect className={s.fill} x={x + 1} y={rowY(k) + 3} width={Math.max(0, (w - 2) * frac)} height={ROW - 6} rx={3} />
						</g>
					);
				})}

				{/* current time */}
				{step > 0 && <line className={s.now} x1={X(step)} x2={X(step)} y1={AXIS_H - 6} y2={plotTop + rowsH + 4} />}

				{/* totals, same time scale */}
				<text className={s.cmpTitle} x={2} y={cmpTop - 4}>
					total cycles
				</text>
				{all.map((a, i) => {
					const y = cmpTop + i * CMP_ROW;
					const isCur = i === vi;
					const len = isCur ? Math.min(step, a.total) : a.total;
					return (
						<g key={variants[i]} className={isCur ? s.cmpCur : s.cmp}>
							<text className={s.cmpLabel} x={LABEL_W - 8} y={y + 14} textAnchor="end">
								{narrow ? (INFO[variants[i]].short ?? INFO[variants[i]].name) : INFO[variants[i]].name}
							</text>
							{isCur && <rect className={s.cmpGhost} x={X(0)} y={y + 3} width={X(a.total) - X(0)} height={CMP_ROW - 7} rx={3} />}
							<rect className={s.cmpBar} x={X(0)} y={y + 3} width={Math.max(0, X(len) - X(0))} height={CMP_ROW - 7} rx={3} />
							<text className={s.cmpValue} x={X(isCur ? Math.max(len, 0) : a.total) + 6} y={y + 14}>
								{isCur ? (step >= a.total ? `${a.total}` : `${len}`) : a.total}
							</text>
						</g>
					);
				})}
			</svg>

			<div className={s.legend}>
				<span className={s.lgWait}>waiting for input</span>
				<span className={s.lgRun}>multiplying ({latency} cycles)</span>
				<span className={s.lgDone}>result ready</span>
				<span className={s.lgCrit}>critical path</span>
			</div>
		</div>
	);
}
