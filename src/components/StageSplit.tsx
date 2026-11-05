// Static figure: Tomasulo's pipeline vs the R10K's. Decode was already split into in-order dispatch
// and out-of-order issue by the RS; the R10K also splits writeback into out-of-order complete and
// in-order retire, with the ROB in between.
import s from './StageSplit.module.css';

interface Stage {
	label: string;
	x: number;
	w?: number;
	note?: string;
	noteCls?: 'bad' | 'good';
}
interface Band {
	x0: number;
	x1: number;
	order: 'in' | 'ooo';
}
interface Line {
	name: string;
	stages: Stage[];
	buffers: { label: string; x: number }[];
	bands: Band[];
}

const BW = 58; // stage box width
const BH = 32;
const XS = { F: 130, D: 200, S: 300, X: 370, C: 440, R: 560 };

const LINES: Line[] = [
	{
		name: 'Tomasulo',
		stages: [
			{ label: 'F', x: XS.F },
			{ label: 'D', x: XS.D },
			{ label: 'S', x: XS.S },
			{ label: 'X', x: XS.X },
			{ label: 'W', x: XS.C, w: XS.R + BW - XS.C, note: 'writes registers out of order: imprecise', noteCls: 'bad' },
		],
		buffers: [{ label: 'RS', x: (XS.D + BW + XS.S) / 2 }],
		bands: [
			{ x0: XS.F - 8, x1: XS.D + BW + 8, order: 'in' },
			{ x0: XS.S - 8, x1: XS.R + BW + 8, order: 'ooo' },
		],
	},
	{
		name: 'R10K',
		stages: [
			{ label: 'F', x: XS.F },
			{ label: 'D', x: XS.D },
			{ label: 'S', x: XS.S },
			{ label: 'X', x: XS.X },
			{ label: 'C', x: XS.C, note: 'writes PR' },
			{ label: 'R', x: XS.R, note: 'commits: precise', noteCls: 'good' },
		],
		buffers: [
			{ label: 'RS', x: (XS.D + BW + XS.S) / 2 },
			{ label: 'ROB', x: (XS.C + BW + XS.R) / 2 },
		],
		bands: [
			{ x0: XS.F - 8, x1: XS.D + BW + 8, order: 'in' },
			{ x0: XS.S - 8, x1: XS.C + BW + 8, order: 'ooo' },
			{ x0: XS.R - 8, x1: XS.R + BW + 8, order: 'in' },
		],
	},
];

const ROW_Y = [40, 136];

export default function StageSplit() {
	return (
		<figure className={`not-content ${s.root}`}>
			<svg className={s.svg} viewBox="0 0 680 210" role="img" aria-label="Tomasulo pipeline F D S X W versus R10K pipeline F D S X C R">
				{LINES.map((line, li) => {
					const y = ROW_Y[li];
					return (
						<g key={line.name}>
							<text className={s.name} x={8} y={y + BH / 2 + 5}>
								{line.name}
							</text>
							{line.bands.map((b, i) => (
								<g key={i}>
									<rect className={b.order === 'in' ? s.bandIn : s.bandOoo} x={b.x0} y={y - 8} width={b.x1 - b.x0} height={BH + 16} rx={8} />
									<text className={b.order === 'in' ? s.bandLabelIn : s.bandLabelOoo} x={b.x0 + 6} y={y - 14}>
										{b.order === 'in' ? 'in order' : 'out of order'}
									</text>
								</g>
							))}
							{line.buffers.map((b) => (
								<g key={b.label} className={s.buffer}>
									{[0, 1, 2, 3].map((k) => (
										<rect key={k} x={b.x - 14} y={y - 2 + k * 9} width={28} height={8} rx={1.5} />
									))}
									<text x={b.x} y={y - 14} textAnchor="middle">
										{b.label}
									</text>
								</g>
							))}
							{line.stages.map((st) => (
								<g key={st.label} className={s.stage}>
									<rect x={st.x} y={y} width={st.w ?? BW} height={BH} rx={6} />
									<text x={st.x + (st.w ?? BW) / 2} y={y + 21} textAnchor="middle">
										{st.label}
									</text>
									{st.note && (
										<text
											className={`${s.note} ${st.noteCls === 'bad' ? s.noteBad : st.noteCls === 'good' ? s.noteGood : ''}`}
											x={st.x + (st.w ?? BW) / 2}
											y={y + BH + 22}
											textAnchor="middle"
										>
											{st.note}
										</text>
									)}
								</g>
							))}
						</g>
					);
				})}
			</svg>
		</figure>
	);
}
