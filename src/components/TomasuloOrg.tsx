import s from './TomasuloOrg.module.css';

// Static block diagram of a Tomasulo machine: in-order front end, out-of-order back end, and the CDB
// carrying <tag, value> back to the reservation stations and register files.

const W = 680;
const H = 452;

function Box({ x, y, w, h, label, sub, cls }: { x: number; y: number; w: number; h: number; label: string; sub?: string; cls?: string }) {
	return (
		<g className={cls ?? s.box}>
			<rect x={x} y={y} width={w} height={h} rx={6} />
			<text x={x + w / 2} y={y + h / 2 + (sub ? -2 : 4)} textAnchor="middle" className={s.label}>
				{label}
			</text>
			{sub && (
				<text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" className={s.sub}>
					{sub}
				</text>
			)}
		</g>
	);
}

/** A register file / RS stack: a box of horizontal slots, with an optional tag column. */
function Stack({ x, y, w, h, rows, tags }: { x: number; y: number; w: number; h: number; rows: number; tags?: boolean }) {
	const dy = h / rows;
	return (
		<g className={s.stack}>
			<rect x={x} y={y} width={w} height={h} rx={4} />
			{Array.from({ length: rows - 1 }, (_, i) => (
				<line key={i} x1={x} x2={x + w} y1={y + dy * (i + 1)} y2={y + dy * (i + 1)} />
			))}
			{tags && <rect className={s.tagCol} x={x + w - 16} y={y} width={16} height={h} />}
		</g>
	);
}

const arrow = (d: string, cls = s.wire) => <path d={d} className={cls} markerEnd={cls === s.cdb ? 'url(#to-cdb)' : 'url(#to-wire)'} />;

export default function TomasuloOrg() {
	const rs = [
		{ x: 70, name: 'integer', fu: 'int / branch' },
		{ x: 280, name: 'memory', fu: 'AGU' },
		{ x: 490, name: 'floating point', fu: 'FP' },
	];
	const RS_Y = 200;
	const RS_H = 62;
	const FU_Y = 300;
	const CDB_Y = 432;
	const RET_Y = 176; // CDB return line, just above the RS

	return (
		<figure className={`not-content ${s.root}`}>
			<svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label="Tomasulo organization: front end, reservation stations, functional units, and the common data bus">
				<defs>
					<marker id="to-wire" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.headWire} />
					</marker>
					<marker id="to-cdb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.headCdb} />
					</marker>
				</defs>

				{/* Bands */}
				<rect className={s.front} x={0} y={0} width={W} height={160} rx={8} />
				<rect className={s.back} x={0} y={164} width={W} height={H - 164} rx={8} />
				<text className={s.band} x={12} y={20}>
					front end <tspan className={s.bandSub}>· in order</tspan>
				</text>
				<text className={s.band} x={12} y={H - 10}>
					back end <tspan className={s.bandSub}>· out of order · the RS are the instruction buffer</tspan>
				</text>

				{/* Front end */}
				<Box x={290} y={12} w={100} h={26} label="I-cache" />
				{arrow('M340,38 L340,50')}
				<Stack x={300} y={52} w={80} h={30} rows={3} />
				<text className={s.sub} x={392} y={71}>
					fetch queue
				</text>
				{arrow('M340,82 L340,94')}
				<Box x={280} y={96} w={120} h={28} label="decode / dispatch" />

				<Stack x={70} y={50} w={130} h={66} rows={5} tags />
				<text className={s.label} x={135} y={132} textAnchor="middle">
					integer registers
				</text>
				<Stack x={480} y={50} w={130} h={66} rows={5} tags />
				<text className={s.label} x={545} y={132} textAnchor="middle">
					FP registers
				</text>
				<text className={s.tagNote} x={192} y={44} textAnchor="middle">
					tags
				</text>
				<text className={s.tagNote} x={602} y={44} textAnchor="middle">
					tags
				</text>

				{/* Dispatch bus: decode and register values/tags into the RS */}
				<path className={s.wire} d="M135,138 L135,148 L545,148 L545,138" />
				{arrow('M340,124 L340,148', s.wire)}
				{rs.map((r) => (
					<g key={r.name}>{arrow(`M${r.x + 40},148 L${r.x + 40},${RS_Y - 2}`)}</g>
				))}

				{/* Reservation stations, issue, functional units */}
				{rs.map((r) => (
					<g key={r.name}>
						<Stack x={r.x} y={RS_Y} w={120} h={RS_H} rows={5} />
						<text className={s.sub} x={r.x + 60} y={RS_Y + RS_H + 14} textAnchor="middle">
							{r.name} RS
						</text>
						<rect className={s.issue} x={r.x + 30} y={RS_Y + RS_H + 20} width={60} height={16} rx={8} />
						<text className={s.issueText} x={r.x + 60} y={RS_Y + RS_H + 32} textAnchor="middle">
							issue
						</text>
						{arrow(`M${r.x + 60},${RS_Y + RS_H + 36} L${r.x + 60},${FU_Y + 2}`)}
						<Box x={r.x + 10} y={FU_Y + 4} w={100} h={28} label={r.fu} />
					</g>
				))}

				{/* Memory: AGU -> load/store queues -> D-cache */}
				{arrow('M340,332 L340,346')}
				<Stack x={262} y={348} w={64} h={34} rows={3} />
				<Stack x={354} y={348} w={64} h={34} rows={3} />
				<text className={s.sub} x={252} y={369} textAnchor="end">
					load queue
				</text>
				<text className={s.sub} x={428} y={369}>
					store queue
				</text>
				<Box x={290} y={392} w={100} h={24} label="D-cache" />

				{/* CDB: results with their tags, back to every RS and both register files */}
				<path className={s.cdb} d={`M24,${CDB_Y} L656,${CDB_Y}`} />
				{arrow(`M130,${FU_Y + 32} L130,${CDB_Y - 3}`, s.cdb)}
				{arrow(`M550,${FU_Y + 32} L550,${CDB_Y - 3}`, s.cdb)}
				{arrow(`M390,404 L404,404 L404,${CDB_Y - 3}`, s.cdb)}
				<path className={s.cdb} d={`M24,${CDB_Y} L24,${RET_Y} L656,${RET_Y} L656,${CDB_Y}`} />
				{rs.map((r) => (
					<g key={r.name}>{arrow(`M${r.x + 96},${RET_Y} L${r.x + 96},${RS_Y - 3}`, s.cdb)}</g>
				))}
				{arrow(`M24,${RET_Y} L24,83 L66,83`, s.cdb)}
				{arrow(`M656,${RET_Y} L656,83 L614,83`, s.cdb)}
				<rect className={s.cdbTagBg} x={412} y={CDB_Y - 10} width={130} height={20} rx={10} />
				<text className={s.cdbText} x={477} y={CDB_Y + 4} textAnchor="middle">
					CDB: tag + value
				</text>
			</svg>
			<figcaption className={s.legend}>
				<span>
					<span className={s.lgWire} /> dispatch: values or tags into an RS
				</span>
				<span>
					<span className={s.lgCdb} /> CDB broadcast to every RS and register file
				</span>
			</figcaption>
		</figure>
	);
}
