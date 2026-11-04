// Row-major layout of char a[I][J][K]: an exploded cube (one J x K layer per i), the flat memory
// strip, and the address formula filled in for the current (i, j, k). Brackets under the strip show
// how long each term of the address stays the same: i*J*K only changes when i does.
import { useEffect, useRef, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './ArrayLayout.module.css';

interface Props {
	I?: number;
	J?: number;
	K?: number;
}

const CELL = 46;

export default function ArrayLayout({ I = 2, J = 2, K = 2 }: Props) {
	const N = I * J * K;
	const stepper = useStepper(N - 1, { intervalMs: 1200 });
	const n = stepper.step;
	// Narrow containers (phones) get a taller layout: formula under the cube.
	const ref = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 540));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const W = narrow ? 400 : 700;
	const STRIP_X = narrow ? 58 : 92;
	const CUBE_X = narrow ? Math.round((W - (I - 1) * (K * CELL + 34) - K * CELL) / 2) : 46;
	const STRIP_W = W - STRIP_X - 10;
	const at = (m: number) => ({ i: Math.floor(m / (J * K)), j: Math.floor(m / K) % J, k: m % K });
	const { i, j, k } = at(n);

	// Exploded cube: layer i is shifted right and up.
	const layerW = K * CELL;
	const layerH = J * CELL;
	const dx = layerW + 34;
	const dy = -Math.round(layerH * 0.42);
	const cubeTop = 28 - dy * (I - 1);
	const cellPos = (ci: number, cj: number, ck: number) => ({ x: CUBE_X + ci * dx + ck * CELL, y: cubeTop + ci * dy + cj * CELL });

	const cubeBottom = cubeTop + layerH;
	const FY = narrow ? cubeBottom + 66 : cubeTop; // formula top
	const STRIP_Y = narrow ? FY + 150 : cubeBottom + 48;
	const SH = 46;
	const cw = STRIP_W / N;
	const BR1 = STRIP_Y + SH + 14; // j*K brackets
	const BR2 = BR1 + 40; // i*J*K brackets
	const H = BR2 + 34;

	const FX = narrow ? 24 : CUBE_X + (I - 1) * dx + layerW + 40; // formula column
	const select = (m: number) => () => stepper.setStep(m);

	const bracket = (x0: number, x1: number, y: number) => `M${x0 + 4},${y} L${x0 + 4},${y + 7} L${x1 - 4},${y + 7} L${x1 - 4},${y}`;

	return (
		<div ref={ref} className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`iteration ${n + 1} / ${N}`} />
			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`a[${i}][${j}][${k}] is at a + ${n}`}>
				<defs>
					<marker id="al-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.headFill} />
					</marker>
				</defs>

				{/* Depth connectors between layer corners */}
				{I > 1 &&
					[
						[0, 0],
						[layerW, 0],
						[0, layerH],
						[layerW, layerH],
					].map(([ox, oy], c) => {
						const p0 = cellPos(0, 0, 0);
						const p1 = cellPos(I - 1, 0, 0);
						return <line key={c} className={s.depth} x1={p0.x + ox} y1={p0.y + oy} x2={p1.x + ox} y2={p1.y + oy} />;
					})}

				{/* Cube layers, back to front */}
				{Array.from({ length: I }, (_, li) => I - 1 - li).map((ci) => (
					<g key={ci}>
						<text className={`${s.layerLbl} ${s.cI}`} x={cellPos(ci, 0, 0).x} y={cellPos(ci, 0, 0).y - 8}>
							i = {ci}
						</text>
						{Array.from({ length: J * K }, (_, q) => {
							const cj = Math.floor(q / K);
							const ck = q % K;
							const m = ci * J * K + cj * K + ck;
							const p = cellPos(ci, cj, ck);
							const cur = m === n;
							const sameRow = ci === i && cj === j;
							return (
								<g key={q} className={s.pick} onClick={select(m)} onMouseEnter={select(m)}>
									<rect className={`${s.cell} ${ci === i ? s.cellLayer : ''} ${sameRow ? s.cellRow : ''} ${cur ? s.cellCur : ''}`} x={p.x} y={p.y} width={CELL} height={CELL} />
									<text className={`${s.cellNum} ${cur ? s.cellNumCur : ''}`} x={p.x + CELL / 2} y={p.y + CELL / 2 + 5} textAnchor="middle">
										{m}
									</text>
								</g>
							);
						})}
					</g>
				))}

				{/* Axes */}
				<line className={`${s.axis} ${s.axK}`} x1={CUBE_X} y1={cubeBottom + 14} x2={CUBE_X + layerW} y2={cubeBottom + 14} markerEnd="url(#al-head)" />
				<text className={`${s.axisLbl} ${s.cK}`} x={CUBE_X + layerW / 2} y={cubeBottom + 30} textAnchor="middle">
					k
				</text>
				<line className={`${s.axis} ${s.axJ}`} x1={CUBE_X - 12} y1={cubeTop} x2={CUBE_X - 12} y2={cubeBottom} markerEnd="url(#al-head)" />
				<text className={`${s.axisLbl} ${s.cJ}`} x={CUBE_X - 24} y={cubeTop + layerH / 2 + 5} textAnchor="middle">
					j
				</text>
				{I > 1 && (
					<>
						<line
							className={`${s.axis} ${s.axI}`}
							x1={CUBE_X + layerW + 6}
							y1={cubeBottom + 6}
							x2={CUBE_X + dx - 6}
							y2={cubeBottom + dy + 6}
							markerEnd="url(#al-head)"
						/>
						<text className={`${s.axisLbl} ${s.cI}`} x={CUBE_X + layerW + dx / 2 - 10} y={cubeBottom + dy / 2 + 22}>
							i
						</text>
					</>
				)}

				{/* Formula */}
				<g className={s.formula}>
					<text x={FX} y={FY + 4}>
						<tspan className={s.fName}>a[</tspan>
						<tspan className={s.cI}>{i}</tspan>
						<tspan className={s.fName}>][</tspan>
						<tspan className={s.cJ}>{j}</tspan>
						<tspan className={s.fName}>][</tspan>
						<tspan className={s.cK}>{k}</tspan>
						<tspan className={s.fName}>]</tspan>
					</text>
					<text x={FX} y={FY + 38}>
						<tspan className={s.fDim}>= a + </tspan>
						<tspan className={s.cI}>i·J·K</tspan>
						<tspan className={s.fDim}> + </tspan>
						<tspan className={s.cJ}>j·K</tspan>
						<tspan className={s.fDim}> + </tspan>
						<tspan className={s.cK}>k</tspan>
					</text>
					<text x={FX} y={FY + 70}>
						<tspan className={s.fDim}>= a + </tspan>
						<tspan className={s.cI}>
							{i}·{J}·{K}
						</tspan>
						<tspan className={s.fDim}> + </tspan>
						<tspan className={s.cJ}>
							{j}·{K}
						</tspan>
						<tspan className={s.fDim}> + </tspan>
						<tspan className={s.cK}>{k}</tspan>
					</text>
					<text x={FX} y={FY + 108} className={s.fResult}>
						= a + {n}
					</text>
				</g>

				{/* Memory strip */}
				<text className={s.rowLbl} x={STRIP_X - 10} y={STRIP_Y + SH / 2 + 5} textAnchor="end">
					memory
				</text>
				{Array.from({ length: N }, (_, m) => {
					const c = at(m);
					const x = STRIP_X + m * cw;
					const cur = m === n;
					return (
						<g key={m} className={s.pick} onClick={select(m)} onMouseEnter={select(m)}>
							<rect className={`${s.cell} ${c.i === i ? s.cellLayer : ''} ${c.i === i && c.j === j ? s.cellRow : ''} ${cur ? s.cellCur : ''}`} x={x} y={STRIP_Y} width={cw} height={SH} />
							<text className={s.stripIdx} x={x + cw / 2} y={STRIP_Y + 19} textAnchor="middle">
								{narrow ? '' : '['}
								<tspan className={s.cI}>{c.i}</tspan>
								{narrow ? '' : ']['}
								<tspan className={s.cJ}>{c.j}</tspan>
								{narrow ? '' : ']['}
								<tspan className={s.cK}>{c.k}</tspan>
								{narrow ? '' : ']'}
							</text>
							<text className={`${s.stripAddr} ${cur ? s.cellNumCur : ''}`} x={x + cw / 2} y={STRIP_Y + 37} textAnchor="middle">
								a+{m}
							</text>
						</g>
					);
				})}

				{/* How long each term stays the same */}
				<text className={`${s.rowLbl} ${s.cJ}`} x={STRIP_X - 10} y={BR1 + 22} textAnchor="end">
					j·K
				</text>
				{Array.from({ length: I * J }, (_, g) => {
					const x0 = STRIP_X + g * K * cw;
					const x1 = x0 + K * cw;
					const cur = Math.floor(n / K) === g;
					return (
						<g key={g} className={`${s.group} ${cur ? s.groupCur : ''}`}>
							<path className={`${s.bracket} ${s.strokeJ}`} d={bracket(x0, x1, BR1)} />
							<text className={s.cJ} x={(x0 + x1) / 2} y={BR1 + 24} textAnchor="middle">
								{(g % J) * K}
							</text>
						</g>
					);
				})}
				<text className={`${s.rowLbl} ${s.cI}`} x={STRIP_X - 10} y={BR2 + 22} textAnchor="end">
					i·J·K
				</text>
				{Array.from({ length: I }, (_, g) => {
					const x0 = STRIP_X + g * J * K * cw;
					const x1 = x0 + J * K * cw;
					const cur = i === g;
					return (
						<g key={g} className={`${s.group} ${cur ? s.groupCur : ''}`}>
							<path className={`${s.bracket} ${s.strokeI}`} d={bracket(x0, x1, BR2)} />
							<text className={s.cI} x={(x0 + x1) / 2} y={BR2 + 24} textAnchor="middle">
								{g * J * K}
							</text>
						</g>
					);
				})}
			</svg>
			<div className={s.legend}>
				<span className={s.lgCur}>a[i][j][k] being written</span>
				<span className={s.lgRow}>same i and j</span>
				<span className={s.lgLayer}>same i</span>
			</div>
		</div>
	);
}
