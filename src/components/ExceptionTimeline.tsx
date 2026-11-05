// Pipeline diagram for precise exceptions: an exception marks its instruction (flag carried down the
// pipeline, instruction turned into a nop), and is handled when the flag reaches the M/W register.
// Younger instructions are then flushed. Scenarios are data (rows of stages per cycle), so the same
// component shows the in-order case, out-of-order writeback, and two exceptions in flight.
import { useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './ExceptionTimeline.module.css';

interface Row {
	insn: string;
	/** Cycle of the first stage. */
	start: number;
	/** One label per cycle, e.g. ['F', 'D', 'E/', 'E/', 'W']. */
	stages: string[];
	/** Small note left of the instruction, e.g. "page i". */
	tag?: string;
}

interface Scenario {
	label: string;
	rows: Row[];
	/** Exceptions raised: row index, cycle, short label. */
	faults: { row: number; cycle: number; label: string }[];
	/** The exception that is actually handled, when its flag reaches M/W. */
	handled: { row: number; cycle: number };
	/** Writebacks that happened before an older exception was handled. */
	early?: { row: number; cycle: number; label: string }[];
	/** One short line per cycle (index = cycle; 0 = before cycle 1). */
	notes: string[];
}

interface Props {
	scenarios: Scenario[];
}

// ---- Layout ----
const LEFT = 200;
const COL = 50;
const TOP = 36;
const ROW_H = 58;
const CELL_W = 42;
const CELL_H = 30;

export default function ExceptionTimeline({ scenarios }: Props) {
	const [k, setK] = useState(0);
	const sc = scenarios[Math.min(k, scenarios.length - 1)];
	const cycles = Math.max(...sc.rows.map((r) => r.start + r.stages.length - 1), sc.handled.cycle);
	const last = sc.handled.cycle;
	const stepper = useStepper(last, { intervalMs: 1300 });
	const step = Math.min(stepper.step, last);
	const W = LEFT + cycles * COL + 10;
	const H = TOP + sc.rows.length * ROW_H + 6;

	const cx = (c: number) => LEFT + (c - 1) * COL + COL / 2;
	const ry = (r: number) => TOP + r * ROW_H + 8;
	const handledNow = step >= sc.handled.cycle;

	const faultOf = (r: number) => sc.faults.find((f) => f.row === r);

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`cycle ${step}`}>
				{scenarios.length > 1 && (
					<div className={s.seg} role="group" aria-label="Scenario">
						{scenarios.map((x, i) => (
							<button
								key={x.label}
								className={i === k ? s.segOn : ''}
								aria-pressed={i === k}
								onClick={() => {
									setK(i);
									stepper.setStep(0);
								}}
							>
								{x.label}
							</button>
						))}
					</div>
				)}
			</StepControls>

			<p className={s.message}>{sc.notes[step] ?? ''}</p>

			<div className={s.scroll}>
				<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: `${Math.min(W, 560)}px` }} role="img" aria-label="Pipeline diagram with exceptions">
					{/* cycle header */}
					{Array.from({ length: cycles }, (_, i) => i + 1).map((c) => (
						<g key={c}>
							{c === step && <rect className={s.curCol} x={LEFT + (c - 1) * COL + 2} y={4} width={COL - 4} height={H - 8} rx={6} />}
							<text className={`${s.cyc} ${c === step ? s.cycCur : ''}`} x={cx(c)} y={20} textAnchor="middle">
								{c}
							</text>
						</g>
					))}

					{sc.rows.map((row, r) => {
						const fault = faultOf(r);
						const flushed = handledNow && r >= sc.handled.row;
						return (
							<g key={r}>
								{row.tag && (
									<text className={s.rowTag} x={6} y={ry(r) + 20}>
										{row.tag}
									</text>
								)}
								<text className={`${s.insn} ${flushed ? s.insnFlushed : ''}`} x={row.tag ? 54 : 6} y={ry(r) + 20}>
									{row.insn}
								</text>
								{row.stages.map((st, j) => {
									const c = row.start + j;
									if (c > step) return null;
									// Stages after the handled cycle never happen for flushed rows.
									if (r >= sc.handled.row && c > sc.handled.cycle) return null;
									const isFault = fault && c === fault.cycle;
									const carried = fault && c > fault.cycle;
									const early = sc.early?.find((e) => e.row === r && e.cycle === c);
									const isHandled = r === sc.handled.row && c === sc.handled.cycle && handledNow;
									const cls = [
										s.cell,
										st.startsWith('d') && s.stall,
										isFault && s.fault,
										carried && s.nop,
										early && s.early,
										flushed && !early && s.flushed,
										isHandled && s.handled,
										c === step && s.cellNew,
									]
										.filter(Boolean)
										.join(' ');
									return (
										<g key={j} className={cls}>
											<rect x={cx(c) - CELL_W / 2} y={ry(r)} width={CELL_W} height={CELL_H} rx={6} />
											<text x={cx(c)} y={ry(r) + 20} textAnchor="middle">
												{st}
											</text>
											{carried && !isHandled && <circle className={s.flagDot} cx={cx(c) + CELL_W / 2 - 5} cy={ry(r) + 5} r={3.5} />}
											{isFault && (
												<text className={s.faultLabel} x={cx(c)} y={ry(r) + CELL_H + 14} textAnchor="middle">
													{fault!.label}
												</text>
											)}
											{early && (
												<text className={s.earlyLabel} x={cx(c)} y={ry(r) + CELL_H + 14} textAnchor="middle">
													{early.label}
												</text>
											)}
											{isHandled && (
												<text className={s.handledLabel} x={cx(c)} y={ry(r) - 6} textAnchor="middle">
													handled
												</text>
											)}
										</g>
									);
								})}
							</g>
						);
					})}
				</svg>
			</div>

			<div className={s.legend}>
				<span>
					<i className={s.lgFault} /> exception raised
				</span>
				<span>
					<i className={s.lgNop} /> flagged nop
				</span>
				<span>
					<i className={s.lgHandled} /> handled at M/W
				</span>
				<span>
					<i className={s.lgFlushed} /> flushed
				</span>
				{scenarios.some((x) => x.early?.length) && (
					<span>
						<i className={s.lgEarly} /> wrote back too early
					</span>
				)}
			</div>
		</div>
	);
}
