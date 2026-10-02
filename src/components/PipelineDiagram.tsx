// Pipeline diagram: instructions down, cycles across, the stage each instruction completes in each cycle.
// - mode "step": reveals one cycle at a time; share a syncId with <PipelineSim> to stay in sync.
// - mode "static": the whole diagram at once, no controls.
// - mode "loop": plays forever (e.g. to show instructions flowing through the pipe).
import { useEffect, useMemo } from 'react';
import { StepControls, useStepper } from './StepControls';
import { HazardToggle, useHazard } from './PipelineSim';
import { bypassArrows, cellAt, schedule, type Bypass, type PipeConfig } from './pipeline5';
import s from './PipelineDiagram.module.css';

interface Props {
	/** Instructions; or omit and pass `generic` for N independent placeholder instructions. */
	program?: string[];
	generic?: number;
	hazard?: PipeConfig['hazard'];
	bypass?: Bypass[];
	regs?: Record<string, number>;
	mem?: Record<number, number>;
	syncId?: string;
	hazardToggle?: boolean;
	mode?: 'step' | 'static' | 'loop';
	/** Number cycles as t, t+1, ... instead of 1, 2, ... */
	relative?: boolean;
	/** Draw at least this many cycle columns. */
	minCycles?: number;
	/** When this diagram first appears, switch the shared hazard mode to this (e.g. a "stalling" section). */
	activateHazard?: PipeConfig['hazard'];
}

const COL = 38;
const ROW = 32;
const HEAD = 30;

export default function PipelineDiagram({
	program,
	generic,
	hazard: initialHazard = 'stall',
	bypass = [],
	regs,
	mem,
	syncId,
	hazardToggle = false,
	mode = 'step',
	relative = false,
	minCycles = 0,
	activateHazard,
}: Props) {
	const [hazard, setHazard, getHazard] = useHazard(syncId, initialHazard);
	const lines = program ?? Array.from({ length: generic ?? 5 }, (_, k) => `add r1, r2 -> r${10 + k}`);
	const labels = program ? null : lines.map((_, k) => (k === 0 ? 'Insn i' : `Insn i+${k}`));
	const sch = useMemo(
		() => schedule(lines, { hazard, bypass: Object.fromEntries(bypass.map((b) => [b, true])), regs, mem }),
		[lines.join('|'), hazard, bypass.join('|'), JSON.stringify(regs), JSON.stringify(mem)],
	);
	const arrows = useMemo(() => bypassArrows(sch), [sch]);
	const ncols = Math.max(sch.cycles, minCycles);
	const stepper = useStepper(mode === 'loop' ? ncols : sch.cycles - 1, {
		intervalMs: mode === 'loop' ? 900 : 1400,
		syncId: mode === 'step' ? syncId : undefined,
		loop: mode === 'loop',
		autoplay: mode === 'loop',
	});
	useEffect(() => {
		if (activateHazard && getHazard() !== activateHazard) {
			setHazard(activateHazard);
			stepper.reset();
		}
	}, []);

	// In loop mode step 0 is an empty diagram, then cycles 1..ncols.
	const current = mode === 'static' ? Infinity : mode === 'loop' ? stepper.step : stepper.step + 1;

	// Registers on either end of a RAW dependence, highlighted in the instruction text.
	const rawRegs = useMemo(() => {
		const hits = sch.program.map(() => new Set<string>());
		sch.timings.forEach((t, j) =>
			t.operands.forEach((o) => {
				if (o.producer === null) return;
				hits[j].add(o.reg);
				hits[o.producer].add(`dest:${o.reg}`);
			}),
		);
		return hits;
	}, [sch]);

	const labelW = labels ? 90 : Math.max(...sch.program.map((p) => p.text.length)) * 7.6 + 20;
	const width = labelW + ncols * COL + 8;
	const height = HEAD + sch.program.length * ROW + 6;
	const colX = (c: number) => labelW + (c - 1) * COL;
	const rowY = (j: number) => HEAD + j * ROW;
	const inFlight =
		current >= 1 && current <= ncols ? sch.timings.filter((t, j) => cellAt(t, current) !== null).length : 0;

	return (
		<div className={`not-content ${s.root} ${mode === 'static' ? s.static : ''}`} {...(mode === 'step' ? stepper.keyProps : {})}>
			{mode === 'step' && (
				<StepControls stepper={stepper} counter={`cycle ${current}`}>
					{hazardToggle ? (
						<HazardToggle
							value={hazard}
							onChange={(h) => {
								setHazard(h);
								stepper.reset();
							}}
						/>
					) : undefined}
				</StepControls>
			)}
			{mode === 'loop' && (
				<StepControls stepper={stepper} reset={false} back={false} next={false} finish={false} speed={false}
					counter={inFlight ? `${inFlight} instruction${inFlight === 1 ? '' : 's'} in flight` : ' '} />
			)}

			<div className={s.scroll}>
				<svg className={s.svg} viewBox={`0 0 ${width} ${height}`} style={{ minWidth: `${Math.min(width, 560)}px` }} role="img" aria-label="Pipeline diagram">
					<defs>
						{(['MX', 'WX', 'WM'] as const).map((b) => (
							<marker key={b} id={`pdg-${b}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
								<path d="M0,0 L10,5 L0,10 z" className={s[`head${b}`]} />
							</marker>
						))}
					</defs>

					{/* Current-cycle column */}
					{current >= 1 && current <= ncols && <rect className={s.now} x={colX(current)} y={2} width={COL} height={height - 4} rx={5} />}

					{/* Header */}
					{Array.from({ length: ncols }, (_, k) => (
						<text key={k} className={`${s.head} ${k + 1 === current ? s.headNow : ''}`} x={colX(k + 1) + COL / 2} y={19} textAnchor="middle">
							{relative ? (k === 0 ? 't' : `t+${k}`) : k + 1}
						</text>
					))}
					<line className={s.axis} x1={labelW - 6} y1={HEAD - 2} x2={width} y2={HEAD - 2} />
					<line className={s.axis} x1={labelW - 6} y1={HEAD - 2} x2={labelW - 6} y2={height} />

					{sch.program.map((insn, j) => {
						const t = sch.timings[j];
						const y = rowY(j);
						const stale = t.operands.some((o) => o.source === 'stale');
						return (
							<g key={j}>
								<line className={s.grid} x1={labelW - 6} y1={y + ROW} x2={width} y2={y + ROW} />
								<text className={s.label} x={8} y={y + ROW / 2 + 4}>
									{labels ? labels[j] : <InsnText text={insn.text} dest={insn.dest} regs={rawRegs[j]} />}
								</text>
								{Array.from({ length: ncols }, (_, k) => {
									const c = k + 1;
									const cell = cellAt(t, c);
									if (!cell || c > current) return null;
									const staleRead = cell === 'D' && stale;
									const cls = [s.cell, cell === 'd*' && s.dstall, cell === 'p*' && s.pstall, staleRead && s.staleCell, c === current && s.cellNow]
										.filter(Boolean)
										.join(' ');
									return (
										<g key={c}>
											{(cell.endsWith('*') || staleRead) && (
												<rect className={`${s.cellBg} ${cell === 'd*' ? s.dstallBg : cell === 'p*' ? s.pstallBg : s.staleBg}`} x={colX(c) + 3} y={y + 4} width={COL - 6} height={ROW - 8} rx={4} />
											)}
											<text className={cls} x={colX(c) + COL / 2} y={y + ROW / 2 + 5} textAnchor="middle">
												{cell}
											</text>
										</g>
									);
								})}
							</g>
						);
					})}

					{/* Bypass arrows, drawn at the start of the cycle where the value is used */}
					{arrows
						.filter((a) => a.cycle <= current)
						.map((a, k) => {
							const x = colX(a.cycle) + 3;
							const y0 = rowY(a.from) + ROW / 2;
							const y1 = rowY(a.to) + ROW / 2 - 2;
							return (
								<g key={k} className={s[`arrow${a.kind}`]}>
									<circle cx={x} cy={y0} r={3} />
									<path d={`M${x},${y0} V${y1}`} markerEnd={`url(#pdg-${a.kind})`} />
								</g>
							);
						})}
				</svg>
			</div>

			{(hazard === 'stall' && sch.timings.some((t) => t.D > t.F + 1 || t.F > t.fEnter)) || sch.timings.some((t) => t.operands.some((o) => o.source === 'stale')) || arrows.length ? (
				<div className={s.legend}>
					{sch.timings.some((t) => t.D > t.F + 1) && <span><i className={s.lgD}>d*</i> data stall: waiting in D for a value</span>}
					{sch.timings.some((t) => t.F > t.fEnter) && <span><i className={s.lgP}>p*</i> propagated stall: stuck behind the stalled instruction</span>}
					{sch.timings.some((t) => t.operands.some((o) => o.source === 'stale')) && <span><i className={s.lgStale}>D</i> read a stale register value</span>}
					{(['MX', 'WX', 'WM'] as const)
						.filter((b) => arrows.some((a) => a.kind === b))
						.map((b) => (
							<span key={b}>
								<i className={`${s.lgArrow} ${s[`lg${b}`]}`} /> {b} bypass: value forwarded at the start of that cycle
							</span>
						))}
				</div>
			) : null}
		</div>
	);
}

/** Instruction text with registers that take part in a RAW dependence highlighted. */
function InsnText({ text, dest, regs }: { text: string; dest: string | null; regs: Set<string> }) {
	const [lhs, rhs] = text.split('→');
	const mark = (part: string, isDest: boolean) =>
		part.split(/(r\d+)/).map((tok, k) =>
			/^r\d+$/.test(tok) && (isDest ? tok === dest && regs.has(`dest:${tok}`) : regs.has(tok)) ? (
				<tspan key={k} className={s.dep}>
					{tok}
				</tspan>
			) : (
				tok
			),
		);
	// Stores have their source register on the left and the address on the right.
	return (
		<>
			{mark(lhs, false)}
			{rhs !== undefined && (
				<>
					→{mark(rhs, dest !== null)}
				</>
			)}
		</>
	);
}
