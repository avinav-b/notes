// The execute stage split into functional units of different lengths: the 1-cycle integer ALU, a
// pipelined FP multiplier (M1-M7) and adder (A1-A4), and an unpipelined divider. All share F, D and W.
import s from './FuPipelines.module.css';

interface Unit {
	name: string;
	stages: string[];
	note: string;
	y: number;
	/** One long box instead of stages: busy for many cycles, not pipelined. */
	blocked?: boolean;
}

const UNITS: Unit[] = [
	{ name: 'integer', stages: ['X', 'M'], note: '1 cycle', y: 22 },
	{ name: 'FP multiply', stages: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'], note: 'pipelined', y: 76 },
	{ name: 'FP add', stages: ['A1', 'A2', 'A3', 'A4'], note: 'pipelined', y: 130 },
	{ name: 'divide', stages: [], note: 'many cycles, not pipelined', y: 184, blocked: true },
];

const SX = 150; // first execute stage
const SW = 44;
const GAP = 8;
const WX = 560;

export default function FuPipelines() {
	const midY = 116;
	return (
		<div className={`not-content ${s.root}`}>
			<div className={s.scroll}>
				<svg className={s.svg} viewBox="0 0 640 228" role="img" aria-label="Execute stage with functional units of different lengths">
					<defs>
						<marker id="fu-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
							<path d="M0,0 L10,5 L0,10 z" className={s.head} />
						</marker>
					</defs>
					{['F', 'D'].map((x, k) => (
						<g key={x} className={s.stage}>
							<rect x={14 + k * 50} y={midY - 18} width={44} height={36} rx={5} />
							<text x={36 + k * 50} y={midY + 5} textAnchor="middle">
								{x}
							</text>
						</g>
					))}
					{UNITS.map((u) => {
						const cy = u.y + 18;
						const end = u.blocked ? SX + 7 * (SW + GAP) - GAP : SX + u.stages.length * (SW + GAP) - GAP;
						return (
							<g key={u.name}>
								<path className={s.wire} d={`M108,${midY} C125,${midY} 125,${cy} ${SX - 4},${cy}`} markerEnd="url(#fu-head)" />
								{u.blocked ? (
									<g className={s.blocked}>
										<rect x={SX} y={u.y} width={end - SX} height={36} rx={5} />
										{Array.from({ length: 23 }, (_, k) => (
											<line key={k} x1={SX + ((k + 1) * (end - SX)) / 24} x2={SX + ((k + 1) * (end - SX)) / 24} y1={u.y + 6} y2={u.y + 30} />
										))}
									</g>
								) : (
									u.stages.map((st, k) => (
										<g key={st} className={s.stage}>
											<rect x={SX + k * (SW + GAP)} y={u.y} width={SW} height={36} rx={5} />
											<text x={SX + k * (SW + GAP) + SW / 2} y={u.y + 23} textAnchor="middle">
												{st}
											</text>
										</g>
									))
								)}
								<path className={s.wire} d={`M${end + 4},${cy} C${WX - 20},${cy} ${WX - 20},${midY} ${WX - 4},${midY}`} markerEnd="url(#fu-head)" />
								<text className={s.unit} x={SX} y={u.y - 5}>
									{u.name}
									<tspan className={s.note}> · {u.note}</tspan>
								</text>
							</g>
						);
					})}
					<g className={s.stage}>
						<rect x={WX} y={midY - 18} width={44} height={36} rx={5} />
						<text x={WX + 22} y={midY + 5} textAnchor="middle">
							W
						</text>
					</g>
				</svg>
			</div>
		</div>
	);
}
