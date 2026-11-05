// CPI as bars: the ideal CPI of 1 plus the stall cycles each design adds per instruction, so the
// cheaper design is visibly the shorter bar.
import s from './CpiBars.module.css';

interface Bar {
	label: string;
	cpi: number;
	/** Short annotation after the value, e.g. "40% slower". */
	note?: string;
}

interface Props {
	bars: Bar[];
	/** Name of the stall segment in the legend. */
	penaltyLabel?: string;
}

export default function CpiBars({ bars, penaltyLabel = 'stall cycles per instruction' }: Props) {
	const max = Math.max(1.5, Math.ceil(Math.max(...bars.map((b) => b.cpi)) * 10) / 10);
	const pct = (v: number) => `${(100 * v) / max}%`;
	return (
		<div className={`not-content ${s.root}`}>
			<div className={s.rows}>
				{bars.map((b) => (
					<div key={b.label} className={s.row}>
						<span className={s.label}>{b.label}</span>
						<span className={s.track}>
							<span className={s.base} style={{ width: pct(Math.min(1, b.cpi)) }} />
							<span className={s.penalty} style={{ left: pct(1), width: pct(Math.max(0, b.cpi - 1)) }} />
							<span className={s.ideal} style={{ left: pct(1) }} />
						</span>
						<span className={s.value}>
							<b>{b.cpi}</b>
							{b.note && <span className={s.note}>{b.note}</span>}
						</span>
					</div>
				))}
			</div>
			<div className={s.legend}>
				<span>
					<i className={s.lgBase} /> ideal CPI = 1
				</span>
				<span>
					<i className={s.lgPenalty} /> {penaltyLabel}
				</span>
			</div>
		</div>
	);
}
