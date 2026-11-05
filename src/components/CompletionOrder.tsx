import s from './CompletionOrder.module.css';

// Static figure: when each instruction wrote back (W), in program order, against an exception in one
// of them. Younger instructions that already completed are the precise-state problem.

interface Row {
	text: string;
	w: number;
}

interface Props {
	rows: Row[];
	/** Index of the instruction that faults. */
	fault: number;
	/** Cycle the fault is noticed (default: its W cycle). */
	faultCycle?: number;
	faultLabel?: string;
}

const W = 680;
const ROW_H = 30;
const TOP = 46;
const X0 = 196; // cycle 1
const X1 = 660;

export default function CompletionOrder({ rows, fault, faultCycle, faultLabel = 'page fault' }: Props) {
	const fc = faultCycle ?? rows[fault].w;
	const maxC = Math.max(...rows.map((r) => r.w), fc) + 1;
	const cx = (c: number) => X0 + ((c - 1) / (maxC - 1)) * (X1 - X0);
	const H = TOP + rows.length * ROW_H + 14;
	const kind = (i: number) => (i === fault ? 'fault' : i < fault ? 'older' : rows[i].w < fc ? 'early' : 'later');
	const early = rows.filter((_, i) => kind(i) === 'early').length;

	return (
		<figure className={`not-content ${s.root}`}>
			<svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label="Write-back cycle of each instruction, in program order, against the faulting store">
				<text className={s.axis} x={X0} y={16}>
					write-back cycle →
				</text>
				{Array.from({ length: maxC }, (_, k) => k + 1)
					.filter((c) => c % 2 === 0)
					.map((c) => (
						<g key={c}>
							<line className={s.grid} x1={cx(c)} x2={cx(c)} y1={TOP - 8} y2={H - 10} />
							<text className={s.tick} x={cx(c)} y={TOP - 14} textAnchor="middle">
								{c}
							</text>
						</g>
					))}

				{/* Everything left of the line, below the faulting row, finished too early. */}
				<rect className={s.zone} x={X0 - 8} y={TOP + (fault + 1) * ROW_H - 4} width={cx(fc) - X0 + 8} height={(rows.length - fault - 1) * ROW_H} rx={6} />

				{rows.map((r, i) => {
					const y = TOP + i * ROW_H + ROW_H / 2;
					const k = kind(i);
					return (
						<g key={i} className={s[k]}>
							<text className={s.insn} x={8} y={y + 4}>
								{r.text}
							</text>
							<line className={s.track} x1={X0} x2={cx(r.w)} y1={y} y2={y} />
							<circle className={s.dot} cx={cx(r.w)} cy={y} r={k === 'fault' ? 8 : 6} />
						</g>
					);
				})}

				<line className={s.faultLine} x1={cx(fc)} x2={cx(fc)} y1={TOP - 4} y2={H - 8} />
				<text className={s.faultText} x={cx(fc) - 12} y={TOP + fault * ROW_H + ROW_H / 2 + 4} textAnchor="end">
					{faultLabel}
				</text>
			</svg>
			<figcaption className={s.legend}>
				<span>
					<span className={`${s.sw} ${s.swOlder}`} /> older: done, fine
				</span>
				<span>
					<span className={`${s.sw} ${s.swFault}`} /> faulting instruction
				</span>
				<span>
					<span className={`${s.sw} ${s.swEarly}`} /> younger, already wrote back ({early})
				</span>
				<span>
					<span className={`${s.sw} ${s.swLater}`} /> younger, not done yet
				</span>
			</figcaption>
		</figure>
	);
}
