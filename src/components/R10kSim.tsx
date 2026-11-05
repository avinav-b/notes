// MIPS R10K, cycle by cycle: ROB (T, Told, D/S/X/C/R), reservation stations, map table, free list and
// CDB, computed by r10k.ts from the program and machine in the props. An optional "page fault" mode
// makes one instruction fault and shows serial rollback restoring precise state.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { StepControls, useSharedValue, useStepper } from './StepControls';
import { LECTURE_LOOP, simulateR10k, type R10kConfig, type R10kInsn, type R10kSnapshot, type RobEntry } from './r10k';
import s from './R10kSim.module.css';

type Mode = 'normal' | 'fault';

interface Props {
	program?: R10kInsn[];
	cycles?: number;
	robSize?: number;
	map?: Record<string, number>;
	free?: number[];
	rs?: R10kConfig['rs'];
	latency?: R10kConfig['latency'];
	miss?: Record<number, number>;
	/** Dynamic instruction number that faults in "page fault" mode. */
	fault?: number;
	/** Which modes the toggle offers (first is the default unless initialMode is set). */
	modes?: Mode[];
	initialMode?: Mode;
	/** Cycle to show first in page-fault mode (skips the cycles that match normal mode). */
	faultStart?: number;
	/** One short line per cycle, by mode. Cycles without a note get an automatic summary. */
	notes?: Record<number, string>;
	faultNotes?: Record<number, string>;
	/** Islands with the same id share the mode. */
	syncId?: string;
}

const DEFAULT_RS: R10kConfig['rs'] = [
	{ name: 'Add1', kind: 'add' },
	{ name: 'Add2', kind: 'add' },
	{ name: 'Mult1', kind: 'mult' },
	{ name: 'Mult2', kind: 'mult' },
	{ name: 'Ld1', kind: 'load' },
	{ name: 'Ld2', kind: 'load' },
	{ name: 'St1', kind: 'store' },
	{ name: 'St2', kind: 'store' },
];

const pr = (n: number | undefined) => (n === undefined ? '' : `PR#${n}`);
const arrow = (t: string) => t.replace('->', '→');
const op = (t: string) => t.split(' ')[0];

/** What each ROB column shows for an entry, as seen at the end of `cycle`. */
function robCells(e: RobEntry, cycle: number) {
	const at = (c: number | undefined) => (c !== undefined && c <= cycle ? `c${c}` : '');
	let x = '';
	if (e.X0 !== undefined && e.X0 <= cycle) {
		if (e.X1! <= cycle) x = e.X0 === e.X1 ? `c${e.X0}` : `c${e.X0}–${e.X1}`;
		else x = `c${e.X0}–`;
	}
	return {
		n: String(e.n),
		insn: e.text,
		T: pr(e.T),
		Told: pr(e.Told),
		D: at(e.D),
		S: at(e.S),
		X: x,
		C: at(e.C),
		R: e.undone !== undefined && e.undone <= cycle ? 'undo' : at(e.R),
	};
}

type RowState = 'live' | 'retired' | 'undone' | 'empty';
function rowState(e: RobEntry | null, snap: R10kSnapshot): RowState {
	if (!e) return 'empty';
	if (snap.live.includes(e.n)) return 'live';
	if (e.undone !== undefined) return 'undone';
	return 'retired';
}

/** Every displayed value as a flat key -> string map, so two cycles can be diffed cell by cell. */
function cellMap(snap: R10kSnapshot): Map<string, string> {
	const m = new Map<string, string>();
	snap.rob.forEach((e, i) => {
		m.set(`rob:${i}:state`, rowState(e, snap));
		if (e) for (const [k, v] of Object.entries(robCells(e, snap.cycle))) m.set(`rob:${i}:${k}`, v);
	});
	snap.rs.forEach((r, i) => {
		m.set(`rs:${i}:busy`, r.busy ? 'yes' : 'no');
		m.set(`rs:${i}:op`, r.busy ? r.op ?? '' : '');
		m.set(`rs:${i}:T`, r.busy ? pr(r.T) : '');
		r.srcs.forEach((p, k) => m.set(`rs:${i}:s${k}`, r.busy ? pr(p) + (snap.ready.includes(p) ? '+' : '') : ''));
	});
	for (const [reg, p] of Object.entries(snap.map)) m.set(`map:${reg}`, pr(p) + (snap.ready.includes(p) ? '+' : ''));
	m.set('cdb', pr(snap.cdb));
	return m;
}

/** An automatic one-line summary for cycles without a hand-written note. */
function summary(snap: R10kSnapshot): string {
	const ev = snap.events;
	const name = (n: number) => `#${n} ${op(snap.rob.find((e) => e?.n === n)?.text ?? '')}`;
	const fault = ev.find((e) => e.type === 'fault');
	const undo = ev.find((e) => e.type === 'undo');
	const flush = ev.find((e) => e.type === 'flush');
	if (flush) return `Flush the faulting ${name(flush.n)} and jump to the handler.`;
	if (undo && undo.type === 'undo') {
		const what = undo.dest ? `${undo.dest} back to ${pr(undo.Told)}, ${pr(undo.T)} freed` : 'no register to restore';
		return `${fault ? `${name(fault.n)} faults at the head. ` : ''}Undo ${name(undo.n)}: ${what}.`;
	}
	const parts: string[] = [];
	for (const e of ev) {
		if (e.type === 'retire') parts.push(`${name(e.n)} retires${e.Told ? `, ${pr(e.Told)} freed` : ''}`);
		if (e.type === 'complete') parts.push(`${name(e.n)} completes`);
		if (e.type === 'issue') parts.push(`${name(e.n)} issues`);
		if (e.type === 'dispatch') parts.push(`${name(e.n)} dispatches`);
		if (e.type === 'stall') parts.push(`#${e.n} stalls (${e.reason === 'rob' ? 'ROB full' : e.reason === 'pr' ? 'no free PR' : 'no RS'})`);
	}
	return parts.length ? `${parts.join('; ')}.` : 'Waiting.';
}

const STALL_TEXT = { rob: 'ROB full', pr: 'no free PR', rs: 'no free RS' } as const;


/** A line to draw this cycle, between two elements tagged with data-cell. */
interface Link {
	from: string;
	to: string;
	kind: 'cdb' | 'alloc' | 'free';
}

/** What moved this cycle: tags on the CDB, registers leaving and returning to the free list. */
function linksOf(snap: R10kSnapshot, prev: R10kSnapshot | undefined): Link[] {
	if (!prev) return [];
	const links: Link[] = [];
	const slotOf = (n: number) => snap.rob.findIndex((e) => e?.n === n);
	for (const ev of snap.events) {
		if (ev.type === 'complete' && ev.T !== undefined) {
			const T = ev.T;
			for (const [reg, p] of Object.entries(snap.map)) if (p === T) links.push({ from: 'cdb', to: `map:${reg}`, kind: 'cdb' });
			snap.rs.forEach((r, i) => r.busy && r.srcs.forEach((p, k) => p === T && links.push({ from: 'cdb', to: `rs:${i}:s${k}`, kind: 'cdb' })));
		}
		if (ev.type === 'dispatch' && ev.T !== undefined) links.push({ from: `free:${ev.T}`, to: `rob:${slotOf(ev.n)}:T`, kind: 'alloc' });
		if (ev.type === 'retire' && ev.Told !== undefined) links.push({ from: `rob:${slotOf(ev.n)}:Told`, to: `free:${ev.Told}`, kind: 'free' });
		if (ev.type === 'undo' && ev.T !== undefined) {
			links.push({ from: `rob:${slotOf(ev.n)}:T`, to: `free:${ev.T}`, kind: 'free' });
			links.push({ from: `rob:${slotOf(ev.n)}:Told`, to: `map:${ev.dest}`, kind: 'alloc' });
		}
	}
	return links;
}

export default function R10kSim({
	program = LECTURE_LOOP,
	cycles = 26,
	robSize = 7,
	map = { f0: 1, f2: 2, f4: 3, r1: 4 },
	free = [5, 6, 7, 8],
	rs = DEFAULT_RS,
	latency = { load: 1, store: 1, add: 1, mult: 4, branch: 1 },
	miss = { 1: 8 },
	fault,
	modes,
	initialMode,
	faultStart = 0,
	notes = {},
	faultNotes = {},
	syncId,
}: Props) {
	const modeList: Mode[] = modes ?? (fault ? ['normal', 'fault'] : ['normal']);
	const modeKey = useRef(`r10k-mode-${syncId ?? Math.random().toString(36).slice(2)}`);
	const [mode, setMode] = useSharedValue<Mode>(modeKey.current, initialMode ?? modeList[0]);
	const base = { program, robSize, map, free, rs, latency, miss };
	const snaps = useMemo(
		() => simulateR10k({ ...base, cycles: mode === 'fault' ? 200 : cycles, fault: mode === 'fault' ? fault : undefined }),
		[mode, JSON.stringify(base), cycles, fault],
	);
	const last = snaps.length - 1;
	const stepper = useStepper(last, { intervalMs: 1500 });
	const step = Math.min(stepper.step, last);
	const snap = snaps[step];
	const prev = step > 0 ? snaps[step - 1] : undefined;

	// Jump to the interesting part when switching into page-fault mode.
	useEffect(() => {
		stepper.setStep(mode === 'fault' ? Math.min(faultStart, last) : 0);
	}, [mode]);

	const now = useMemo(() => cellMap(snap), [snap]);
	const before = useMemo(() => (prev ? cellMap(prev) : undefined), [prev]);
	const changed = (key: string) => Boolean(before && before.get(key) !== now.get(key) && now.get(key));
	const ch = (key: string) => (changed(key) ? s.chg : '');

	const note =
		(mode === 'fault' ? faultNotes : notes)[snap.cycle] ??
		(snap.cycle === 0 ? 'Initial state: f0, f2, f4, r1 map to PR#1–4; PR#5–8 are free.' : summary(snap));
	const isReady = (p: number) => snap.ready.includes(p);

	// Head and tail pointers.
	const headSlot = snap.live.length ? snap.rob.findIndex((e) => e?.n === snap.live[0]) : -1;
	const tailSlot = snap.live.length ? snap.rob.findIndex((e) => e?.n === snap.live[snap.live.length - 1]) : -1;

	// Free list chips: every PR is always rendered so it can slide in and out.
	const allPR = useMemo(() => {
		const set = new Set<number>([...Object.values(map), ...free]);
		return [...set].sort((a, b) => a - b);
	}, [JSON.stringify(map), JSON.stringify(free)]);
	const freshFree = new Set(snap.free.filter((p) => prev && !prev.free.includes(p)));
	const leaving = new Set(prev ? prev.free.filter((p) => !snap.free.includes(p)) : []);

	const faulting = mode === 'fault' ? fault : undefined;
	const faultSeen = (e: RobEntry) => e.n === faulting && e.faultAt !== undefined && e.faultAt <= snap.cycle;

	// ---- Lines between cells (CDB broadcasts, registers moving to/from the free list) ----
	const boardRef = useRef<HTMLDivElement>(null);
	const [geo, setGeo] = useState<{ w: number; h: number; paths: { key: string; d: string; kind: Link['kind'] }[] }>({ w: 0, h: 0, paths: [] });
	const links = useMemo(() => linksOf(snap, prev), [snap, prev]);
	useLayoutEffect(() => {
		const board = boardRef.current;
		if (!board) return;
		const measure = () => {
			const b = board.getBoundingClientRect();
			const pool = board.querySelector<HTMLElement>('[data-pool]')?.getBoundingClientRect();
			const box = (id: string) => {
				// Free-list chips are mid-transition, so place them from their queue index instead.
				if (id.startsWith('free:') && pool) {
					const p = Number(id.slice(5));
					let idx = snap.free.indexOf(p);
					if (idx < 0) idx = prev?.free.indexOf(p) ?? 0;
					const x = pool.left + 5 + (idx % 4) * 50;
					const y = pool.top + 5 + Math.floor(idx / 4) * 26;
					return { left: x, top: y, width: 46, height: 22 };
				}
				return board.querySelector<HTMLElement>(`[data-cell="${id}"]`)?.getBoundingClientRect();
			};
			const paths = links.flatMap((l, i) => {
				const a = box(l.from);
				const z = box(l.to);
				if (!a || !z) return [];
				const ax = a.left + a.width / 2 - b.left;
				const ay = a.top + a.height / 2 - b.top;
				const zx = z.left + z.width / 2 - b.left;
				const zy = z.top + z.height / 2 - b.top;
				const bend = Math.max(30, Math.abs(zx - ax) * 0.25);
				const d = `M${ax},${ay} C${ax},${ay + (zy > ay ? bend : -bend)} ${zx},${zy + (zy > ay ? -bend : bend)} ${zx},${zy}`;
				return [{ key: `${step}-${i}`, d, kind: l.kind }];
			});
			setGeo({ w: board.scrollWidth, h: board.scrollHeight, paths });
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(board);
		return () => ro.disconnect();
	}, [links, step]);

	const src = (p: number, key: string) => (
		<span data-cell={key} className={`${s.tag} ${isReady(p) ? s.tagReady : s.tagWait}`}>
			{pr(p)}
			{isReady(p) && <b className={s.plus}>+</b>}
		</span>
	);

	const nextLine = () => {
		if (snap.phase === 'rollback') return <span className={s.nextStop}>Dispatch stopped: rolling back from the tail</span>;
		if (snap.phase === 'handler') return <span className={s.nextStop}>Precise state restored: run the handler, then restart at #{faulting}</span>;
		if (!snap.next) return null;
		return (
			<>
				<span className={s.nextLabel}>next</span>
				<span className={s.mono}>
					#{snap.next.n} {arrow(snap.next.text)}
				</span>
				{snap.next.stall && <span className={s.blocked}>{STALL_TEXT[snap.next.stall]}</span>}
			</>
		);
	};

	const COLS = ['n', 'insn', 'T', 'Told', 'D', 'S', 'X', 'C', 'R'] as const;

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`cycle ${snap.cycle}`}>
				{modeList.length > 1 && (
					<div className={s.seg} role="group" aria-label="Scenario">
						{modeList.map((m) => (
							<button key={m} className={mode === m ? s.segOn : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
								{m === 'normal' ? 'Normal' : 'Store page fault'}
							</button>
						))}
					</div>
				)}
				<label className={s.scrub}>
					<span>cycle</span>
					<input type="range" min={0} max={last} value={step} onChange={(e) => stepper.setStep(Number(e.target.value))} aria-label="Cycle" />
				</label>
			</StepControls>

			<p className={s.message}>{note}</p>

			<div className={s.scroll}>
				<div className={s.board} ref={boardRef}>
					{/* ---- ROB ---- */}
					<div className={`${s.panel} ${s.robBox}`}>
						<div className={s.panelTitle}>ROB</div>
						<div className={s.robGrid} style={{ ['--rows' as string]: robSize }}>
							{['ht', '#', 'Insn', 'T', 'Told', 'D', 'S', 'X', 'C', 'R'].map((h, i) => (
								<div key={i} className={`${s.th} ${h === 'R' ? s.thR : ''}`}>
									{h}
								</div>
							))}
							{snap.rob.map((e, i) => {
								const st = rowState(e, snap);
								const cells = e ? robCells(e, snap.cycle) : undefined;
								const rowCls = [s.row, s[`row_${st}`], e && faultSeen(e) && s.rowFault].filter(Boolean).join(' ');
								return (
									<div key={i} className={rowCls}>
										<div className={s.ptrCell} />
										{COLS.map((k) => (
											<div
												key={k}
												data-cell={`rob:${i}:${k}`}
												className={[s.td, k === 'insn' && s.insn, k === 'R' && s.tdR, cells?.R === 'undo' && k === 'R' && s.undoTag, ch(`rob:${i}:${k}`)]
													.filter(Boolean)
													.join(' ')}
											>
												{k === 'insn' ? (
													<>
														{cells ? arrow(cells.insn) : ''}
														{e && faultSeen(e) && <TriangleAlert size={13} className={s.faultIcon} aria-label="page fault" />}
													</>
												) : k === 'R' && cells?.R === 'undo' && e?.n === faulting ? (
													'flush'
												) : (
													(cells?.[k] ?? '')
												)}
											</div>
										))}
									</div>
								);
							})}
							{headSlot >= 0 && (
								<span className={`${s.ptr} ${s.ptrH}`} style={{ ['--slot' as string]: headSlot }} title="head: oldest, retires next">
									h
								</span>
							)}
							{tailSlot >= 0 && (
								<span
									className={`${s.ptr} ${s.ptrT} ${tailSlot === headSlot ? s.ptrShare : ''}`}
									style={{ ['--slot' as string]: tailSlot }}
									title="tail: youngest, dispatch adds after it"
								>
									t
								</span>
							)}
						</div>
						<div className={s.next}>{nextLine()}</div>
					</div>

					{/* ---- Reservation stations ---- */}
					<div className={`${s.panel} ${s.rsBox}`}>
						<div className={s.panelTitle}>Reservation stations</div>
						<div className={s.rsGrid}>
							{['FU', 'busy', 'op', 'T', 'S1', 'S2'].map((h) => (
								<div key={h} className={s.th}>
									{h}
								</div>
							))}
							{snap.rs.map((r, i) => (
								<div key={i} className={`${s.row} ${r.busy ? '' : s.rsIdle}`}>
									<div className={`${s.td} ${s.strong}`}>{r.name}</div>
									<div className={`${s.td} ${ch(`rs:${i}:busy`)}`}>{r.busy ? 'yes' : 'no'}</div>
									<div className={`${s.td} ${ch(`rs:${i}:op`)}`}>{r.busy ? r.op : ''}</div>
									<div className={`${s.td} ${ch(`rs:${i}:T`)}`}>{r.busy ? pr(r.T) : ''}</div>
									{[0, 1].map((k) => (
										<div key={k} className={`${s.td} ${ch(`rs:${i}:s${k}`)}`}>
											{r.busy && r.srcs[k] !== undefined ? src(r.srcs[k], `rs:${i}:s${k}`) : ''}
										</div>
									))}
								</div>
							))}
						</div>
					</div>

					{/* ---- Map table, CDB, free list ---- */}
					<div className={`${s.panel} ${s.mapBox}`}>
						<div className={s.panelTitle}>Map table</div>
						<div className={s.mapGrid}>
							<div className={s.th}>Reg</div>
							<div className={s.th}>T+</div>
							{Object.entries(snap.map).map(([reg, p]) => (
								<div key={reg} className={s.row}>
									<div className={`${s.td} ${s.strong}`}>{reg}</div>
									<div className={`${s.td} ${ch(`map:${reg}`)}`}>{src(p, `map:${reg}`)}</div>
								</div>
							))}
						</div>
					</div>

					<div className={`${s.cdbBox} ${snap.cdb !== undefined ? s.cdbOn : ''}`} data-cell="cdb">
						<span className={s.cdbLabel}>CDB</span>
						<span className={s.cdbField}>
							<span className={s.cdbKey}>T</span>
							{snap.cdb !== undefined ? pr(snap.cdb) : ''}
						</span>
					</div>

					<div className={`${s.panel} ${s.freeBox}`}>
						<div className={s.panelTitle}>
							Free list <span className={s.count}>{snap.free.length}</span>
						</div>
						<div className={s.freePool} data-pool style={{ ['--free-rows' as string]: Math.max(1, Math.ceil(allPR.length / 4)) }}>
							{snap.free.length === 0 && <span className={s.empty}>empty</span>}
							{allPR.map((p) => {
								const idx = snap.free.indexOf(p);
								const on = idx >= 0;
								// A register that just left stays where it was for the line to start from, then fades.
								const prevIdx = prev ? prev.free.indexOf(p) : -1;
								const pos = on ? idx : leaving.has(p) ? prevIdx : 0;
								return (
									<span
										key={p}
										data-cell={`free:${p}`}
										className={[s.chip, on ? s.chipOn : s.chipOff, freshFree.has(p) && s.chipFresh].filter(Boolean).join(' ')}
										style={{ ['--i' as string]: pos % 4, ['--j' as string]: Math.floor(pos / 4) }}
									>
										{pr(p)}
									</span>
								);
							})}
						</div>
					</div>

					<svg className={s.overlay} width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w || 1} ${geo.h || 1}`} aria-hidden="true">
						<defs>
							{(['cdb', 'alloc', 'free'] as const).map((k) => (
								<marker key={k} id={`r10k-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
									<path d="M0,0 L10,5 L0,10 z" className={s[`head_${k}`]} />
								</marker>
							))}
						</defs>
						{geo.paths.map((p) => (
							<path key={p.key} d={p.d} pathLength={1} className={`${s.line} ${s[`line_${p.kind}`]}`} markerEnd={`url(#r10k-${p.kind})`} />
						))}
					</svg>
				</div>
			</div>

			<div className={s.legend}>
				<span>
					<span className={`${s.swatch} ${s.swatchChg}`} /> changed this cycle
				</span>
				<span>
					<span className={s.swatchLine} /> CDB tag broadcast
				</span>
				<span>
					<span className={`${s.swatchLine} ${s.swatchFree}`} /> register to / from the free list
				</span>
				<span>
					<span className={`${s.tag} ${s.tagWait}`}>PR#6</span> waiting
				</span>
				<span>
					<span className={s.tag}>
						PR#2<b className={s.plus}>+</b>
					</span>
					ready
				</span>
				<span>
					<span className={s.blocked}>ROB full</span> dispatch stalled
				</span>
				<span>
					<span className={`${s.swatch} ${s.swatchRetired}`} /> retired
				</span>
				{modeList.includes('fault') && (
					<span>
						<span className={`${s.swatch} ${s.swatchFault}`} /> page fault
					</span>
				)}
				{modeList.includes('fault') && (
					<span>
						<span className={s.undoSample}>MUL.S</span> rolled back
					</span>
				)}
			</div>
		</div>
	);
}
