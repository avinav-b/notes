// Two-level predictor organisations (GAg, GAp, PAg, PAp): the first level holds branch history (one
// global register, or a table of per-address registers indexed by PC bits), the second level holds
// 2-bit counters (one global table, or one table per PC group). Sliders change the bit widths and
// the storage cost of every scheme is recomputed and drawn as bars.
import { useState } from 'react';
import s from './PredictorTables.module.css';

type Scheme = 'GAg' | 'GAp' | 'PAg' | 'PAp';

interface Props {
	/** History bits (BHR length). */
	history?: number;
	/** PC bits that index the private history table. */
	pcHistory?: number;
	/** PC bits that pick a private predictor table. */
	pcTable?: number;
	initial?: Scheme;
}

const SCHEMES: Scheme[] = ['GAg', 'GAp', 'PAg', 'PAp'];

function size(sc: Scheme, h: number, p: number, k: number) {
	const first = sc[0] === 'G' ? h : 2 ** p * h;
	const second = (sc[2] === 'p' ? 2 ** k : 1) * 2 ** h * 2;
	return { first, second, total: first + second };
}

function Pow({ b, e }: { b: number; e: number | string }) {
	return (
		<>
			{b}
			<sup>{e}</sup>
		</>
	);
}

export default function PredictorTables({ history = 8, pcHistory = 6, pcTable = 2, initial = 'GAg' }: Props) {
	const [sc, setSc] = useState<Scheme>(initial);
	const [h, setH] = useState(history);
	const [p, setP] = useState(pcHistory);
	const [k, setK] = useState(pcTable);
	const perAddrHist = sc[0] === 'P';
	const perAddrTable = sc[2] === 'p';
	const sizes = Object.fromEntries(SCHEMES.map((x) => [x, size(x, h, p, k)])) as Record<Scheme, ReturnType<typeof size>>;
	const max = Math.max(...SCHEMES.map((x) => sizes[x].total));
	const cur = sizes[sc];

	// Diagram geometry
	const nTables = perAddrTable ? Math.min(2 ** k, 4) : 1;
	const tblX = 400;
	const tblY = 70;
	const tblH = 150;
	const tblW = 44;

	return (
		<div className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.bar}`}>
				<div className={s.toggle} role="group" aria-label="Scheme">
					{SCHEMES.map((x) => (
						<button key={x} className={x === sc ? 'viz-primary' : undefined} aria-pressed={x === sc} onClick={() => setSc(x)}>
							{x}
						</button>
					))}
				</div>
			</div>
			<div className={s.sliders}>
				<label>
					<span>history bits h</span>
					<input type="range" min={1} max={12} value={h} onChange={(e) => setH(Number(e.target.value))} />
					<b>{h}</b>
				</label>
				<label className={perAddrHist ? '' : s.unused}>
					<span>PC bits for history table p</span>
					<input type="range" min={1} max={10} value={p} onChange={(e) => setP(Number(e.target.value))} />
					<b>{p}</b>
				</label>
				<label className={perAddrTable ? '' : s.unused}>
					<span>PC bits for table select k</span>
					<input type="range" min={1} max={4} value={k} onChange={(e) => setK(Number(e.target.value))} />
					<b>{k}</b>
				</label>
			</div>

			<div className={s.scroll}>
				<svg className={s.svg} viewBox="0 0 640 262" role="img" aria-label={`${sc} predictor organisation`}>
					<defs>
						<marker id="pt-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
							<path d="M0,0 L10,5 L0,10 z" className={s.headFill} />
						</marker>
					</defs>

					{/* Branch PC (only when PC bits are used) */}
					<g className={perAddrHist || perAddrTable ? s.show : s.hide}>
						<text className={s.caption} x={20} y={14}>
							branch PC
						</text>
						<rect className={s.pc} x={20} y={20} width={300} height={24} rx={4} />
						{perAddrHist && (
							<g>
								<rect className={s.pcField} x={180} y={20} width={60} height={24} />
								<text className={s.fieldText} x={210} y={36} textAnchor="middle">
									p = {p}
								</text>
							</g>
						)}
						{perAddrTable && (
							<g>
								<rect className={s.pcFieldK} x={240} y={20} width={50} height={24} />
								<text className={s.fieldText} x={265} y={36} textAnchor="middle">
									k = {k}
								</text>
							</g>
						)}
					</g>

					{/* First level */}
					<text className={s.level} x={20} y={66}>
						Level 1: history
					</text>
					{perAddrHist ? (
						<g>
							<rect className={s.table} x={130} y={tblY + 20} width={110} height={tblH - 40} rx={4} />
							{Array.from({ length: 6 }, (_, r) => (
								<line key={r} className={s.rowLine} x1={130} x2={240} y1={tblY + 20 + ((r + 1) * (tblH - 40)) / 7} y2={tblY + 20 + ((r + 1) * (tblH - 40)) / 7} />
							))}
							<rect className={s.selRow} x={130} y={tblY + 20 + (3 * (tblH - 40)) / 7} width={110} height={(tblH - 40) / 7} />
							<text className={s.tName} x={185} y={tblY + tblH - 6} textAnchor="middle">
								private history table
							</text>
							<text className={s.dim} x={120} y={tblY + tblH / 2 + 4} textAnchor="end">
								2<tspan className={s.sup} dy={-6}>{p}</tspan>
								<tspan dy={6}> rows</tspan>
							</text>
							<text className={s.dim} x={185} y={tblY + 14} textAnchor="middle">
								{h} bits each
							</text>
							<path className={s.wire} d={`M210,44 V${tblY + 4} H252 V${tblY + 20 + (3.5 * (tblH - 40)) / 7} H244`} markerEnd="url(#pt-head)" />
						</g>
					) : (
						<g>
							<rect className={s.table} x={130} y={tblY + tblH / 2 - 14} width={110} height={28} rx={4} />
							{Array.from({ length: Math.min(h, 12) - 1 }, (_, r) => (
								<line key={r} className={s.rowLine} x1={130 + ((r + 1) * 110) / Math.min(h, 12)} x2={130 + ((r + 1) * 110) / Math.min(h, 12)} y1={tblY + tblH / 2 - 14} y2={tblY + tblH / 2 + 14} />
							))}
							<text className={s.tName} x={185} y={tblY + tblH / 2 + 34} textAnchor="middle">
								global history register
							</text>
							<text className={s.dim} x={185} y={tblY + tblH / 2 - 22} textAnchor="middle">
								{h} bits
							</text>
						</g>
					)}

					{/* History bits index the second level */}
					<path className={s.wireStrong} d={`M244,${tblY + tblH / 2} H${tblX - 8}`} markerEnd="url(#pt-head)" />
					<text className={s.dim} x={(244 + tblX) / 2 - 20} y={tblY + tblH / 2 - 8} textAnchor="middle">
						{h}
					</text>
					<line className={s.slash} x1={(244 + tblX) / 2 - 24} x2={(244 + tblX) / 2 - 16} y1={tblY + tblH / 2 + 6} y2={tblY + tblH / 2 - 6} />

					{/* Second level */}
					<text className={s.level} x={tblX - 10} y={66}>
						Level 2: 2-bit counters
					</text>
					{Array.from({ length: nTables }, (_, t) => {
						const x = tblX + t * (tblW + 10);
						return (
							<g key={t} className={s.pop}>
								<rect className={s.table} x={x} y={tblY + 10} width={tblW} height={tblH - 10} rx={4} />
								{Array.from({ length: 7 }, (_, r) => (
									<line key={r} className={s.rowLine} x1={x} x2={x + tblW} y1={tblY + 10 + ((r + 1) * (tblH - 10)) / 8} y2={tblY + 10 + ((r + 1) * (tblH - 10)) / 8} />
								))}
								{(!perAddrTable || t === 1) && <rect className={s.selRow} x={x} y={tblY + 10 + (4 * (tblH - 10)) / 8} width={tblW} height={(tblH - 10) / 8} />}
							</g>
						);
					})}
					{perAddrTable && 2 ** k > 4 && (
						<text className={s.dim} x={tblX + 4 * (tblW + 10) - 4} y={tblY + tblH / 2 + 4}>
							…
						</text>
					)}
					<text className={s.tName} x={tblX + (nTables * (tblW + 10) - 10) / 2} y={tblY + tblH + 16} textAnchor="middle">
						{perAddrTable ? (
							<>
								2<tspan className={s.sup} dy={-5}>{k}</tspan>
								<tspan dy={5}> = {2 ** k} private tables, </tspan>
							</>
						) : (
							'one global table, '
						)}
						2<tspan className={s.sup} dy={-5}>{h}</tspan>
						<tspan dy={5}> rows each</tspan>
					</text>
					{perAddrTable && <path className={s.wireK} d={`M265,44 V54 H${tblX + 1.5 * (tblW + 10)} V${tblY + 6}`} markerEnd="url(#pt-head)" />}
				</svg>
			</div>

			<p className={s.formula}>
				<b>{sc}</b> ={' '}
				{perAddrHist ? (
					<>
						<Pow b={2} e={p} /> × {h}
					</>
				) : (
					<>{h}</>
				)}{' '}
				+{' '}
				{perAddrTable && (
					<>
						<Pow b={2} e={k} /> ×{' '}
					</>
				)}
				<Pow b={2} e={h} /> × 2 = {cur.first.toLocaleString()} + {cur.second.toLocaleString()} = <b>{cur.total.toLocaleString()} bits</b>
			</p>

			<div className={s.bars} aria-label="Storage of each scheme">
				{SCHEMES.map((x) => (
					<button key={x} className={`${s.barRow} ${x === sc ? s.barOn : ''}`} onClick={() => setSc(x)}>
						<span className={s.barName}>{x}</span>
						<span className={s.track}>
							<span className={s.fillHist} style={{ width: `${(100 * sizes[x].first) / max}%` }} />
							<span className={s.fillCtr} style={{ width: `${(100 * sizes[x].second) / max}%` }} />
						</span>
						<span className={s.barVal}>{sizes[x].total.toLocaleString()}</span>
					</button>
				))}
			</div>
			<div className={s.legend}>
				<span>
					<i className={s.lgHist} /> history bits (level 1)
				</span>
				<span>
					<i className={s.lgCtr} /> counter bits (level 2)
				</span>
			</div>
		</div>
	);
}
