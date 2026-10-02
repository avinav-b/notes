// Static timing figures comparing how two instructions occupy time in different processor designs.
import s from './ExecTimeline.module.css';

interface Box {
	insn: number;
	start: number;
	len: number;
	text: string;
}
interface Design {
	label: string;
	boxes: Box[];
}

const phases = (insn: number, start: number) =>
	['fetch', 'dec', 'exec'].map((p, k) => ({ insn, start: start + k, len: 1, text: `insn${insn}.${p}` }));

const VARIANTS: Record<string, Design[]> = {
	'single-vs-multi': [
		{
			label: 'Single-cycle',
			boxes: [
				{ insn: 0, start: 0, len: 3, text: 'insn0.fetch, dec, exec' },
				{ insn: 1, start: 3, len: 3, text: 'insn1.fetch, dec, exec' },
			],
		},
		{ label: 'Multi-cycle', boxes: [...phases(0, 0), ...phases(1, 3)] },
	],
	'multi-vs-pipelined': [
		{ label: 'Multi-cycle', boxes: [...phases(0, 0), ...phases(1, 3)] },
		{ label: 'Pipelined', boxes: [...phases(0, 0), ...phases(1, 1)] },
	],
};

const LABEL_W = 100;
const UNIT = 96;
const LANE = 30;
const GAP = 22;

export default function ExecTimeline({ variant = 'single-vs-multi' }: { variant?: keyof typeof VARIANTS }) {
	const designs = VARIANTS[variant];
	const width = LABEL_W + 6 * UNIT + 4;
	const groupH = 2 * LANE + GAP;
	const height = designs.length * groupH + 18;

	return (
		<figure className={`not-content ${s.root}`}>
			<svg className={s.svg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={designs.map((d) => d.label).join(' vs ')}>
				{designs.map((d, g) => {
					const y0 = g * groupH;
					return (
						<g key={d.label}>
							<text className={s.label} x={0} y={y0 + 20}>
								{d.label}
							</text>
							{d.boxes.map((b, k) => (
								<g key={k} className={b.insn === 0 ? s.insn0 : s.insn1}>
									<rect x={LABEL_W + b.start * UNIT + 1} y={y0 + b.insn * LANE + 2} width={b.len * UNIT - 2} height={LANE - 4} rx={4} />
									<text x={LABEL_W + (b.start + b.len / 2) * UNIT} y={y0 + b.insn * LANE + LANE / 2 + 4} textAnchor="middle">
										{b.text}
									</text>
								</g>
							))}
						</g>
					);
				})}
				<line className={s.axis} x1={LABEL_W} y1={height - 14} x2={width - 4} y2={height - 14} markerEnd="url(#et-arrow)" />
				<text className={s.axisLabel} x={width - 4} y={height - 2} textAnchor="end">
					time
				</text>
				<defs>
					<marker id="et-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.head} />
					</marker>
				</defs>
			</svg>
		</figure>
	);
}
