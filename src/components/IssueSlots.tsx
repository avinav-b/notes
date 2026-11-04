// Issue-slot grid: rows are cycles (time runs down), columns are issue slots (the issue width).
// Each numbered circle is one instruction, coloured by the application/thread it belongs to.
// Stepping through the modes slides the same instructions into tighter (or wider) packings, so
// the viewer sees total time shrink and empty (wasted) slots appear or get filled.
import { useId } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './IssueSlots.module.css';

export interface SlotMode {
	label: string;
	/** Issue width (number of slot columns). */
	width: number;
	/** One entry per cycle: the instructions issued that cycle, e.g. ['a1', 'a2', 'b1'] (a = app 1, b = app 2). */
	rows: string[][];
	/** Draw a context-switch line after this many cycles. */
	switchAfter?: number;
	note?: string;
}

interface Props {
	modes: SlotMode[];
	/** Legend names for the two applications. */
	apps?: [string, string];
}

const CELL = 34;
const ARROW = 50;
const HEAD = 24;
const R = 12.5;

export default function IssueSlots({ modes, apps = ['Application 1', 'Application 2'] }: Props) {
	const stepper = useStepper(modes.length - 1, { intervalMs: 2200 });
	const mode = modes[stepper.step];
	const pid = useId().replace(/:/g, '');

	const maxW = Math.max(...modes.map((m) => m.width));
	const maxRows = Math.max(...modes.map((m) => m.rows.length));
	const W = ARROW + maxW * CELL + 4;
	const H = HEAD + maxRows * CELL + 30;

	// Position of every instruction in the current mode; instructions not in this mode keep the
	// position they have in the first mode that uses them, and fade out.
	const ids: string[] = [];
	const where = (m: SlotMode) => {
		const pos = new Map<string, [number, number]>();
		m.rows.forEach((r, ri) => r.forEach((id, ci) => pos.set(id, [ri, ci])));
		return pos;
	};
	for (const m of modes) for (const r of m.rows) for (const id of r) if (!ids.includes(id)) ids.push(id);
	const curPos = where(mode);
	const fallback = (id: string) => {
		for (const m of modes) {
			const p = where(m).get(id);
			if (p) return p;
		}
		return [0, 0] as [number, number];
	};

	const cycles = mode.rows.length;
	const used = mode.rows.reduce((n, r) => n + r.length, 0);
	const slots = cycles * mode.width;
	const empty = slots - used;
	const cpi = cycles / used;
	const twoApps = mode.rows.some((r) => r.some((id) => id.startsWith('b')));
	const anyTwoApps = modes.some((m) => m.rows.some((r) => r.some((id) => id.startsWith('b'))));

	const gx = (c: number) => ARROW + c * CELL;
	const gy = (r: number) => HEAD + r * CELL;
	const endY = gy(cycles);

	return (
		<figure className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} speed={false} counter={`${stepper.step + 1} / ${modes.length}`}>
				<div className={s.modes} role="group" aria-label="Processor design">
					{modes.map((m, i) => (
						<button key={m.label} className={i === stepper.step ? 'viz-primary' : undefined} aria-pressed={i === stepper.step} onClick={() => stepper.setStep(i)}>
							{m.label}
						</button>
					))}
				</div>
			</StepControls>
			{mode.note && <p className={s.message}>{mode.note}</p>}

			<div className={s.body}>
				<svg className={s.svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${mode.label}: ${cycles} cycles`}>
					<defs>
						<pattern id={`${pid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
						</pattern>
					</defs>

					<text className={s.head} x={ARROW + (mode.width * CELL) / 2} y={14} textAnchor="middle" style={{ transition: 'x 500ms' }}>
						{mode.width}-wide
					</text>

					{/* Slot grid: columns beyond the current width fade out; empty slots inside the run are hatched. */}
					{Array.from({ length: maxRows }, (_, r) =>
						Array.from({ length: maxW }, (_, c) => {
							const on = c < mode.width;
							const inRun = r < cycles;
							const filled = mode.rows[r]?.[c] !== undefined;
							const wasted = on && inRun && !filled;
							return (
								<g key={`${r}-${c}`} className={s.cellG} style={{ opacity: on ? 1 : 0 }}>
									<rect x={gx(c)} y={gy(r)} width={CELL} height={CELL} className={inRun ? s.cell : s.cellIdle} />
									<rect
										x={gx(c) + 1}
										y={gy(r) + 1}
										width={CELL - 2}
										height={CELL - 2}
										fill={`url(#${pid}-hatch)`}
										className={s.waste}
										style={{ opacity: wasted ? 1 : 0 }}
									/>
								</g>
							);
						}),
					)}

					{/* Context switch line */}
					<g className={s.switch} style={{ opacity: mode.switchAfter ? 1 : 0 }}>
						<line x1={ARROW - 6} x2={gx(mode.width) + 2} y1={gy(mode.switchAfter ?? 0)} y2={gy(mode.switchAfter ?? 0)} />
					</g>

					{/* Execution time arrow: the shaft scales, the bottom head and label ride on transforms. */}
					<path d={`M${ARROW - 24},${HEAD + 8} L${ARROW - 18},${HEAD} L${ARROW - 12},${HEAD + 8}`} className={s.arrowStroke} />
					<g className={s.move} style={{ transform: `translate(${ARROW - 19}px, ${HEAD}px) scaleY(${(endY - HEAD) / (maxRows * CELL)})` }}>
						<rect width={2} height={maxRows * CELL} className={s.arrowShaft} />
					</g>
					<g className={s.move} style={{ transform: `translate(${ARROW - 30}px, ${(HEAD + endY) / 2}px)` }}>
						<text className={s.timeLabel} textAnchor="middle" transform="rotate(-90)">
							time
						</text>
					</g>
					<g className={s.move} style={{ transform: `translate(0px, ${endY}px)` }}>
						<path d={`M${ARROW - 24},-8 L${ARROW - 18},0 L${ARROW - 12},-8`} className={s.arrowStroke} />
						<line x1={ARROW - 4} x2={gx(mode.width) + 2} y1={0} y2={0} className={s.endRule} style={{ transition: 'x2 600ms' }} />
						<text x={ARROW - 30} y={17} className={s.endLabel}>
							{cycles} cycles
						</text>
					</g>

					{/* Instructions */}
					{ids.map((id) => {
						const p = curPos.get(id);
						const [r, c] = p ?? fallback(id);
						const app = id.startsWith('b') ? s.app2 : s.app1;
						return (
							<g
								key={id}
								className={`${s.insn} ${app}`}
								style={{ transform: `translate(${gx(c) + CELL / 2}px, ${gy(r) + CELL / 2}px)`, opacity: p ? 1 : 0 }}
							>
								<circle r={R} />
								<text y={4.5} textAnchor="middle">
									{id.slice(1)}
								</text>
							</g>
						);
					})}
				</svg>

				<div className={s.stats}>
					<Stat label="Cycles" value={String(cycles)} />
					<Stat label="Instructions" value={String(used)} />
					<Stat label="CPI" value={cpi.toFixed(2)} sub="cycles per instruction" />
					<div className={s.meter}>
						<div className={s.meterHead}>
							<span>Slots used</span>
							<b>
								{used} / {slots}
							</b>
						</div>
						<div className={s.track}>
							<div className={s.fill} style={{ width: `${(100 * used) / slots}%` }} />
						</div>
						<div className={s.meterFoot}>{empty} wasted</div>
					</div>
				</div>
			</div>

			<div className={s.legend}>
				<span className={s.lg}>
					<span className={`${s.dot} ${s.dot1}`} />
					{anyTwoApps ? apps[0] : 'Instruction (program order)'}
				</span>
				{anyTwoApps && (
					<span className={s.lg} style={{ opacity: twoApps ? 1 : 0.45 }}>
						<span className={`${s.dot} ${s.dot2}`} />
						{apps[1]}
					</span>
				)}
				<span className={s.lg}>
					<span className={s.wasteSwatch} />
					Empty slot (wasted)
				</span>
				{modes.some((m) => m.switchAfter) && (
					<span className={s.lg}>
						<span className={s.switchSwatch} />
						Context switch
					</span>
				)}
			</div>
		</figure>
	);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
	return (
		<div className={s.stat}>
			<span className={s.statLabel}>{label}</span>
			<b className={s.statValue}>{value}</b>
			{sub && <span className={s.statSub}>{sub}</span>}
		</div>
	);
}
