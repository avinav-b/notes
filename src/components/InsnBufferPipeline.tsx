import { useMemo, useState, type ReactNode } from 'react';
import { StepControls, useStepper } from './StepControls';
import { isReg, parseInsn } from './isa';
import { simulate, type Mode, type PipeState, type Unit } from './pipelineSim';
import s from './InsnBufferPipeline.module.css';

interface Props {
	program?: string[];
	/** Ops that use the multi-cycle, unpipelined divider. Everything else uses a 1-cycle ALU. */
	slowOps?: string[];
	slowLatency?: number;
	bufferSize?: number;
}

// ---- Layout (SVG user units) ----
const VB_W = 730;
const VB_H = 262;
const ROW = 170; // y of the main pipeline row
const TW = 58; // token
const TH = 26;
const SW = 70; // stage box
const SH = 36;
const XW = 86; // X box
const X_TOP = 112;
const X_BOT = 228;
const SLOT_Y: Record<Unit, number> = { ALU: 142, DIV: 198 };
const REG_TOP = 104;
const REG_BOT = 236;
const BUF_Y = 60;
const BUF_SLOT = 64;
const DONE_Y0 = 56;
const DONE_DY = 30;

type El = 'F' | 'FD' | 'D' | 'D2' | 'DX' | 'X' | 'XM' | 'M' | 'MW' | 'W' | 'buf' | 'done';

const IN_OFF = 95; // centre the shorter in-order pipeline
const LAYOUT: Record<Mode, Record<El, number>> = {
	inorder: Object.fromEntries(
		Object.entries({ F: 40, FD: 87, D: 134, D2: 134, DX: 181, X: 233, XM: 285, M: 332, MW: 379, W: 426, buf: 134, done: 500 }).map(
			([k, v]) => [k, v + IN_OFF],
		),
	) as Record<El, number>,
	ooo: { F: 40, FD: 87, D: 134, D2: 314, DX: 361, X: 413, XM: 465, M: 512, MW: 559, W: 606, buf: 314, done: 686 },
};

// Connector stubs either side of each pipeline register (constant across modes).
const REGS: { el: El; left: number; right: number; label: Record<Mode, string> }[] = [
	{ el: 'FD', left: 12, right: 12, label: { inorder: 'F/D', ooo: 'F/D1' } },
	{ el: 'DX', left: 12, right: 9, label: { inorder: 'D/X', ooo: 'D2/X' } },
	{ el: 'XM', left: 9, right: 12, label: { inorder: 'X/M', ooo: 'X/M' } },
	{ el: 'MW', left: 12, right: 12, label: { inorder: 'M/W', ooo: 'M/W' } },
];

interface Pos {
	x: number;
	y: number;
	hidden?: boolean;
}

function where(st: PipeState, id: number, L: Record<El, number>, bufSize: number): Pos {
	if (st.F === id) return { x: L.F, y: ROW };
	if (st.D === id) return { x: L.D, y: ROW };
	const b = st.buf.indexOf(id);
	if (b >= 0) return { x: L.buf + (b - (bufSize - 1) / 2) * BUF_SLOT, y: BUF_Y };
	if (st.D2 === id) return { x: L.D2, y: ROW };
	for (const u of ['ALU', 'DIV'] as Unit[]) if (st.fu[u]?.id === id) return { x: L.X, y: SLOT_Y[u] };
	if (st.M === id) return { x: L.M, y: ROW };
	if (st.W === id) return { x: L.W, y: ROW };
	const r = st.retired.indexOf(id);
	if (r >= 0) return { x: L.done, y: DONE_Y0 + r * DONE_DY };
	return { x: L.F - 50, y: ROW, hidden: true };
}

const at = (x: number, y = 0) => ({ transform: `translate(${x}px, ${y}px)` });

export default function InsnBufferPipeline({
	program = [
		'div r2,r3 -> r1',
		'add r1,r5 -> r4',
		'sub r7,r8 -> r6',
		'and r6,r2 -> r9',
		'addi r7,1 -> r11',
		'xor r8,r3 -> r12',
		'or r4,r9 -> r10',
	],
	slowOps = ['div', 'mul'],
	slowLatency = 6,
	bufferSize = 4,
}: Props) {
	const prog = useMemo(() => program.map(parseInsn), [program.join('|')]);
	const producers = useMemo(
		() =>
			prog.map((insn, i) =>
				insn.srcs
					.filter(isReg)
					.map((r) => prog.slice(0, i).findLastIndex((p) => p.dest === r))
					.filter((p) => p >= 0),
			),
		[prog],
	);
	const unitOf = (i: number): Unit => (slowOps.includes(prog[i].op) ? 'DIV' : 'ALU');
	const runs = useMemo(() => {
		const cfg = { producers, unitOf, latency: { ALU: 1, DIV: slowLatency }, bufferSize };
		return {
			inorder: simulate(prog.length, { ...cfg, mode: 'inorder' }),
			ooo: simulate(prog.length, { ...cfg, mode: 'ooo' }),
		};
	}, [prog, producers, slowOps.join('|'), slowLatency, bufferSize]);

	const [mode, setMode] = useState<Mode>('inorder');
	const hist = runs[mode];
	const last = hist.length - 1;
	const stepper = useStepper(last, { intervalMs: 850 });
	const t = Math.min(stepper.step, last);
	const cur = hist[t];
	const L = LAYOUT[mode];
	const ooo = mode === 'ooo';

	const switchMode = (m: Mode) => {
		setMode(m);
		stepper.reset();
	};

	const leftX = (p: number) => cur.M === p || cur.W === p || cur.retired.includes(p);
	const waitingOn = (i: number) => producers[i].filter((p) => !leftX(p));

	// Classify a token for styling: waiting on a RAW dependence, stuck behind something, or ready.
	const status = (i: number): 'waiting' | 'blocked' | 'ready' | null => {
		if (cur.buf.includes(i)) return waitingOn(i).length ? 'waiting' : 'ready';
		if (cur.F !== i && cur.D !== i && cur.D2 !== i) return null;
		const next = hist[Math.min(t + 1, last)];
		const stuck = t < last && where(next, i, L, bufferSize).x === where(cur, i, L, bufferSize).x;
		if (!stuck) return null;
		const issueStage = ooo ? cur.D2 === i : cur.D === i;
		return issueStage && waitingOn(i).length ? 'waiting' : 'blocked';
	};

	const stage = (el: El, label: string, extra?: ReactNode, visible = true) => (
		<g className={s.move} style={{ ...at(L[el]), opacity: visible ? 1 : 0 }}>
			<rect className={s.stage} x={-SW / 2} y={ROW - SH / 2} width={SW} height={SH} rx={6} />
			<text className={s.stageLabel} x={-SW / 2} y={ROW - SH / 2 - 6}>
				{label}
			</text>
			{extra}
		</g>
	);

	const div = cur.fu.DIV;

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`cycle ${cur.cycle}`}>
				<div className={s.toggle} role="group" aria-label="Pipeline organisation">
					<button className={!ooo ? 'viz-primary' : undefined} onClick={() => switchMode('inorder')}>
						In-order issue
					</button>
					<button className={ooo ? 'viz-primary' : undefined} onClick={() => switchMode('ooo')}>
						Out-of-order issue
					</button>
				</div>
			</StepControls>

			<p className={s.caption}>
				{ooo ? (
					<>
						<b>D is split around an instruction buffer.</b> D1 fills the buffer in program order; D2 sends any
						instruction whose operands are ready on to X.
					</>
				) : (
					<>
						<b>Classic 5-stage pipeline.</b> D sends instructions to X strictly in program order, so one stalled
						on a RAW dependence holds up everything behind it.
					</>
				)}
			</p>

			<svg className={s.svg} viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={ooo ? 'Pipeline with decode split into D1 and D2 around an instruction buffer' : 'Classic five-stage pipeline'}>
				<defs>
					<marker id="ibp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
						<path d="M0,0 L10,5 L0,10 z" className={s.arrowHead} />
					</marker>
				</defs>

				{/* Instruction buffer (out-of-order only), with its wiring from D1 and into D2 */}
				<g className={s.move} style={{ ...at(L.buf), opacity: ooo ? 1 : 0 }}>
					<text className={s.stageLabel} x={-(bufferSize * BUF_SLOT) / 2} y={BUF_Y - 30}>
						insn buffer <tspan className={s.stageSub}>· oldest on the left</tspan>
					</text>
					{Array.from({ length: bufferSize }, (_, k) => (
						<rect
							key={k}
							className={s.slot}
							x={(k - (bufferSize - 1) / 2) * BUF_SLOT - BUF_SLOT / 2 + 2}
							y={BUF_Y - 20}
							width={BUF_SLOT - 4}
							height={40}
							rx={5}
						/>
					))}
					{/* D1 → buffer (D1 sits 180 units left of the buffer centre) */}
					<path
						className={`${s.wire} ${s.wireIn}`}
						d={`M${LAYOUT.ooo.D - LAYOUT.ooo.buf + SW / 2},${ROW} h11 V${BUF_Y} H${-(bufferSize * BUF_SLOT) / 2}`}
						markerEnd="url(#ibp-arrow)"
					/>
					{/* buffer → D2 */}
					<path className={`${s.wire} ${s.wireOut}`} d={`M0,${BUF_Y + 21} V${ROW - SH / 2 - 1}`} markerEnd="url(#ibp-arrow)" />
				</g>

				{/* Pipeline registers */}
				{REGS.map((r) => (
					<g key={r.el} className={s.move} style={at(L[r.el])}>
						<line className={s.wire} x1={-r.left} y1={ROW} x2={-3} y2={ROW} />
						<line className={s.wire} x1={3} y1={ROW} x2={r.right - 1} y2={ROW} markerEnd="url(#ibp-arrow)" />
						<rect className={s.reg} x={-3} y={REG_TOP} width={6} height={REG_BOT - REG_TOP} rx={2} />
						<text className={s.regLabel} x={0} y={REG_BOT + 14} textAnchor="middle">
							{r.label[mode]}
						</text>
					</g>
				))}

				{stage('F', 'F')}
				{stage('D', ooo ? 'D1' : 'D')}
				{stage('D2', 'D2', null, ooo)}

				{/* X: ALU and divider side by side in one stage */}
				<g className={s.move} style={at(L.X)}>
					<rect className={s.stage} x={-XW / 2} y={X_TOP} width={XW} height={X_BOT - X_TOP} rx={8} />
					<text className={s.stageLabel} x={-XW / 2} y={X_TOP - 6}>
						X
					</text>
					{(['ALU', 'DIV'] as Unit[]).map((u) => (
						<g key={u}>
							<rect className={s.fuSlot} x={-TW / 2 - 4} y={SLOT_Y[u] - TH / 2 - 3} width={TW + 8} height={TH + 6} rx={6} />
							<text className={s.fuLabel} x={0} y={SLOT_Y[u] + 4} textAnchor="middle">
								{u}
							</text>
						</g>
					))}
					<text className={s.divNote} x={0} y={(SLOT_Y.ALU + SLOT_Y.DIV) / 2 + 4} textAnchor="middle">
						{div ? `${div.left} cycle${div.left === 1 ? '' : 's'} left` : `${slowLatency}-cycle DIV`}
					</text>
					{div && (
						<rect
							className={s.divBar}
							x={-TW / 2 - 4}
							y={SLOT_Y.DIV + TH / 2 + 5}
							height={3}
							width={((slowLatency - div.left) / slowLatency) * (TW + 8)}
						/>
					)}
				</g>

				{stage('M', 'M')}
				{stage('W', 'W')}

				<g className={s.move} style={at(L.done)}>
					<text className={s.stageLabel} x={-TW / 2} y={DONE_Y0 - 22}>
						done
					</text>
				</g>

				{/* Instruction tokens */}
				{prog.map((insn, i) => {
					const p = where(cur, i, L, bufferSize);
					const st = status(i);
					const waits = st === 'waiting' ? waitingOn(i) : [];
					const done = cur.retired.includes(i);
					return (
						<g
							key={i}
							className={[s.token, st && s[st], done && s.doneTok].filter(Boolean).join(' ')}
							style={{ ...at(p.x, p.y), opacity: p.hidden ? 0 : 1 }}
						>
							<rect x={-TW / 2} y={-TH / 2} width={TW} height={TH} rx={6} />
							<text y={4} textAnchor="middle">
								I{i + 1} {insn.op}
							</text>
							{waits.length > 0 && (
								<text className={s.waitTag} y={TH / 2 + 11} textAnchor="middle">
									needs {waits.map((w) => `I${w + 1}`).join(',')}
								</text>
							)}
						</g>
					);
				})}
			</svg>

			<div className={s.legend}>
				<span><i className={s.legendWaiting} /> waiting on an older result (RAW)</span>
				<span><i className={s.legendBlocked} /> stuck behind another instruction</span>
				{ooo && <span><i className={s.legendReady} /> in buffer, ready to go</span>}
			</div>

			<div className={s.tableWrap}>
				<table className={s.table}>
					<thead>
						<tr>
							<th>#</th>
							<th>instruction</th>
							<th>reads result of</th>
							<th>enters X</th>
							<th>leaves W</th>
						</tr>
					</thead>
					<tbody>
						{prog.map((insn, i) => (
							<tr key={i}>
								<td>I{i + 1}</td>
								<td className={s.mono}>{insn.text.replace('->', '→')}</td>
								<td>{producers[i].map((p) => `I${p + 1}`).join(', ') || '–'}</td>
								<td>{cur.enteredX[i] ?? ''}</td>
								<td>{cur.leftW[i] ?? ''}</td>
							</tr>
						))}
					</tbody>
				</table>
				<p className={s.summary}>
					All done in <b>{runs.inorder.at(-1)!.cycle}</b> cycles in order vs <b>{runs.ooo.at(-1)!.cycle}</b> out of
					order, even though splitting D makes the pipeline one stage longer: the independent instructions run
					while the divide is busy.
				</p>
			</div>
		</div>
	);
}
