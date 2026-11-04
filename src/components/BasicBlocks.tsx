// How a compiler sees a program.
//   variant 'cfg':      an IR listing is cut into basic blocks at its leaders, then joined by
//                       fall-through and branch edges into a control flow graph.
//   variant 'reaching': reaching definitions on a small if/else CFG.
import { StepControls, useStepper } from './StepControls';
import s from './BasicBlocks.module.css';

interface IrLine {
	label?: string;
	text: string;
	/** Label this instruction branches to. */
	target?: string;
}

interface Props {
	variant?: 'cfg' | 'reaching';
	program?: IrLine[];
}

const DEFAULT_IR: IrLine[] = [
	{ text: 'add …' },
	{ label: 'L1', text: 'add …' },
	{ text: 'add …' },
	{ text: 'branch L2', target: 'L2' },
	{ text: 'add …' },
	{ label: 'L2', text: 'add …' },
	{ text: 'branch L1', target: 'L1' },
	{ text: 'return …' },
];

export default function BasicBlocks({ variant = 'cfg', program = DEFAULT_IR }: Props) {
	return variant === 'reaching' ? <Reaching /> : <Cfg program={program} />;
}

// ---------------- CFG ----------------

// Branch curves reach left to about x = 180; leader reasons end near x = 590.
const VB_X = 160;
const VB_W = 440;
const BOX_X = 250;
const BOX_W = 210;
const ROW = 25;
const GAP = 36;
const TOP = 26;

function analyse(prog: IrLine[]) {
	const labelAt = new Map(prog.flatMap((l, i) => (l.label ? [[l.label, i] as const] : [])));
	const reason: (string | null)[] = prog.map(() => null);
	prog.forEach((l, i) => {
		if (i === 0) reason[i] = 'first instruction';
		if (l.label && prog.some((m) => m.target === l.label)) reason[i] = reason[i] ?? `branch target ${l.label}`;
		if (i > 0 && prog[i - 1].target) reason[i] = reason[i] ?? 'after a branch';
	});
	const block: number[] = [];
	let b = -1;
	prog.forEach((_, i) => {
		if (reason[i]) b++;
		block.push(b);
	});
	const nBlocks = b + 1;
	const first = Array.from({ length: nBlocks }, (_, k) => block.indexOf(k));
	const lastOf = Array.from({ length: nBlocks }, (_, k) => block.lastIndexOf(k));
	// Fall-through: block k to k+1, unless k ends in a return.
	const falls = Array.from({ length: nBlocks - 1 }, (_, k) => k).filter((k) => !/^return/.test(prog[lastOf[k]].text));
	const branches = prog.flatMap((l, i) => (l.target && labelAt.has(l.target) ? [{ from: i, to: labelAt.get(l.target)! }] : []));
	return { reason, block, nBlocks, first, lastOf, falls, branches };
}

function Cfg({ program }: { program: IrLine[] }) {
	const a = analyse(program);
	const last = 4;
	const stepper = useStepper(last, { intervalMs: 1600 });
	const step = stepper.step;
	const split = step >= 2;
	const rowY = (i: number) => TOP + i * ROW + (split ? a.block[i] * GAP : 0);
	const finalY = (i: number) => TOP + i * ROW + a.block[i] * GAP;
	const H = TOP + program.length * ROW + (a.nBlocks - 1) * GAP + 14;

	const messages = [
		'The IR is one long list of instructions.',
		'Leaders: the first instruction, branch targets, and after branches.',
		'A basic block runs from one leader up to the next.',
		'Fall-through edges: control just continues into the next block.',
		'Branch edges: control may jump to the target block.',
	];

	// Branch curves on the left; bigger spans get more room.
	const span = (e: { from: number; to: number }) => Math.abs(finalY(e.to) - finalY(e.from));
	const sorted = [...a.branches].sort((x, y) => span(x) - span(y));

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} speed={false} counter={`${step} / ${last}`} />
			<p className={s.message}>{messages[step]}</p>
			<svg className={`${s.svg} ${s.cfgSvg}`} viewBox={`${VB_X} 0 ${VB_W} ${H}`} role="img" aria-label="IR listing grouped into basic blocks with control flow edges">
				<defs>
					<marker id="bb-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
						<path d="M0,0 L10,5 L0,10 z" className={s.headFill} />
					</marker>
					<marker id="bb-head-cur" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
						<path d="M0,0 L10,5 L0,10 z" className={s.headCur} />
					</marker>
				</defs>

				{/* Basic block boxes */}
				{a.first.map((f, k) => {
					const y0 = finalY(f) - 18;
					const y1 = finalY(a.lastOf[k]) + 8;
					return (
						<g key={k} className={`${s.fade} ${split ? '' : s.hidden}`}>
							<rect className={s.block} x={BOX_X} y={y0} width={BOX_W} height={y1 - y0} rx={5} />
							<text className={s.blockName} x={BOX_X + BOX_W - 8} y={y0 + 14} textAnchor="end">
								B{k + 1}
							</text>
						</g>
					);
				})}
				{/* Before splitting: one box around everything */}
				<rect
					className={`${s.listing} ${s.fade} ${split ? s.hidden : ''}`}
					x={BOX_X}
					y={TOP - 18}
					width={BOX_W}
					height={program.length * ROW + 2}
					rx={5}
				/>

				{/* Instructions */}
				{program.map((l, i) => {
					const isLeader = !!a.reason[i];
					return (
						<g key={i} className={s.row} style={{ transform: `translateY(${rowY(i)}px)` }}>
							{isLeader && step >= 1 && <rect className={s.leaderMark} x={BOX_X + 1} y={-15} width={4} height={20} />}
							<text className={s.lbl} x={BOX_X + 44} y={0} textAnchor="end">
								{l.label ? `${l.label}:` : ''}
							</text>
							<text className={`${s.insn} ${isLeader && step >= 1 ? s.insnLeader : ''}`} x={BOX_X + 54} y={0}>
								{l.text}
							</text>
							{isLeader && (
								<text className={`${s.reason} ${s.fade} ${step >= 1 ? '' : s.hidden}`} x={BOX_X + BOX_W + 12} y={0}>
									{a.reason[i]}
								</text>
							)}
						</g>
					);
				})}

				{/* Fall-through edges */}
				{a.falls.map((k) => {
					const y0 = finalY(a.lastOf[k]) + 8;
					const y1 = finalY(a.first[k + 1]) - 18;
					return (
						<line
							key={k}
							className={`${s.edge} ${s.fall} ${s.fade} ${step >= 3 ? '' : s.hidden} ${step === 3 ? s.cur : ''}`}
							x1={BOX_X + BOX_W / 2}
							y1={y0}
							x2={BOX_X + BOX_W / 2}
							y2={y1 - 1}
							markerEnd={step === 3 ? 'url(#bb-head-cur)' : 'url(#bb-head)'}
						/>
					);
				})}

				{/* Branch edges */}
				{sorted.map((e, n) => {
					const x = BOX_X;
					const y0 = finalY(e.from) - 5;
					const y1 = finalY(e.to) - 5;
					const off = 46 + n * 46;
					return (
						<path
							key={`${e.from}-${e.to}`}
							className={`${s.edge} ${s.branch} ${s.fade} ${step >= 4 ? '' : s.hidden} ${step === 4 ? s.cur : ''}`}
							d={`M${x},${y0} C${x - off},${y0} ${x - off},${y1} ${x - 2},${y1}`}
							markerEnd={step === 4 ? 'url(#bb-head-cur)' : 'url(#bb-head)'}
						/>
					);
				})}
			</svg>
			<div className={s.legend}>
				<span className={s.lgLeader}>leader</span>
				<span className={s.lgFall}>fall-through</span>
				<span className={s.lgBranch}>branch</span>
			</div>
		</div>
	);
}

// ---------------- Reaching definitions ----------------

const RW = 480;

interface Box {
	id: string;
	cx: number;
	y: number;
	w: number;
	code: string;
	line: number;
}
const BOXES: Box[] = [
	{ id: 'BB1', cx: 240, y: 16, w: 200, code: 'if b==4 then', line: 1 },
	{ id: 'BB2', cx: 100, y: 128, w: 150, code: 'a = 5;', line: 2 },
	{ id: 'BB3', cx: 380, y: 128, w: 150, code: 'a = 3;', line: 4 },
	{ id: 'BB4', cx: 240, y: 288, w: 240, code: 'if a < 4 then ...', line: 6 },
];
const BH = 42;
const box = (id: string) => BOXES.find((b) => b.id === id)!;

function Reaching() {
	const last = 4;
	const stepper = useStepper(last, { intervalMs: 1700 });
	const step = stepper.step;
	const messages = [
		'Which assignments to a can reach line 6?',
		'BB2 creates definition 2: a = 5.',
		'BB3 creates definition 4: a = 3.',
		'Both reach BB4 along the CFG edges.',
		'a may be 5 or 3 at line 6.',
	];
	const b1 = box('BB1');
	const b2 = box('BB2');
	const b3 = box('BB3');
	const b4 = box('BB4');
	const edge = (from: Box, to: Box) => {
		const x0 = from.cx + (to.cx - from.cx) * 0.25;
		return `M${x0},${from.y + BH} C${x0},${from.y + BH + 40} ${to.cx},${to.y - 40} ${to.cx},${to.y - 2}`;
	};
	const toB4 = (from: Box) => {
		const x1 = b4.cx + (from.cx - b4.cx) * 0.3;
		return `M${from.cx},${from.y + BH} C${from.cx},${from.y + BH + 60} ${x1},${b4.y - 50} ${x1},${b4.y - 2}`;
	};

	// Definition chips: appear at the defining block's exit, then flow into BB4.
	const chip = (def: number, home: Box, show: number, side: number) => {
		const at = step >= 3 ? { x: b4.cx + side * 64, y: b4.y - 36 } : { x: home.cx, y: home.y + BH + 22 };
		return (
			<g className={`${s.chip} ${s['chip' + def]} ${step >= show ? '' : s.hidden}`} style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
				<rect x={-44} y={-12} width={88} height={22} rx={11} />
				<text x={0} y={4} textAnchor="middle">
					{`a=${def === 2 ? 5 : 3} (${def})`}
				</text>
			</g>
		);
	};

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} speed={false} counter={`${step} / ${last}`} />
			<p className={s.message}>{messages[step]}</p>
			<svg className={`${s.svg} ${s.narrow}`} viewBox={`0 0 ${RW} 362`} role="img" aria-label="Reaching definitions on an if/else control flow graph">
				<defs>
					<marker id="rd-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
						<path d="M0,0 L10,5 L0,10 z" className={s.headFill} />
					</marker>
				</defs>
				<path className={`${s.edge} ${s.fall}`} d={edge(b1, b2)} markerEnd="url(#rd-head)" />
				<path className={`${s.edge} ${s.fall}`} d={edge(b1, b3)} markerEnd="url(#rd-head)" />
				<path className={`${s.edge} ${s.fall} ${step === 3 ? s.cur2 : ''}`} d={toB4(b2)} markerEnd="url(#rd-head)" />
				<path className={`${s.edge} ${s.fall} ${step === 3 ? s.cur4 : ''}`} d={toB4(b3)} markerEnd="url(#rd-head)" />
				<text className={s.edgeLbl} x={b1.cx - 92} y={b1.y + BH + 34} textAnchor="end">
					then
				</text>
				<text className={s.edgeLbl} x={b1.cx + 92} y={b1.y + BH + 34}>
					else
				</text>

				{BOXES.map((b) => {
					const def = b.id === 'BB2' ? 2 : b.id === 'BB3' ? 4 : 0;
					const lit = (def === 2 && step >= 1) || (def === 4 && step >= 2);
					const use = b.id === 'BB4' && step >= 4;
					return (
						<g key={b.id}>
							<rect className={`${s.block} ${lit ? s['def' + def] : ''} ${use ? s.use : ''}`} x={b.cx - b.w / 2} y={b.y} width={b.w} height={BH} rx={5} />
							<text className={s.blockName} x={b.cx - b.w / 2} y={b.y - 5}>
								{b.id}
							</text>
							<text className={`${s.insn} ${s.insnBig}`} x={b.cx} y={b.y + 27} textAnchor="middle">
								<tspan className={s.lineNo}>{b.line}: </tspan>
								{b.code}
							</text>
						</g>
					);
				})}

				{chip(2, b2, 1, -1)}
				{chip(4, b3, 2, 1)}
				<text className={`${s.setLbl} ${s.fade} ${step >= 3 ? '' : s.hidden}`} x={b4.cx} y={b4.y + BH + 24} textAnchor="middle">
					IN[BB4] = {'{'} 2, 4 {'}'}
				</text>
			</svg>
			<div className={s.legend}>
				<span className={s.lgD2}>definition 2 (a = 5)</span>
				<span className={s.lgD4}>definition 4 (a = 3)</span>
			</div>
		</div>
	);
}
