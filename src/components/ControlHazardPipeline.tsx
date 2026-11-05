// Pipeline diagram (instructions down, cycles across) for hazards that the regular PipelineDiagram
// scheduler doesn't model: control hazards (stall on a branch, or guess not-taken and squash the
// wrong-path instructions into nops), structural hazards, and WAW hazards with multi-cycle units.
//
// A scenario is either computed from a branch (`branch: { policy, taken }` with the component's
// `program`, `branchIndex` and `targetIndex`), or given as explicit rows of cells.
import { useMemo, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './ControlHazardPipeline.module.css';

export interface PipeRow {
	label: string;
	/** Space-separated stage per cycle, starting at cycle 1; '.' = empty. A trailing '!' marks a cancelled stage (e.g. 'W!'). */
	cells: string;
	/** First cycle in which this row has been squashed into a nop. */
	squashAt?: number;
}

export interface PipeArrow {
	/** [row, cycle] of the producer and the consumer. */
	from: [number, number];
	to: [number, number];
	/** redirect: fetch from the resolved branch; ok / wrong: a value read correctly / incorrectly. */
	kind: 'redirect' | 'ok' | 'wrong';
}

export interface PipeScenario {
	label: string;
	rows?: PipeRow[];
	branch?: { policy: 'stall' | 'predict-not-taken'; taken: boolean };
	arrows?: PipeArrow[];
	/** Cells circled as a conflict (e.g. two instructions using the same memory port). */
	rings?: [number, number][];
	/** Step message, shown from that cycle on. */
	notes?: Record<number, string>;
	/** Cycles lost, shown as a meter from cycle `penaltyAt`. */
	penalty?: number;
	penaltyAt?: number;
	/** A value row under the diagram, e.g. which instruction's result a register holds. Space-separated
	 * per cycle; '.' = empty; a trailing '!' marks a wrong value, a trailing '~' the right one. */
	track?: { label: string; cells: string };
	/** Speculative region: rows [first, last], cycles [first, last], and the cycle it is resolved in. */
	spec?: { rows: [number, number]; cycles: [number, number]; resolvedAt: number; correct: boolean };
}

interface Props {
	/** Instructions for branch scenarios, in "op a, b -> c" form; a label like "targ:" may lead. */
	program?: string[];
	branchIndex?: number;
	targetIndex?: number;
	scenarios: PipeScenario[];
	/** Draw at least this many cycle columns. */
	minCycles?: number;
}

const COL = 40;
const ROW = 32;
const HEAD = 30;
const STAGES = ['F', 'D', 'X', 'M', 'W'];

const pretty = (t: string) => t.replace(/\s*->\s*/g, ' → ');

/** Rows, arrows, notes and penalty for a branch handled by stalling or by guessing not-taken. */
function branchScenario(sc: PipeScenario, program: string[], b: number, t: number): PipeScenario {
	const { policy, taken } = sc.branch!;
	const resolve = b + 3; // F in cycle b+1, D in b+2, X in b+3
	const seq = (i: number, start: number) => '. '.repeat(start - 1) + STAGES.join(' ');
	const rows: PipeRow[] = program.slice(0, b + 1).map((p, i) => ({ label: p, cells: seq(i, i + 1) }));
	const arrows: PipeArrow[] = [];
	const name = program[b].trim().split(/\s+/)[0];
	const outcome = taken ? 'taken' : 'not taken';
	const notes: Record<number, string> = { 1: 'Instructions enter the pipeline one per cycle.', [b + 1]: `${name} is fetched. Fetch can't tell it's a branch yet.` };
	let penalty = 0;
	let spec: PipeScenario['spec'];

	if (policy === 'stall') {
		const next = taken ? t : b + 1;
		rows.push({ label: program[next], cells: '. '.repeat(b + 1) + 'c* c* ' + STAGES.join(' ') });
		arrows.push({ from: [b, resolve], to: [rows.length - 1, resolve + 1], kind: 'redirect' });
		notes[b + 2] = `Decode sees a branch: stop fetching (c*).`;
		notes[resolve] = `X resolves the branch: ${outcome}.`;
		notes[resolve + 1] = 'Now fetch the right instruction. 2 cycles lost.';
		penalty = 2;
	} else if (!taken) {
		for (let i = b + 1; i <= t; i++) rows.push({ label: program[i], cells: seq(i, i + 1) });
		notes[b + 2] = 'Guess not-taken: keep fetching PC+4.';
		notes[resolve] = 'X resolves: not taken. The guess was right.';
		notes[resolve + 1] = 'Nothing to undo: 0 cycles lost.';
		spec = { rows: [b + 1, b + 2], cycles: [b + 2, resolve], resolvedAt: resolve + 1, correct: true };
	} else {
		for (let i = b + 1; i <= b + 2; i++) {
			const start = i + 1;
			const cells = Array.from({ length: start + 4 }, (_, k) => {
				const c = k + 1;
				if (c < start) return '.';
				return c <= resolve ? STAGES[c - start] : '-';
			});
			rows.push({ label: program[i], cells: cells.join(' '), squashAt: resolve + 1 });
		}
		rows.push({ label: program[t], cells: '. '.repeat(resolve) + STAGES.join(' ') });
		arrows.push({ from: [b, resolve], to: [rows.length - 1, resolve + 1], kind: 'redirect' });
		notes[b + 2] = 'Guess not-taken: keep fetching PC+4.';
		notes[resolve] = 'X resolves: taken. The guess was wrong.';
		notes[resolve + 1] = 'Squash the 2 wrong-path instructions into nops; fetch targ.';
		penalty = 2;
		spec = { rows: [b + 1, b + 2], cycles: [b + 2, resolve], resolvedAt: resolve + 1, correct: false };
	}
	return { ...sc, rows, arrows, notes: { ...notes, ...sc.notes }, penalty, penaltyAt: resolve + 1, spec };
}

const STALL_CLASS: Record<string, string> = { 'c*': 'cStall', 'd*': 'dStall', 'p*': 'pStall', 's*': 'sStall', 'w*': 'sStall' };

export default function ControlHazardPipeline({ program = [], branchIndex = 1, targetIndex = 4, scenarios, minCycles = 9 }: Props) {
	const [mode, setMode] = useState(0);
	const sc = useMemo(() => {
		const raw = scenarios[mode];
		return raw.branch ? branchScenario(raw, program, branchIndex, targetIndex) : raw;
	}, [mode, scenarios, program.join('|'), branchIndex, targetIndex]);

	const rows = (sc.rows ?? []).map((r) => ({ ...r, cells: r.cells.trim().split(/\s+/) }));
	const ncols = Math.max(minCycles, ...rows.map((r) => r.cells.length));
	const stepper = useStepper(ncols - 1, { intervalMs: 1300 });
	const current = stepper.step + 1;

	const labelW = Math.max(...rows.map((r) => pretty(r.label).length), sc.track ? sc.track.label.length : 0) * 7.6 + 20;
	const width = labelW + ncols * COL + 8;
	const track = sc.track ? sc.track.cells.trim().split(/\s+/) : null;
	const trackY = HEAD + rows.length * ROW + 8;
	const height = HEAD + rows.length * ROW + 6 + (track ? ROW + 6 : 0);
	const colX = (c: number) => labelW + (c - 1) * COL;
	const rowY = (j: number) => HEAD + j * ROW;

	const noteCycle = Math.max(0, ...Object.keys(sc.notes ?? {}).map(Number).filter((c) => c <= current));
	const message = sc.notes?.[noteCycle] ?? '';

	const used = new Set(rows.flatMap((r) => r.cells));
	const squashSeen = rows.some((r) => r.squashAt !== undefined && current >= r.squashAt);
	const spec = sc.spec;
	const specShown = spec && current >= spec.cycles[0];
	const specState = spec && current >= spec.resolvedAt ? (spec.correct ? 'specOk' : 'specBad') : 'specOpen';
	const penaltyShown = sc.penalty !== undefined && current >= (sc.penaltyAt ?? 1);

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`cycle ${current}`}>
				{scenarios.length > 1 ? (
					<div className={s.toggle} role="group" aria-label="Scenario">
						{scenarios.map((x, k) => (
							<button
								key={x.label}
								className={k === mode ? 'viz-primary' : undefined}
								aria-pressed={k === mode}
								onClick={() => {
									setMode(k);
									stepper.reset();
								}}
							>
								{x.label}
							</button>
						))}
					</div>
				) : undefined}
			</StepControls>

			<p className={s.message}>{message}</p>

			<div className={s.scroll}>
				<svg className={s.svg} viewBox={`0 0 ${width} ${height}`} style={{ minWidth: `${Math.min(width, 520)}px` }} role="img" aria-label="Pipeline diagram">
					<defs>
						{(['redirect', 'ok', 'wrong'] as const).map((k) => (
							<marker key={k} id={`chp-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
								<path d="M0,0 L10,5 L0,10 z" className={s[`head_${k}`]} />
							</marker>
						))}
					</defs>

					<rect className={s.now} x={colX(current)} y={2} width={COL} height={height - 4} rx={5} />

					{Array.from({ length: ncols }, (_, k) => (
						<text key={k} className={`${s.head} ${k + 1 === current ? s.headNow : ''}`} x={colX(k + 1) + COL / 2} y={19} textAnchor="middle">
							{k + 1}
						</text>
					))}
					<line className={s.axis} x1={labelW - 6} y1={HEAD - 2} x2={width} y2={HEAD - 2} />
					<line className={s.axis} x1={labelW - 6} y1={HEAD - 2} x2={labelW - 6} y2={height} />

					{/* Speculative region: open (dashed) until the branch resolves, then right (ok) or wrong. */}
					{spec && (
						<g className={`${s.spec} ${s[specState]} ${specShown ? '' : s.hidden}`}>
							<rect
								x={colX(spec.cycles[0]) + 1}
								y={rowY(spec.rows[0]) + 2}
								width={(spec.cycles[1] - spec.cycles[0] + 1) * COL - 2}
								height={(spec.rows[1] - spec.rows[0] + 1) * ROW - 4}
								rx={6}
							/>
						</g>
					)}

					{rows.map((r, j) => {
						const y = rowY(j);
						const squashed = r.squashAt !== undefined && current >= r.squashAt;
						const text = pretty(r.label);
						return (
							<g key={`${mode}-${j}`} className={squashed ? s.squashed : undefined}>
								<line className={s.grid} x1={labelW - 6} y1={y + ROW} x2={width} y2={y + ROW} />
								<text className={s.label} x={8} y={y + ROW / 2 + 4}>
									{text}
								</text>
								{r.squashAt !== undefined && (
									<line
										className={`${s.strike} ${squashed ? s.strikeOn : ''}`}
										x1={6}
										x2={text.length * 7.6 + 10}
										y1={y + ROW / 2}
										y2={y + ROW / 2}
										pathLength={1}
									/>
								)}
								{r.cells.map((cell, k) => {
									const c = k + 1;
									if (cell === '.' || c > current) return null;
									const cancelled = cell.endsWith('!');
									const txt = cancelled ? cell.slice(0, -1) : cell;
									const stall = STALL_CLASS[txt];
									const nop = txt === '-';
									const cls = [s.cell, stall && s[stall], nop && s.nop, cancelled && s.cancelled, c === current && !stall && !nop && s.cellNow].filter(Boolean).join(' ');
									return (
										<g key={c} className={s.pop}>
											{stall && <rect className={`${s.cellBg} ${s[`${stall}Bg`]}`} x={colX(c) + 3} y={y + 4} width={COL - 6} height={ROW - 8} rx={4} />}
											<text className={cls} x={colX(c) + COL / 2} y={y + ROW / 2 + 5} textAnchor="middle">
												{nop ? '–' : txt}
											</text>
											{cancelled && <line className={s.cancelLine} x1={colX(c) + 10} x2={colX(c) + COL - 10} y1={y + ROW / 2 + 5} y2={y + ROW / 2 - 6} />}
										</g>
									);
								})}
							</g>
						);
					})}

					{track && (
						<g>
							<line className={s.axis} x1={labelW - 6} y1={trackY - 4} x2={width} y2={trackY - 4} />
							<text className={s.trackLabel} x={8} y={trackY + ROW / 2 + 2}>
								{sc.track!.label}
							</text>
							{track.map((v, k) => {
								const c = k + 1;
								if (v === '.' || c > current) return null;
								const tone = v.endsWith('!') ? s.chipBad : v.endsWith('~') ? s.chipOk : s.chip;
								const txt = v.replace(/[!~]$/, '');
								const changed = k === 0 || track[k - 1] !== v;
								return (
									<g key={c} className={`${tone} ${changed ? s.pop : ''}`}>
										<rect x={colX(c) + 2} y={trackY + 4} width={COL - 4} height={ROW - 10} rx={4} />
										<text x={colX(c) + COL / 2} y={trackY + ROW / 2 + 2} textAnchor="middle">
											{txt}
										</text>
									</g>
								);
							})}
						</g>
					)}

					{(sc.rings ?? [])
						.filter(([, c]) => c <= current)
						.map(([j, c]) => (
							<circle key={`${j}-${c}`} className={s.ring} cx={colX(c) + COL / 2} cy={rowY(j) + ROW / 2} r={13} />
						))}

					{(sc.arrows ?? [])
						.filter((a) => a.to[1] <= current)
						.map((a, k) => {
							// From the end of the producing stage to the start of the consuming one.
							// Same cycle (written in the first half, read in the second): straight down.
							const same = a.from[1] === a.to[1];
							const x0 = same ? colX(a.from[1]) + 7 : colX(a.from[1]) + COL - 3;
							const y0 = rowY(a.from[0]) + ROW / 2 + (same ? 4 : 0);
							const x1 = same ? x0 : colX(a.to[1]) + 8;
							const y1 = rowY(a.to[0]) + ROW / 2 - (same ? 10 : 6);
							return (
								<g key={k} className={`${s.arrow} ${s[`arrow_${a.kind}`]}`}>
									<circle cx={x0} cy={y0} r={3} />
									<path d={`M${x0},${y0} L${x1},${y1}`} markerEnd={`url(#chp-${a.kind})`} />
								</g>
							);
						})}
				</svg>
			</div>

			{sc.penalty !== undefined && (
				<div className={`${s.penalty} ${penaltyShown ? '' : s.penaltyHidden}`} aria-live="polite">
					<span>Cycles lost</span>
					<span className={s.slots}>
						{Array.from({ length: Math.max(sc.penalty, 2) }, (_, k) => (
							<i key={k} className={penaltyShown && k < sc.penalty! ? s.slotLost : s.slotFree} />
						))}
					</span>
					<b className={sc.penalty ? s.lostNum : s.okNum}>{penaltyShown ? sc.penalty : '?'}</b>
				</div>
			)}

			<div className={s.legend}>
				{used.has('c*') && <span><i className={`${s.lg} ${s.lgC}`}>c*</i> control stall: waiting for the branch</span>}
				{used.has('s*') && <span><i className={`${s.lg} ${s.lgS}`}>s*</i> structural stall</span>}
				{used.has('w*') && <span><i className={`${s.lg} ${s.lgS}`}>w*</i> waiting to write back</span>}
				{used.has('d*') && <span><i className={`${s.lg} ${s.lgC}`}>d*</i> data stall</span>}
				{spec && <span><i className={`${s.lgBox} ${s.lgSpec}`} /> speculative: fetched on a guess</span>}
				{spec && <span><i className={`${s.lgBox} ${spec.correct ? s.lgSpecOk : s.lgSpecBad}`} /> {spec.correct ? 'guess verified: keep' : 'guess wrong: flush'}</span>}
				{(used.has('-') || squashSeen) && <span><i className={`${s.lg} ${s.lgNop}`}>–</i> squashed into a nop</span>}
				{rows.some((r) => r.cells.some((c) => c.endsWith('!'))) && <span><i className={`${s.lg} ${s.lgNop}`}>W</i> write cancelled</span>}
				{(sc.rings ?? []).length > 0 && <span><i className={s.lgRing} /> same resource, same cycle</span>}
				{track?.some((v) => v.endsWith('!')) && <span><i className={`${s.lg} ${s.lgBad}`}>f</i> wrong value</span>}
				{track?.some((v) => v.endsWith('~')) && <span><i className={`${s.lg} ${s.lgGood}`}>f</i> right value</span>}
				{(sc.arrows ?? []).some((a) => a.kind === 'redirect') && <span><i className={`${s.lgArrow} ${s.lgRedirect}`} /> fetch redirected by the resolved branch</span>}
				{(sc.arrows ?? []).some((a) => a.kind === 'ok') && <span><i className={`${s.lgArrow} ${s.lgOk}`} /> reads the right value</span>}
				{(sc.arrows ?? []).some((a) => a.kind === 'wrong') && <span><i className={`${s.lgArrow} ${s.lgWrong}`} /> reads the wrong value</span>}
			</div>
		</div>
	);
}
