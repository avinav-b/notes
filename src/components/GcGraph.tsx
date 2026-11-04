// Memory as a graph: roots on the left, heap blocks as nodes, pointers as edges.
//   graph:     static picture of reachable vs garbage blocks (slide 23)
//   marksweep: mark (DFS from the roots) then sweep (scan blocks in heap order); toggle Baker's
//              variant, where the sweep walks only the allocated list (slides 24 to 27)
//   refcount:  reference counts through a short program, ending in a leaked cycle (slides 30, 31)
import { useId, useMemo, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './GcGraph.module.css';

type Variant = 'graph' | 'marksweep' | 'refcount';
interface Props {
	variant?: Variant;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const R = 17; // node radius

interface Pt {
	x: number;
	y: number;
}

/** Edge from a to b that stops at the node rims; `bend` curves it (for two-way edges). */
function edgePath(a: Pt, b: Pt, ra: number, rb: number, bend = 0) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len;
	const uy = dy / len;
	// Perpendicular offset for curved edges.
	const nx = -uy * bend;
	const ny = ux * bend;
	const x0 = a.x + ux * ra + nx * 0.35;
	const y0 = a.y + uy * ra + ny * 0.35;
	const x1 = b.x - ux * (rb + 3) + nx * 0.35;
	const y1 = b.y - uy * (rb + 3) + ny * 0.35;
	if (!bend) return `M${x0},${y0} L${x1},${y1}`;
	const mx = (a.x + b.x) / 2 + nx;
	const my = (a.y + b.y) / 2 + ny;
	return `M${x0},${y0} Q${mx},${my} ${x1},${y1}`;
}

function Markers({ mk }: { mk: string }) {
	const kinds = ['a', 'c', 'ok', 'g'];
	return (
		<defs>
			{kinds.map((k) => (
				<marker key={k} id={`${mk}-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s[`head_${k}`]} />
				</marker>
			))}
		</defs>
	);
}

// ---------------------------------------------------------------- shared heap graph (slides 23 to 27)

const ROOTS = [
	{ id: 'reg', label: 'register', x: 58, y: 66 },
	{ id: 'stack', label: 'stack', x: 58, y: 160 },
	{ id: 'glob', label: 'global', x: 58, y: 254 },
];
const NODES: Record<string, Pt> = {
	A: { x: 214, y: 66 },
	B: { x: 340, y: 40 },
	C: { x: 340, y: 124 },
	D: { x: 214, y: 160 },
	E: { x: 360, y: 216 },
	G: { x: 214, y: 254 },
	F: { x: 486, y: 64 },
	H: { x: 606, y: 108 },
	I: { x: 500, y: 226 },
	J: { x: 616, y: 236 },
};
interface Edge {
	from: string;
	to: string;
	bend?: number;
}
const EDGES: Edge[] = [
	{ from: 'reg', to: 'A' },
	{ from: 'stack', to: 'D' },
	{ from: 'glob', to: 'G' },
	{ from: 'A', to: 'B' },
	{ from: 'B', to: 'C' },
	{ from: 'C', to: 'A' },
	{ from: 'D', to: 'E' },
	{ from: 'G', to: 'E' },
	{ from: 'F', to: 'H', bend: 16 },
	{ from: 'H', to: 'F', bend: 16 },
	{ from: 'I', to: 'E' },
];
const REACHABLE = ['A', 'B', 'C', 'D', 'E', 'G'];
/** Heap blocks in address order; null = already free. */
const HEAP: (string | null)[] = ['A', 'F', null, 'B', 'D', null, 'H', 'C', 'E', null, 'J', 'I', null, 'G'];

const rootPt = (id: string) => ROOTS.find((r) => r.id === id)!;
const pt = (id: string): Pt => NODES[id] ?? rootPt(id);
const isRoot = (id: string) => ROOTS.some((r) => r.id === id);
const eKey = (e: Edge) => `${e.from}>${e.to}`;

type NodeState = 'alloc' | 'marked' | 'garbage' | 'freed';
interface GFrame {
	tag?: string;
	msg: string;
	nodes: Record<string, NodeState>;
	cur?: string; // node being visited
	curEdge?: string; // edge being followed
	skip?: boolean; // the visit hit an already-marked node
	cursor?: number; // sweep position (heap slot)
	visited: number[]; // heap slots the sweep has looked at
}

function buildMarkSweep(baker: boolean): GFrame[] {
	const nodes: Record<string, NodeState> = Object.fromEntries(Object.keys(NODES).map((k) => [k, 'alloc']));
	const frames: GFrame[] = [{ msg: 'Out of space: run the collector. Every block starts unmarked.', nodes: { ...nodes }, visited: [] }];

	// Mark: depth-first from each root, in order.
	const marked = new Set<string>();
	const visit = (from: string, to: string) => {
		const e = `${from}>${to}`;
		if (marked.has(to)) {
			frames.push({ tag: 'mark', msg: `${to} is already marked: return.`, nodes: { ...nodes }, cur: to, curEdge: e, skip: true, visited: [] });
			return;
		}
		marked.add(to);
		nodes[to] = 'marked';
		frames.push({
			tag: 'mark',
			msg: isRoot(from) ? `Start at a root: mark ${to}.` : `Follow ${from} → ${to}: mark ${to}.`,
			nodes: { ...nodes },
			cur: to,
			curEdge: e,
			visited: [],
		});
		for (const ed of EDGES) if (ed.from === to) visit(to, ed.to);
	};
	for (const r of ROOTS) for (const ed of EDGES) if (ed.from === r.id) visit(r.id, ed.to);

	for (const k of Object.keys(NODES)) if (!marked.has(k)) nodes[k] = 'garbage';
	frames.push({ tag: 'mark', msg: 'Mark done. Unmarked blocks are unreachable: garbage.', nodes: { ...nodes }, visited: [] });

	// Sweep: every heap slot in address order, or (Baker) only the allocated blocks.
	const visited: number[] = [];
	HEAP.forEach((b, i) => {
		if (baker && b === null) return;
		visited.push(i);
		let msg: string;
		if (b === null) msg = 'Already-free block: nothing to do.';
		else if (nodes[b] === 'marked') msg = `${b} is marked: keep.`;
		else {
			nodes[b] = 'freed';
			msg = `${b} is not marked: free it.`;
		}
		frames.push({ tag: 'sweep', msg, nodes: { ...nodes }, cursor: i, cur: b ?? undefined, visited: [...visited] });
	});
	frames.push({
		tag: 'sweep',
		msg: baker ? `Done after ${visited.length} visits: only allocated blocks.` : `Done after ${visited.length} visits: every block in the heap.`,
		nodes: { ...nodes },
		visited: [...visited],
	});
	return frames;
}

function HeapGraph({ f, mk, strip, baker }: { f: GFrame; mk: string; strip: boolean; baker?: boolean }) {
	const SY = 322;
	const SX0 = 120;
	const SW = 38;
	const SH = 34;
	const slotX = (i: number) => SX0 + i * (SW + 1);
	const H = strip ? (baker ? 396 : 378) : 290;
	const alive = (b: string | null) => b !== null && f.nodes[b] !== 'freed';
	const allocSlots = HEAP.map((b, i) => (alive(b) ? i : -1)).filter((i) => i >= 0);

	const edgeClass = (e: Edge) => {
		const src = isRoot(e.from) ? 'marked' : f.nodes[e.from];
		if (src === 'freed') return s.edgeGone;
		if (f.curEdge === eKey(e)) return f.skip ? s.edgeSkip : s.edgeCur;
		return undefined;
	};
	const head = (e: Edge) => {
		if (f.curEdge === eKey(e)) return 'c';
		return 'a';
	};

	return (
		<svg className={s.svg} viewBox={`0 0 680 ${H}`} role="img" aria-label="Heap as a graph of blocks and pointers">
			<Markers mk={mk} />
			<rect className={s.heapBox} x={112} y={10} width={560} height={276} rx={10} />
			<text className={s.section} x={124} y={28}>
				heap
			</text>
			<text className={s.section} x={18} y={28}>
				roots
			</text>

			{EDGES.map((e) => (
				<path
					key={eKey(e)}
					className={cx(s.edge, edgeClass(e))}
					d={edgePath(pt(e.from), pt(e.to), isRoot(e.from) ? 36 : R, R, e.bend)}
					markerEnd={`url(#${mk}-${head(e)})`}
				/>
			))}

			{ROOTS.map((r) => (
				<g key={r.id} className={s.root}>
					<rect x={r.x - 38} y={r.y - 14} width={76} height={28} rx={6} />
					<text x={r.x} y={r.y + 4.5} textAnchor="middle">
						{r.label}
					</text>
				</g>
			))}

			{Object.entries(NODES).map(([k, p]) => (
				<g key={k} className={cx(s.node, s[`n_${f.nodes[k]}`], f.cur === k && (f.skip ? s.nodeSkip : s.nodeCur))}>
					<circle cx={p.x} cy={p.y} r={R} />
					<text x={p.x} y={p.y + 5} textAnchor="middle">
						{k}
					</text>
				</g>
			))}

			{strip && (
				<g>
					<text className={s.section} x={18} y={SY + 22}>
						heap order
					</text>
					<text className={s.addr} x={SX0} y={SY - 8}>
						low address
					</text>
					<text className={s.addr} x={slotX(HEAP.length - 1) + SW} y={SY - 8} textAnchor="end">
						high address
					</text>
					{HEAP.map((b, i) => {
						const st: NodeState | 'free' = b === null ? 'free' : f.nodes[b];
						return (
							<g key={i} className={cx(s.slot, s[`s_${st}`], f.visited.includes(i) && s.slotVisited)}>
								<rect x={slotX(i)} y={SY} width={SW} height={SH} rx={3} />
								{b && st !== 'freed' && (
									<>
										<rect className={s.markBit} x={slotX(i) + 3} y={SY + 3} width={7} height={7} rx={1} />
										<text x={slotX(i) + SW / 2 + 2} y={SY + 23} textAnchor="middle">
											{b}
										</text>
									</>
								)}
								<rect className={s.visitTick} x={slotX(i) + 2} y={SY + SH + 4} width={SW - 4} height={4} rx={2} />
							</g>
						);
					})}
					{f.cursor !== undefined && (
						<rect
							className={s.cursor}
							style={{ transform: `translateX(${slotX(f.cursor) - 3}px)` }}
							x={0}
							y={SY - 3}
							width={SW + 6}
							height={SH + 6}
							rx={5}
						/>
					)}
					{baker &&
						allocSlots.slice(1).map((i, k) => {
							const a = slotX(allocSlots[k]) + SW / 2;
							const b = slotX(i) + SW / 2;
							const y = SY + SH + 13;
							return <path key={`al${i}`} className={s.allocLink} d={`M${a},${y} Q${(a + b) / 2},${y + 18} ${b - 3},${y + 2}`} markerEnd={`url(#${mk}-a)`} />;
						})}
					{baker && (
						<text className={s.addr} x={18} y={SY + SH + 26}>
							allocated list
						</text>
					)}
				</g>
			)}
		</svg>
	);
}

// ---------------------------------------------------------------- reference counting (slides 30, 31)

interface Row {
	code: string;
	ins?: boolean; // inserted by the compiler
}
const RC_ROWS: Row[] = [
	{ code: 'ptr p = new obj' },
	{ code: 'p.cnt++', ins: true },
	{ code: 'p.next = new obj' },
	{ code: 'p.next.cnt++', ins: true },
	{ code: 'ptr q = new obj' },
	{ code: 'q.cnt++', ins: true },
	{ code: 'p.cnt--', ins: true },
	{ code: 'if (p.cnt == 0) free p', ins: true },
	{ code: 'p = q' },
	{ code: 'q.cnt++', ins: true },
	{ code: 'q.next = new obj' },
	{ code: 'q.next.cnt++', ins: true },
	{ code: 'q.next.next = q' },
	{ code: 'q.cnt++', ins: true },
	{ code: 'p.cnt--', ins: true },
	{ code: 'p = null' },
	{ code: 'q.cnt--', ins: true },
	{ code: 'q = null' },
];

type Obj = 'A' | 'B' | 'C' | 'D';
interface RcFrame {
	msg: string;
	rows: number[];
	objs: Partial<Record<Obj, { cnt: number; freed?: boolean }>>;
	p: Obj | null;
	q: Obj | null;
	pDropped?: boolean; // p's old reference already counted down, assignment pending
	ptrs: [Obj, Obj][];
	changed?: Obj[];
	leak?: boolean;
}

const RC_FRAMES: RcFrame[] = [
	{ msg: 'Each block’s header counts the pointers to it.', rows: [], objs: {}, p: null, q: null, ptrs: [] },
	{ msg: 'New block A: count 1.', rows: [0, 1], objs: { A: { cnt: 1 } }, p: 'A', q: null, ptrs: [], changed: ['A'] },
	{ msg: 'A points to new block B: count 1.', rows: [2, 3], objs: { A: { cnt: 1 }, B: { cnt: 1 } }, p: 'A', q: null, ptrs: [['A', 'B']], changed: ['B'] },
	{ msg: 'New block C: count 1.', rows: [4, 5], objs: { A: { cnt: 1 }, B: { cnt: 1 }, C: { cnt: 1 } }, p: 'A', q: 'C', ptrs: [['A', 'B']], changed: ['C'] },
	{
		msg: 'p is about to move: A loses its only reference.',
		rows: [6],
		objs: { A: { cnt: 0 }, B: { cnt: 1 }, C: { cnt: 1 } },
		p: 'A',
		pDropped: true,
		q: 'C',
		ptrs: [['A', 'B']],
		changed: ['A'],
	},
	{
		msg: 'A hits 0: free it, and decrement what it points to.',
		rows: [7],
		objs: { A: { cnt: 0, freed: true }, B: { cnt: 0 }, C: { cnt: 1 } },
		p: 'A',
		pDropped: true,
		q: 'C',
		ptrs: [],
		changed: ['B'],
	},
	{
		msg: 'B hits 0 too: freed recursively.',
		rows: [7],
		objs: { A: { cnt: 0, freed: true }, B: { cnt: 0, freed: true }, C: { cnt: 1 } },
		p: 'A',
		pDropped: true,
		q: 'C',
		ptrs: [],
	},
	{ msg: 'p and q both point to C: count 2.', rows: [8, 9], objs: { C: { cnt: 2 } }, p: 'C', q: 'C', ptrs: [], changed: ['C'] },
	{ msg: 'C points to new block D.', rows: [10, 11], objs: { C: { cnt: 2 }, D: { cnt: 1 } }, p: 'C', q: 'C', ptrs: [['C', 'D']], changed: ['D'] },
	{
		msg: 'D points back to C: a cycle. C’s count is 3.',
		rows: [12, 13],
		objs: { C: { cnt: 3 }, D: { cnt: 1 } },
		p: 'C',
		q: 'C',
		ptrs: [
			['C', 'D'],
			['D', 'C'],
		],
		changed: ['C'],
	},
	{
		msg: 'Drop p: C’s count is 2.',
		rows: [14, 15],
		objs: { C: { cnt: 2 }, D: { cnt: 1 } },
		p: null,
		q: 'C',
		ptrs: [
			['C', 'D'],
			['D', 'C'],
		],
		changed: ['C'],
	},
	{
		msg: 'Nothing reaches C or D, yet both counts are 1: leaked.',
		rows: [16, 17],
		objs: { C: { cnt: 1 }, D: { cnt: 1 } },
		p: null,
		q: null,
		ptrs: [
			['C', 'D'],
			['D', 'C'],
		],
		changed: ['C'],
		leak: true,
	},
];

const RC_POS: Record<Obj, Pt> = { A: { x: 180, y: 62 }, B: { x: 330, y: 62 }, C: { x: 180, y: 182 }, D: { x: 330, y: 182 } };
const RC_VARS = { p: { x: 46, y: 62 }, q: { x: 46, y: 182 } };

function RefCount({ f, mk }: { f: RcFrame; mk: string }) {
	const varEdge = (name: 'p' | 'q', target: Obj | null, dashed: boolean) => {
		if (!target) return null;
		const a = RC_VARS[name];
		const b = RC_POS[target];
		const bend = name === 'p' && target === 'C' ? -34 : 0;
		const freed = f.objs[target]?.freed;
		return (
			<path
				key={name}
				className={cx(s.edge, (dashed || freed) && s.edgeDropped)}
				d={edgePath(a, b, 22, R + 1, bend)}
				markerEnd={`url(#${mk}-a)`}
			/>
		);
	};
	return (
		<svg className={s.rcSvg} viewBox="0 0 380 250" role="img" aria-label="Reference counts on heap blocks">
			<Markers mk={mk} />
			<rect className={s.heapBox} x={110} y={14} width={262} height={226} rx={10} />
			<text className={s.section} x={122} y={32}>
				heap
			</text>

			{f.leak && <rect className={s.leakBox} x={142} y={142} width={226} height={80} rx={12} />}
			{f.leak && (
				<text className={s.leakText} x={255} y={236} textAnchor="middle">
					garbage that refcounting never frees
				</text>
			)}

			{f.ptrs.map(([a, b]) => {
				const both = f.ptrs.some(([x, y]) => x === b && y === a);
				return (
					<path
						key={`${a}${b}`}
						className={cx(s.edge, f.leak && s.edgeGarbage)}
						d={edgePath(RC_POS[a], RC_POS[b], R + 1, R + 1, both ? 16 : 0)}
						markerEnd={`url(#${mk}-${f.leak ? 'g' : 'a'})`}
					/>
				);
			})}
			{varEdge('p', f.p, !!f.pDropped)}
			{varEdge('q', f.q, false)}

			{(['p', 'q'] as const).map((v) => (
				<g key={v} className={s.root}>
					<rect x={RC_VARS[v].x - 22} y={RC_VARS[v].y - 14} width={44} height={28} rx={6} />
					<text className={s.mono} x={RC_VARS[v].x} y={RC_VARS[v].y + 5} textAnchor="middle">
						{v}
					</text>
					{f[v] === null && (
						<text className={s.nullText} x={RC_VARS[v].x} y={RC_VARS[v].y + 30} textAnchor="middle">
							null
						</text>
					)}
				</g>
			))}

			{(Object.keys(RC_POS) as Obj[]).map((k) => {
				const o = f.objs[k];
				if (!o) return null;
				const p = RC_POS[k];
				const st = o.freed ? 'freed' : f.leak ? 'garbage' : o.cnt === 0 ? 'garbage' : 'alloc';
				const changed = f.changed?.includes(k);
				return (
					<g key={k} className={cx(s.node, s.nodeIn, s[`n_${st}`])}>
						<circle cx={p.x} cy={p.y} r={R + 1} />
						<text x={p.x} y={p.y + 5} textAnchor="middle">
							{k}
						</text>
						{!o.freed && (
							<g className={cx(s.count, changed && s.countChanged, o.cnt === 0 && s.countZero)}>
								<circle cx={p.x + 19} cy={p.y - 17} r={11} />
								<text x={p.x + 19} y={p.y - 12.5} textAnchor="middle">
									{o.cnt}
								</text>
							</g>
						)}
						{o.freed && (
							<text className={s.freedText} x={p.x} y={p.y + 34} textAnchor="middle">
								freed
							</text>
						)}
					</g>
				);
			})}
		</svg>
	);
}

// ---------------------------------------------------------------- shell

function Legend({ items }: { items: [string, string][] }) {
	return (
		<div className={s.legend}>
			{items.map(([cls, label]) => (
				<span key={cls} className={s[cls]}>
					{label}
				</span>
			))}
		</div>
	);
}

function MarkSweep({ mk }: { mk: string }) {
	const [baker, setBaker] = useState(false);
	const frames = useMemo(() => buildMarkSweep(baker), [baker]);
	const last = frames.length - 1;
	const stepper = useStepper(last, { intervalMs: 1100 });
	const step = Math.min(stepper.step, last);
	const f = frames[step];
	const pickMode = (b: boolean) => {
		if (b === baker) return;
		setBaker(b);
		// Switching mid-sweep would land on an unrelated frame; jump back to the end of the mark phase.
		const markEnd = frames.findIndex((fr) => fr.tag === 'sweep') - 1;
		if (step > markEnd) stepper.setStep(markEnd);
	};
	return (
		<div className={`not-content ${s.rootEl}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`step ${step} / ${last}`}>
				<div className={s.seg} role="group" aria-label="Sweep variant">
					<button className={cx('viz-btn', !baker && s.segOn)} onClick={() => pickMode(false)} aria-pressed={!baker}>
						Basic sweep
					</button>
					<button className={cx('viz-btn', baker && s.segOn)} onClick={() => pickMode(true)} aria-pressed={baker}>
						Baker
					</button>
				</div>
			</StepControls>
			<p className={s.message}>
				{f.tag && <span className={cx(s.tag, f.tag === 'sweep' && s.tagSweep)}>{f.tag}</span>}
				{f.msg}
			</p>
			<div className={s.figure}>
				<HeapGraph f={f} mk={mk} strip baker={baker} />
			</div>
			<div className={s.footer}>
				<Legend
					items={[
						['lgAlloc', 'allocated, unmarked'],
						['lgMarked', 'marked (reachable)'],
						['lgGarbage', 'garbage'],
						['lgFree', 'free'],
						['lgCur', 'visiting now'],
					]}
				/>
				<span className={s.badge}>
					sweep visits <b>{f.visited.length}</b> of {HEAP.length} heap blocks
				</span>
			</div>
		</div>
	);
}

function StaticGraph({ mk }: { mk: string }) {
	const nodes: Record<string, NodeState> = Object.fromEntries(Object.keys(NODES).map((k) => [k, REACHABLE.includes(k) ? 'marked' : 'garbage']));
	return (
		<div className={`not-content ${s.rootEl}`}>
			<div className={s.figure}>
				<HeapGraph f={{ msg: '', nodes, visited: [] }} mk={mk} strip={false} />
			</div>
			<div className={s.footer}>
				<Legend
					items={[
						['lgMarked', 'reachable from a root'],
						['lgGarbage', 'not reachable: garbage'],
					]}
				/>
			</div>
		</div>
	);
}

function RefCountDemo({ mk }: { mk: string }) {
	const last = RC_FRAMES.length - 1;
	const stepper = useStepper(last, { intervalMs: 1600 });
	const step = Math.min(stepper.step, last);
	const f = RC_FRAMES[step];
	return (
		<div className={`not-content ${s.rootEl}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`step ${step} / ${last}`} />
			<p className={s.message}>{f.msg}</p>
			<div className={s.rcLayout}>
				<ol className={s.code} aria-label="Program, with compiler-inserted count updates">
					{RC_ROWS.map((r, i) => (
						<li key={i} className={cx(r.ins && s.ins, f.rows.includes(i) && s.rowCur, f.rows.length > 0 && i < Math.min(...f.rows) && s.rowDone)}>
							{r.code}
						</li>
					))}
				</ol>
				<div className={s.rcFigure}>
					<RefCount f={f} mk={mk} />
				</div>
			</div>
			<div className={s.footer}>
				<Legend
					items={[
						['lgIns', 'inserted by compiler'],
						['lgAlloc', 'count > 0'],
						['lgCount', 'count just changed'],
						['lgGarbage', 'garbage'],
						['lgFree', 'freed'],
					]}
				/>
			</div>
		</div>
	);
}

export default function GcGraph({ variant = 'marksweep' }: Props) {
	const mk = `gc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
	if (variant === 'graph') return <StaticGraph mk={mk} />;
	if (variant === 'refcount') return <RefCountDemo mk={mk} />;
	return <MarkSweep mk={mk} />;
}
