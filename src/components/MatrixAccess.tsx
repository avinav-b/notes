// Array access patterns on a tiny cache: blocks of 2 ints, fully associative, LRU. Each step is one
// access; the element flashes hit or miss, its block slides into the cache, and the miss rate bar grows.
// The flat "in memory" row shows how a 2D array is laid out (row-major), which is what the cache sees.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './MatrixAccess.module.css';

interface Arr {
	name: string;
	rows: number;
	cols: number;
	/** Value written in the first element (the slides number elements 1, 2, 3, ...). */
	base: number;
}
interface Ref {
	a: number; // array index
	r: number;
	c: number;
	vars: string;
}
interface Preset {
	label: string;
	code: string;
	arrays: Arr[];
	slots: number;
	trace: Ref[];
	formula: string;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function makePresets(): Record<string, Preset> {
	const A = (rows: number, cols: number): Arr => ({ name: 'A', rows, cols, base: 1 });
	const rowOrder = (rows: number, cols: number) =>
		range(rows).flatMap((i) => range(cols).map((j) => ({ a: 0, r: i, c: j, vars: `i = ${i}, j = ${j}` })));
	const colOrder = (rows: number, cols: number, swap = false) =>
		range(cols).flatMap((j) => range(rows).map((i) => ({ a: 0, r: i, c: j, vars: swap ? `i = ${j}, j = ${i}` : `j = ${j}, i = ${i}` })));
	return {
		seq: {
			label: 'One pass',
			code: 'int A[N];  // N = 4\nfor (i = 0; i < N; i++)\n  … = A[i];',
			arrays: [A(1, 4)],
			slots: 2,
			trace: range(4).map((i) => ({ a: 0, r: 0, c: i, vars: `i = ${i}` })),
			formula: '(N/2) / N = 50%',
		},
		'outer-fits': {
			label: 'Reuse (fits)',
			code: '// N = 4, P = 3\nfor (k = 0; k < P; k++)\n  for (i = 0; i < N; i++)\n    … = A[i];',
			arrays: [A(1, 4)],
			slots: 2,
			trace: range(3).flatMap((k) => range(4).map((i) => ({ a: 0, r: 0, c: i, vars: `k = ${k}, i = ${i}` }))),
			formula: '(N/2) / (N·P) = 1/(2P) = 17%',
		},
		'outer-nofit': {
			label: "Reuse (doesn't fit)",
			code: '// N = 8, P = 2\nfor (k = 0; k < P; k++)\n  for (i = 0; i < N; i++)\n    … = A[i];',
			arrays: [A(1, 8)],
			slots: 2,
			trace: range(2).flatMap((k) => range(8).map((i) => ({ a: 0, r: 0, c: i, vars: `k = ${k}, i = ${i}` }))),
			formula: '(N/2) / N = 50%',
		},
		'row-fits': {
			label: 'Row order (fits)',
			code: 'for (i = 0; i < 2; i++)\n  for (j = 0; j < 2; j++)\n    … = A[i][j];',
			arrays: [A(2, 2)],
			slots: 2,
			trace: rowOrder(2, 2),
			formula: '(N²/2) / N² = 50%',
		},
		'row-nofit': {
			label: "Row order (doesn't fit)",
			code: 'for (i = 0; i < 2; i++)\n  for (j = 0; j < 4; j++)\n    … = A[i][j];',
			arrays: [A(2, 4)],
			slots: 2,
			trace: rowOrder(2, 4),
			formula: '(N²/2) / N² = 50%',
		},
		'col-fits': {
			label: 'Column order (column fits)',
			code: 'for (j = 0; j < 4; j++)\n  for (i = 0; i < 2; i++)\n    … = A[i][j];',
			arrays: [A(2, 4)],
			slots: 2,
			trace: colOrder(2, 4),
			formula: '(N²/2) / N² = 50%',
		},
		'col-nofit': {
			label: "Column order (column doesn't fit)",
			code: 'for (j = 0; j < 4; j++)\n  for (i = 0; i < 4; i++)\n    … = A[i][j];',
			arrays: [A(4, 4)],
			slots: 2,
			trace: colOrder(4, 4),
			formula: 'N² / N² = 100%',
		},
		'interchange-before': {
			label: 'Before (i outer)',
			code: 'for (i = 0; i < N; i++)\n  for (j = 0; j < N; j++)\n    A[j][i] = i * j;',
			arrays: [A(4, 4)],
			slots: 2,
			trace: colOrder(4, 4, true),
			formula: 'column order: 100%',
		},
		'interchange-after': {
			label: 'After (j outer)',
			code: 'for (j = 0; j < N; j++)\n  for (i = 0; i < N; i++)\n    A[j][i] = i * j;',
			arrays: [A(4, 4)],
			slots: 2,
			trace: range(4).flatMap((j) => range(4).map((i) => ({ a: 0, r: j, c: i, vars: `j = ${j}, i = ${i}` }))),
			formula: 'row order: 50%',
		},
		matmul: {
			label: 'A × B',
			code: 'for (i = 0; i < N; i++)\n  for (j = 0; j < N; j++)\n    for (k = 0; k < N; k++)\n      … = A[i][k] * B[k][j];',
			arrays: [
				{ name: 'A', rows: 4, cols: 4, base: 1 },
				{ name: 'B', rows: 4, cols: 4, base: 17 },
			],
			slots: 4,
			trace: range(2).flatMap((j) =>
				range(4).flatMap((k) => [
					{ a: 0, r: 0, c: k, vars: `i = 0, j = ${j}, k = ${k}` },
					{ a: 1, r: k, c: j, vars: `i = 0, j = ${j}, k = ${k}` },
				]),
			),
			formula: '6 misses per 8 accesses = 75%',
		},
	};
}
const PRESETS = makePresets();

interface Slot {
	block: string | null;
	t: number;
}
interface Frame {
	k: number; // access index (-1 = start)
	slots: Slot[];
	hit: boolean | null;
	slot: number; // slot touched
	victim: string | null;
	last: Record<string, 'hit' | 'miss'>; // cell key -> last outcome
	misses: number;
	outcomes: boolean[]; // true = hit
}

const cellKey = (a: number, r: number, c: number) => `${a}:${r}:${c}`;
const blockOf = (arr: Arr[], ref: { a: number; r: number; c: number }) => `${ref.a}:${Math.floor((ref.r * arr[ref.a].cols + ref.c) / 2)}`;

function simulate(p: Preset): Frame[] {
	let slots: Slot[] = range(p.slots).map(() => ({ block: null, t: 0 }));
	let last: Record<string, 'hit' | 'miss'> = {};
	let misses = 0;
	const outcomes: boolean[] = [];
	const frames: Frame[] = [{ k: -1, slots, hit: null, slot: -1, victim: null, last, misses, outcomes: [] }];
	p.trace.forEach((ref, k) => {
		const t = k + 1; // the slides' "Time" column
		const b = blockOf(p.arrays, ref);
		let slot = slots.findIndex((x) => x.block === b);
		const hit = slot >= 0;
		let victim: string | null = null;
		slots = slots.map((x) => ({ ...x }));
		if (!hit) {
			slot = slots.findIndex((x) => x.block === null);
			if (slot < 0) {
				slot = 0;
				slots.forEach((x, n) => {
					if (x.t < slots[slot].t) slot = n;
				});
				victim = slots[slot].block;
			}
			slots[slot].block = b;
			misses++;
		}
		slots[slot].t = t;
		last = { ...last, [cellKey(ref.a, ref.r, ref.c)]: hit ? 'hit' : 'miss' };
		outcomes.push(hit);
		frames.push({ k, slots, hit, slot, victim, last, misses, outcomes: [...outcomes] });
	});
	return frames;
}

function useNarrow(ref: RefObject<HTMLElement | null>, below = 540) {
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < below));
		ro.observe(el);
		return () => ro.disconnect();
	}, [below]);
	return narrow;
}

export default function MatrixAccess({ presets = ['seq', 'outer-fits', 'outer-nofit'] }: { presets?: string[] }) {
	const list = presets.filter((id) => PRESETS[id]);
	const [pi, setPi] = useState(0);
	const p = PRESETS[list[Math.min(pi, list.length - 1)]];
	const frames = useMemo(() => simulate(p), [p]);
	const last = frames.length - 1;
	const stepper = useStepper(last, { intervalMs: 900 });
	const f = frames[Math.min(stepper.step, last)];
	const ref = f.k >= 0 ? p.trace[f.k] : null;
	const rootRef = useRef<HTMLDivElement>(null);
	const narrow = useNarrow(rootRef);

	// ---- layout ----
	const W = narrow ? 360 : 680;
	const C = p.arrays.some((a) => a.cols > 4) ? (narrow ? 38 : 40) : narrow ? 32 : 40; // matrix cell size
	const show2D = p.arrays.some((a) => a.rows > 1);
	const gridTop = 26;
	const gridX = (ai: number) => 8 + ai * (p.arrays[0].cols * C + (narrow ? 26 : 40));
	const gridsW = gridX(p.arrays.length - 1) + p.arrays[p.arrays.length - 1].cols * C;
	const gridsH = Math.max(...p.arrays.map((a) => a.rows)) * C;
	// cache panel: right of the grids (wide) or below them (narrow)
	const SLOT_W = 92;
	const SLOT_H = 32;
	const cacheX = narrow ? 8 : W - 8 - SLOT_W - 50;
	const cacheTop = narrow ? gridTop + gridsH + 34 : gridTop;
	const slotPos = (n: number) =>
		narrow
			? { x: cacheX + (n % 2) * (SLOT_W + 80), y: cacheTop + Math.floor(n / 2) * (SLOT_H + 10) }
			: { x: cacheX, y: cacheTop + n * (SLOT_H + 10) };
	const cacheBottom = narrow ? cacheTop + Math.ceil(p.slots / 2) * (SLOT_H + 10) : cacheTop + p.slots * (SLOT_H + 10);
	// flat memory rows
	const memCell = narrow ? Math.min(20, (W - 16) / Math.max(...p.arrays.map((a) => a.rows * a.cols))) : 24;
	const memTop = (narrow ? cacheBottom : Math.max(gridTop + gridsH, cacheBottom)) + 34;
	const memRowH = memCell + 34;
	const memBottom = show2D ? memTop + p.arrays.length * memRowH : memTop - 34;
	const barTop = memBottom + (show2D ? 0 : 22);
	const H = barTop + 64;

	const cellXY = (a: number, r: number, c: number) => ({ x: gridX(a) + c * C, y: gridTop + r * C });
	const value = (a: number, r: number, c: number) => p.arrays[a].base + r * p.arrays[a].cols + c;
	const blockCells = (b: string) => {
		const [a, n] = b.split(':').map(Number);
		const cols = p.arrays[a].cols;
		return [0, 1].map((d) => {
			const idx = n * 2 + d;
			return { a, r: Math.floor(idx / cols), c: idx % cols };
		});
	};
	const blockText = (b: string) =>
		blockCells(b)
			.map((x) => value(x.a, x.r, x.c))
			.join('  ');
	const cached = new Set(f.slots.map((x) => x.block).filter(Boolean) as string[]);
	const curKey = ref ? cellKey(ref.a, ref.r, ref.c) : '';
	const full = f.slots.every((x) => x.block);
	let lru = -1;
	if (full) {
		lru = 0;
		f.slots.forEach((x, n) => {
			if (x.t < f.slots[lru].t) lru = n;
		});
	}

	const accesses = f.k + 1;
	const rate = accesses ? f.misses / accesses : 0;
	const name = ref ? `${p.arrays[ref.a].name}${p.arrays[ref.a].rows > 1 ? `[${ref.r}][${ref.c}]` : `[${ref.c}]`}` : '';
	const message = !ref
		? `Cache: ${p.slots} blocks of 2 ints, LRU. Empty.`
		: f.hit
			? `${name}: hit, its block is already in the cache.`
			: f.victim
				? `${name}: miss, evicts block ${blockText(f.victim)}.`
				: `${name}: miss, block loaded into an empty slot.`;

	const cellCls = (a: number, r: number, c: number) => {
		const k = cellKey(a, r, c);
		return [s.cell, f.last[k] === 'hit' && s.cellHit, f.last[k] === 'miss' && s.cellMiss, k === curKey && s.cellCur].filter(Boolean).join(' ');
	};

	// fly-in source for the block just loaded
	const flyFrom = !f.hit && ref ? cellXY(ref.a, ref.r, ref.c - (((ref.r * p.arrays[ref.a].cols + ref.c) % 2) as number)) : null;

	return (
		<div ref={rootRef} className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`access ${accesses} / ${p.trace.length}`}>
				{list.length > 1 &&
					list.map((id, n) => (
						<button key={id} className={`viz-btn ${n === pi ? s.modeOn : ''}`} aria-pressed={n === pi} onClick={() => {
							setPi(n);
							stepper.reset();
						}}>
							{PRESETS[id].label}
						</button>
					))}
			</StepControls>

			<div className={s.top}>
				<pre className={s.code}>{p.code}</pre>
				<div className={s.side}>
					<p className={s.message}>{message}</p>
					<p className={s.vars}>{ref ? ref.vars : ' '}</p>
				</div>
			</div>

			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Array elements, cache slots and miss rate">
				{/* ---- matrices ---- */}
				{p.arrays.map((arr, a) => (
					<g key={arr.name}>
						<text className={s.section} x={gridX(a)} y={gridTop - 10}>
							{arr.name}
						</text>
						{range(arr.rows).map((r) =>
							range(arr.cols).map((c) => {
								const { x, y } = cellXY(a, r, c);
								return (
									<g key={`${r}:${c}`} className={cellCls(a, r, c)}>
										<rect x={x + 3} y={y + 5} width={C - 6} height={C - 10} rx={4} />
										<text x={x + C / 2} y={y + C / 2 + 4.5} textAnchor="middle">
											{value(a, r, c)}
										</text>
									</g>
								);
							}),
						)}
						{/* block outlines: pairs of elements */}
						{range((arr.rows * arr.cols) / 2).map((n) => {
							const b = `${a}:${n}`;
							const r = Math.floor((n * 2) / arr.cols);
							const c = (n * 2) % arr.cols;
							const { x, y } = cellXY(a, r, c);
							return (
								<rect
									key={b}
									className={`${s.block} ${cached.has(b) ? s.blockCached : ''}`}
									x={x + 0.5}
									y={y + 2}
									width={2 * C - 1}
									height={C - 4}
									rx={7}
								/>
							);
						})}
					</g>
				))}

				{/* ---- cache ---- */}
				<text className={s.section} x={cacheX} y={cacheTop - 10}>
					cache
				</text>
				{!narrow && (
					<text className={s.colHead} x={cacheX + SLOT_W + 10} y={cacheTop - 10}>
						time
					</text>
				)}
				{f.slots.map((slot, n) => {
					const { x, y } = slotPos(n);
					const touched = n === f.slot;
					const cls = [s.slot, slot.block && s.slotFull, touched && f.hit && s.slotHit, touched && f.hit === false && s.slotMiss]
						.filter(Boolean)
						.join(' ');
					const fly = touched && f.hit === false && flyFrom;
					return (
						<g key={n} className={cls}>
							<rect x={x} y={y} width={SLOT_W} height={SLOT_H} rx={6} />
							{slot.block && (
								<g
									key={fly ? `fly${stepper.step}` : 'still'}
									className={fly ? s.fly : undefined}
									style={
										fly
											? ({ '--dx': `${flyFrom.x + C - (x + SLOT_W / 2)}px`, '--dy': `${flyFrom.y + C / 2 - (y + SLOT_H / 2)}px` } as CSSProperties)
											: undefined
									}
								>
									<text className={s.slotText} x={x + SLOT_W / 2} y={y + SLOT_H / 2 + 5} textAnchor="middle">
										{blockText(slot.block)}
									</text>
								</g>
							)}
							{touched && f.victim && (
								<text key={`v${stepper.step}`} className={s.victim} x={x + SLOT_W / 2} y={y + SLOT_H / 2 + 5} textAnchor="middle">
									{blockText(f.victim)}
								</text>
							)}
							{slot.block && (
								<text className={`${s.time} ${touched ? s.timeOn : ''}`} x={x + SLOT_W + 10} y={y + SLOT_H / 2 + 5}>
									t={slot.t}
								</text>
							)}
							{n === lru && (
								<text className={s.lru} x={x + SLOT_W + 10} y={y + SLOT_H / 2 + 19}>
									LRU
								</text>
							)}
						</g>
					);
				})}

				{/* ---- flat memory (row-major) ---- */}
				{show2D &&
					p.arrays.map((arr, a) => {
						const y = memTop + a * memRowH;
						const n = arr.rows * arr.cols;
						return (
							<g key={`m${arr.name}`}>
								<text className={s.section} x={8} y={y - 8}>
									{arr.name} in memory <tspan className={s.sectionSub}>row 0, then row 1, ...</tspan>
								</text>
								{range(n).map((idx) => {
									const r = Math.floor(idx / arr.cols);
									const c = idx % arr.cols;
									const x = 8 + idx * memCell;
									return (
										<g key={idx} className={cellCls(a, r, c)}>
											<rect x={x + 1.5} y={y + 3} width={memCell - 3} height={memCell - 6} rx={3} />
											<text className={s.memText} x={x + memCell / 2} y={y + memCell / 2 + 4} textAnchor="middle">
												{value(a, r, c)}
											</text>
										</g>
									);
								})}
								{range(n / 2).map((bn) => (
									<rect
										key={bn}
										className={`${s.block} ${cached.has(`${a}:${bn}`) ? s.blockCached : ''}`}
										x={8 + bn * 2 * memCell}
										y={y + 1}
										width={2 * memCell}
										height={memCell - 2}
										rx={5}
									/>
								))}
								{range(arr.rows - 1).map((r) => (
									<line
										key={r}
										className={s.rowSplit}
										x1={8 + (r + 1) * arr.cols * memCell}
										x2={8 + (r + 1) * arr.cols * memCell}
										y1={y - 2}
										y2={y + memCell + 2}
									/>
								))}
							</g>
						);
					})}

				{/* ---- miss rate ---- */}
				<text className={s.section} x={8} y={barTop}>
					miss rate
					<tspan className={s.rateText}>
						{'  '}
						{f.misses} / {accesses} = {Math.round(rate * 100)}%
					</tspan>
				</text>
				<rect className={s.barBg} x={8} y={barTop + 8} width={W - 16} height={14} rx={7} />
				<rect className={s.barFill} x={8} y={barTop + 8} width={Math.max(0, (W - 16) * rate)} height={14} rx={7} />
				{range(p.trace.length).map((n) => {
					const o = f.outcomes[n];
					const cw = Math.min(18, (W - 16) / p.trace.length);
					return (
						<rect
							key={n}
							className={o === undefined ? s.histEmpty : o ? s.histHit : s.histMiss}
							x={8 + n * cw + 1}
							y={barTop + 32}
							width={cw - 2}
							height={cw - 2}
							rx={2}
						/>
					);
				})}
			</svg>

			<div className={s.legend}>
				<span className={s.lgHit}>hit</span>
				<span className={s.lgMiss}>miss</span>
				<span className={s.lgCur}>current access</span>
				<span className={s.lgCached}>block in cache</span>
				<span className={s.formula}>slide: {p.formula}</span>
			</div>
		</div>
	);
}
