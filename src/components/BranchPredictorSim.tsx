// Runs a stream of branch outcomes through a direction predictor and draws it like the lecture
// tables: one column per dynamic branch, the predictor's entries as rows (their state before that
// branch), the outcome underneath, and mispredictions marked. Predictors: a 1-bit or 2-bit counter
// indexed by PC (one entry for the one branch), or a table indexed by a branch history register (BHR).
import { useMemo, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import { FsmDiagram, nextState, type CounterState, type Outcome } from './CounterFsm';
import s from './BranchPredictorSim.module.css';

export interface PredictorKind {
	label: string;
	/** BHR length in bits; 0 = no history (the PC picks the entry). */
	history: number;
	/** Bits per entry: 1 = last outcome, 2 = saturating counter. */
	counter: 1 | 2;
}

interface Props {
	/** Outcome stream, e.g. "TTTN TTTN TTTN"; spaces split it into groups (outer-loop iterations). */
	outcomes?: string;
	modes?: PredictorKind[];
	/** Label for each group, followed by its number, e.g. "i = ". */
	groupLabel?: string;
}

interface BranchStep {
	entry: number;
	before: number[];
	after: number[];
	bhrBefore: string;
	pred: Outcome;
	outcome: Outcome;
	correct: boolean;
}

function simulate(outcomes: Outcome[], { history, counter }: PredictorKind): BranchStep[] {
	let table = Array<number>(2 ** history).fill(0);
	let bhr = 'N'.repeat(history);
	return outcomes.map((o) => {
		const entry = history ? parseInt(bhr.replace(/N/g, '0').replace(/T/g, '1'), 2) : 0;
		const v = table[entry];
		const pred: Outcome = (counter === 1 ? v === 1 : v >= 2) ? 'T' : 'N';
		const after = [...table];
		after[entry] = counter === 1 ? (o === 'T' ? 1 : 0) : nextState(v as CounterState, o);
		const step = { entry, before: table, after, bhrBefore: bhr, pred, outcome: o, correct: pred === o };
		table = after;
		bhr = history ? (bhr + o).slice(-history) : '';
		return step;
	});
}

const show = (v: number, counter: 1 | 2) => (counter === 1 ? (v ? 'T' : 'N') : 'NntT'[v]);
const pattern = (i: number, bits: number) => (bits ? i.toString(2).padStart(bits, '0').replace(/0/g, 'N').replace(/1/g, 'T') : '');

const COL = 40;
const ROW = 28;
const TOP = 34;

export default function BranchPredictorSim({
	outcomes = 'TTTN TTTN TTTN',
	modes = [
		{ label: '1-bit', history: 0, counter: 1 },
		{ label: '2-bit counter', history: 0, counter: 2 },
	],
	groupLabel = 'i = ',
}: Props) {
	const [mode, setMode] = useState(0);
	const kind = modes[mode];
	const groups = outcomes.trim().split(/\s+/);
	const stream = groups.join('').split('') as Outcome[];
	const n = stream.length;
	const groupStart = groups.map((_, g) => groups.slice(0, g).join('').length);
	const steps = useMemo(() => simulate(stream, kind), [outcomes, kind.history, kind.counter]);

	// Step 0: initial state. Then two steps per branch: predict, then the outcome arrives.
	const stepper = useStepper(2 * n, { intervalMs: 1100 });
	const st = stepper.step;
	const cur = st === 0 ? -1 : Math.ceil(st / 2) - 1; // branch being looked at
	const resolved = st === 0 ? 0 : st % 2 === 0 ? cur + 1 : cur; // branches whose outcome is known
	const phase: 'init' | 'predict' | 'outcome' = st === 0 ? 'init' : st % 2 ? 'predict' : 'outcome';

	const entries = 2 ** kind.history;
	const rowLabel = (e: number) => (kind.history ? `BHR=${pattern(e, kind.history)}` : 'state');
	const labelW = kind.history ? 30 + kind.history * 9 + 46 : 70;
	const width = labelW + n * COL + 6;
	const tableTop = TOP + 26;
	const outY = tableTop + entries * ROW + 6;
	const height = outY + ROW + 4;
	const colX = (k: number) => labelW + k * COL;

	const tableNow = resolved === 0 ? steps[0].before : steps[resolved - 1].after;
	const misses = steps.slice(0, resolved).filter((x) => !x.correct).length;

	let message = '';
	if (phase === 'init') message = kind.history ? `Every entry starts at N; the BHR starts at ${'N'.repeat(kind.history)}.` : `The ${kind.counter === 1 ? 'bit' : 'counter'} starts at N.`;
	else {
		const x = steps[cur];
		const who = kind.history ? `Entry ${pattern(x.entry, kind.history)}` : kind.counter === 1 ? 'The bit' : 'The counter';
		if (phase === 'predict') message = `Branch ${cur + 1}: ${who} predicts ${x.pred}.`;
		else if (x.correct) message = `Outcome ${x.outcome}: correct.`;
		else {
			const b = show(x.before[x.entry], kind.counter);
			const a = show(x.after[x.entry], kind.counter);
			message = `Outcome ${x.outcome}: mispredicted. ${kind.history ? `Entry ${pattern(x.entry, kind.history)}` : kind.counter === 1 ? 'Bit' : 'Counter'} ${b} → ${a}.`;
		}
	}

	// BHR bits keyed by the branch that shifted them in, so they slide left as new ones enter.
	const bhrBits = useMemo(() => {
		const hist = kind.history;
		if (!hist) return [];
		const done = phase === 'predict' ? cur : resolved;
		const all = [...Array.from({ length: hist }, (_, k) => ({ id: k - hist, v: 'N' as Outcome })), ...stream.slice(0, done).map((v, k) => ({ id: k, v }))];
		return all.slice(-hist);
	}, [kind.history, phase, cur, resolved]);

	const fsmEdge = kind.counter === 2 && !kind.history && phase === 'outcome' ? { from: steps[cur].before[0] as CounterState, o: steps[cur].outcome } : null;

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={cur >= 0 ? `branch ${cur + 1} / ${n}` : `branch 0 / ${n}`}>
				{modes.length > 1 ? (
					<div className={s.toggle} role="group" aria-label="Predictor">
						{modes.map((m, k) => (
							<button
								key={m.label}
								className={k === mode ? 'viz-primary' : undefined}
								aria-pressed={k === mode}
								onClick={() => {
									setMode(k);
									stepper.reset();
								}}
							>
								{m.label}
							</button>
						))}
					</div>
				) : undefined}
			</StepControls>

			<p className={s.message}>{message}</p>

			{kind.counter === 2 && !kind.history && (
				<div className={s.fsm}>
					<FsmDiagram state={tableNow[0] as CounterState} edge={fsmEdge} tick={st} />
				</div>
			)}

			<div className={s.scroll}>
				<svg className={s.svg} viewBox={`0 0 ${width} ${height}`} style={{ minWidth: `${Math.min(width, 540)}px` }} role="img" aria-label="Predictions and outcomes over time">
					{/* BHR register: bits shift in from the right */}
					{kind.history > 0 && (
						<g>
							<text className={s.regLabel} x={4} y={TOP - 6}>
								BHR
							</text>
							{Array.from({ length: kind.history }, (_, k) => (
								<rect key={k} className={s.regCell} x={34 + k * 18} y={TOP - 22} width={18} height={22} rx={3} />
							))}
							{bhrBits.map((b, k) => (
								<text key={b.id} className={`${s.regBit} ${b.id === resolved - 1 && phase === 'outcome' ? s.regNew : ''}`} x={0} y={TOP - 6} textAnchor="middle" style={{ transform: `translateX(${34 + k * 18 + 9}px)` }}>
									{b.v}
								</text>
							))}
							{/* Arrow from the BHR to the entry it selects */}
							{cur >= 0 && phase === 'predict' && (
								<path
									className={s.selArrow}
									d={`M${40},${TOP} V${TOP + 9} H${18} V${tableTop + steps[cur].entry * ROW + ROW / 2} H${26}`}
									markerEnd="url(#bps-sel)"
								/>
							)}
						</g>
					)}
					<defs>
						<marker id="bps-sel" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
							<path d="M0,0 L10,5 L0,10 z" className={s.selHead} />
						</marker>
					</defs>

					{/* Groups (outer-loop iterations) */}
					{groupStart.map((g0, g) => (
						<g key={g}>
							<text className={s.group} x={colX(g0) + (groups[g].length * COL) / 2} y={TOP - 8} textAnchor="middle">
								{groupLabel}
								{g}
							</text>
							{g > 0 && <line className={s.groupSep} x1={colX(g0)} x2={colX(g0)} y1={TOP - 4} y2={height} />}
						</g>
					))}

					{/* Current column */}
					{cur >= 0 && <rect className={s.now} x={colX(cur)} y={tableTop - 4} width={COL} height={height - tableTop + 2} rx={5} />}

					{/* Entry rows */}
					{Array.from({ length: entries }, (_, e) => {
						const y = tableTop + e * ROW;
						const sel = cur >= 0 && steps[cur].entry === e;
						return (
							<g key={e}>
								<text className={`${s.rowLabel} ${sel ? s.rowLabelSel : ''}`} x={kind.history ? 30 : 6} y={y + ROW / 2 + 4}>
									{rowLabel(e)}
								</text>
								<line className={s.grid} x1={labelW - 4} x2={width} y1={y + ROW} y2={y + ROW} />
								{steps.map((x, k) => {
									if (k > cur) return null;
									const used = x.entry === e;
									const known = k < resolved;
									const miss = used && known && !x.correct;
									const cx = colX(k) + COL / 2;
									return (
										<g key={k} className={s.pop}>
											{used && <rect className={`${s.usedBox} ${miss ? s.missBox : known ? s.hitBox : s.pendingBox}`} x={colX(k) + 4} y={y + 3} width={COL - 8} height={ROW - 6} rx={4} />}
											<text className={`${s.val} ${used ? s.valUsed : ''} ${miss ? s.valMiss : ''}`} x={cx} y={y + ROW / 2 + 5} textAnchor="middle">
												{show(x.before[e], kind.counter)}
											</text>
											{miss && (
												<text className={s.star} x={colX(k) + COL - 7} y={y + 12} textAnchor="middle">
													*
												</text>
											)}
										</g>
									);
								})}
							</g>
						);
					})}

					{/* Outcome row */}
					<line className={s.axis} x1={4} x2={width} y1={outY - 3} y2={outY - 3} />
					<text className={s.rowLabel} x={kind.history ? 30 : 6} y={outY + ROW / 2 + 4}>
						outcome
					</text>
					{steps.slice(0, resolved).map((x, k) => (
						<text key={k} className={`${s.out} ${s.pop}`} x={colX(k) + COL / 2} y={outY + ROW / 2 + 5} textAnchor="middle">
							{x.outcome}
						</text>
					))}
				</svg>
			</div>

			{/* Accuracy: one square per branch, grouped like the table */}
			<div className={s.meter}>
				<span className={s.meterLabel}>Mispredictions</span>
				<span className={s.squares}>
					{groups.map((grp, g) => (
						<span key={g} className={s.squareGroup}>
							{grp.split('').map((_, j) => {
								const k = groupStart[g] + j;
								const cls = k < resolved ? (steps[k].correct ? s.sqHit : s.sqMiss) : s.sqTodo;
								return <i key={j} className={cls} />;
							})}
						</span>
					))}
				</span>
				<b className={s.missCount}>
					{misses} / {resolved}
				</b>
			</div>

			<div className={s.legend}>
				<span>
					<i className={s.lgPending} /> entry used for this branch
				</span>
				<span>
					<i className={s.lgHit} /> correct
				</span>
				<span>
					<i className={s.lgMiss} /> mispredicted (*)
				</span>
				{kind.counter === 2 && <span>N n t T = strong N, weak N, weak T, strong T</span>}
			</div>
		</div>
	);
}
