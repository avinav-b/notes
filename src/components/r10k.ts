// Cycle-by-cycle model of the MIPS R10K (ROB + physical register file + map table + free list), as in
// the ECE552 lecture example. Pure data: R10kSim renders the snapshots.
//
// Timing rules (all from the annotated lecture slides):
// - Dispatch (D): one instruction per cycle, in order. Needs a ROB entry, a reservation station of the
//   right kind (branches use no RS) and, if it writes a register, a free physical register. ROB entries
//   and physical registers freed at retire in cycle c can be reused from cycle c + 1.
// - Issue (S): one instruction per cycle, oldest ready first. An instruction can issue in the same cycle
//   its last input completes, but not in the cycle it dispatched.
// - Execute (X): starts the cycle after S. Loads need the (blocking) D$: a load waits for an earlier
//   load's access to finish. The RS entry is freed in the last X cycle.
// - Complete (C): the cycle after X ends. Broadcasts the tag on the CDB and sets ready bits.
// - Retire (R): one per cycle, from the ROB head, at least one cycle after C. Frees Told.
// - A faulting instruction is flagged in X and handled when it reaches the ROB head: serial rollback
//   then undoes one ROB entry per cycle from the tail (map[dest] = Told, T back to the free list).

export type R10kKind = 'load' | 'store' | 'add' | 'mult' | 'branch';

export interface R10kInsn {
	/** Display text, e.g. "L.S #0(r1) -> f0". */
	text: string;
	kind: R10kKind;
	dest?: string;
	/** Source registers in RS order (S1, S2). */
	srcs: string[];
}

export interface R10kConfig {
	/** Loop body; it is fetched again and again (the branch is predicted taken). */
	program: R10kInsn[];
	/** Simulate cycles 1..cycles. */
	cycles: number;
	robSize: number;
	/** Initial map table: architectural register -> physical register number. */
	map: Record<string, number>;
	/** Initial free list, head first. */
	free: number[];
	/** Reservation stations in table order. */
	rs: { name: string; kind: R10kKind }[];
	/** X latency in cycles per kind. */
	latency: Record<R10kKind, number>;
	/** Load latency overrides by dynamic instruction number (e.g. a cache miss). */
	miss?: Record<number, number>;
	/** Dynamic instruction number that raises an exception (detected in X, handled at the ROB head). */
	fault?: number;
}

export interface RobEntry {
	n: number; // dynamic instruction number (1-based)
	slot: number;
	text: string;
	kind: R10kKind;
	dest?: string;
	T?: number;
	Told?: number;
	rs?: number; // index into the RS table
	srcPR: number[];
	D: number;
	S?: number;
	X0?: number;
	X1?: number;
	C?: number;
	R?: number;
	faultAt?: number; // cycle the exception is detected
	undone?: number; // cycle it was rolled back
}

export interface RsRow {
	name: string;
	kind: R10kKind;
	busy: boolean;
	n?: number;
	op?: string;
	T?: number;
	srcs: number[];
	/** Cycle the entry was freed (shown as "no" from then on). */
	freedAt?: number;
}

export type R10kEvent =
	| { type: 'dispatch'; n: number; T?: number; Told?: number }
	| { type: 'stall'; n: number; reason: 'rob' | 'pr' | 'rs' }
	| { type: 'issue'; n: number }
	| { type: 'xend'; n: number }
	| { type: 'complete'; n: number; T?: number }
	| { type: 'retire'; n: number; Told?: number; store: boolean }
	| { type: 'fault'; n: number }
	| { type: 'undo'; n: number; dest?: string; T?: number; Told?: number }
	| { type: 'flush'; n: number };

export interface R10kSnapshot {
	cycle: number;
	/** ROB rows by slot: the entry that last used the slot (live, retired or undone), or null. */
	rob: (RobEntry | null)[];
	/** Dynamic numbers of the live entries, oldest first. */
	live: number[];
	rs: RsRow[];
	map: Record<string, number>;
	ready: number[];
	free: number[];
	cdb?: number;
	/** The next instruction waiting to dispatch, if any. */
	next?: { n: number; text: string; stall?: 'rob' | 'pr' | 'rs' };
	events: R10kEvent[];
	phase: 'run' | 'rollback' | 'handler';
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function simulateR10k(cfg: R10kConfig): R10kSnapshot[] {
	const { program, robSize } = cfg;
	const rob: (RobEntry | null)[] = new Array(robSize).fill(null);
	const entries = new Map<number, RobEntry>();
	let live: number[] = [];
	const rs: RsRow[] = cfg.rs.map((r) => ({ name: r.name, kind: r.kind, busy: false, srcs: [] }));
	const map = { ...cfg.map };
	const ready = new Set<number>(Object.values(cfg.map));
	let free = [...cfg.free];
	let nextN = 1;
	let dcacheFree = 0;
	let phase: R10kSnapshot['phase'] = 'run';

	const insnOf = (n: number) => program[(n - 1) % program.length];
	const snaps: R10kSnapshot[] = [];
	const snap = (cycle: number, events: R10kEvent[], cdb?: number, stall?: 'rob' | 'pr' | 'rs') => {
		snaps.push({
			cycle,
			rob: clone(rob),
			live: [...live],
			rs: clone(rs),
			map: { ...map },
			ready: [...ready].sort((a, b) => a - b),
			free: [...free],
			cdb,
			next: phase === 'run' ? { n: nextN, text: insnOf(nextN).text, stall } : undefined,
			events,
			phase,
		});
	};
	snap(0, []);

	for (let c = 1; c <= cfg.cycles; c++) {
		const events: R10kEvent[] = [];

		if (phase === 'handler') break;

		if (phase === 'rollback') {
			// Serial rollback: undo the youngest live entry.
			const n = live[live.length - 1];
			const e = entries.get(n)!;
			if (n === cfg.fault) {
				e.undone = c;
				live.pop();
				phase = 'handler';
				events.push({ type: 'flush', n });
			} else {
				if (e.dest !== undefined && e.T !== undefined) {
					map[e.dest] = e.Told!;
					free.push(e.T);
					ready.delete(e.T);
				}
				if (e.rs !== undefined && rs[e.rs].busy && rs[e.rs].n === n) {
					rs[e.rs] = { name: rs[e.rs].name, kind: rs[e.rs].kind, busy: false, srcs: [], freedAt: c };
				}
				e.undone = c;
				live.pop();
				events.push({ type: 'undo', n, dest: e.dest, T: e.T, Told: e.Told });
			}
			snap(c, events);
			continue;
		}

		// 1. Retire (from the head).
		const freedLater: number[] = [];
		const head = live.length ? entries.get(live[0])! : undefined;
		if (head && head.C !== undefined && head.C < c) {
			if (head.n === cfg.fault) {
				phase = 'rollback';
				events.push({ type: 'fault', n: head.n });
				// The rollback starts this cycle with the youngest entry.
				const n = live[live.length - 1];
				if (n !== head.n) {
					const e = entries.get(n)!;
					if (e.dest !== undefined && e.T !== undefined) {
						map[e.dest] = e.Told!;
						free.push(e.T);
						ready.delete(e.T);
					}
					if (e.rs !== undefined && rs[e.rs].busy && rs[e.rs].n === n) {
						rs[e.rs] = { name: rs[e.rs].name, kind: rs[e.rs].kind, busy: false, srcs: [], freedAt: c };
					}
					e.undone = c;
					live.pop();
					events.push({ type: 'undo', n, dest: e.dest, T: e.T, Told: e.Told });
				}
				snap(c, events);
				continue;
			}
			head.R = c;
			live.shift();
			if (head.Told !== undefined) freedLater.push(head.Told);
			events.push({ type: 'retire', n: head.n, Told: head.Told, store: head.kind === 'store' });
		}
		// Entries retired this cycle still occupy their ROB slot until the end of the cycle.
		const robUsed = live.length + (events.some((e) => e.type === 'retire') ? 1 : 0);

		// 2. Complete: X ended last cycle.
		let cdb: number | undefined;
		for (const n of live) {
			const e = entries.get(n)!;
			if (e.X1 === c - 1 && e.C === undefined) {
				e.C = c;
				if (e.T !== undefined) {
					ready.add(e.T);
					cdb = e.T;
				}
				events.push({ type: 'complete', n, T: e.T });
			}
		}

		// 3. Issue: one per cycle, oldest ready first.
		for (const n of live) {
			const e = entries.get(n)!;
			if (e.S !== undefined || e.D >= c) continue;
			if (!e.srcPR.every((p) => ready.has(p))) continue;
			e.S = c;
			e.X0 = c + 1;
			if (e.kind === 'load') {
				const lat = cfg.miss?.[n] ?? cfg.latency.load;
				const start = Math.max(e.X0, dcacheFree);
				e.X1 = start + lat - 1;
				dcacheFree = e.X1 + 1;
			} else {
				e.X1 = c + cfg.latency[e.kind];
			}
			if (n === cfg.fault) e.faultAt = e.X0;
			events.push({ type: 'issue', n });
			break;
		}

		// 4. RS entries are freed in the last X cycle.
		const rsFreedNow = new Set<number>();
		for (const n of live) {
			const e = entries.get(n)!;
			if (e.X1 === c) {
				if (e.rs !== undefined) {
					rs[e.rs] = { name: rs[e.rs].name, kind: rs[e.rs].kind, busy: false, srcs: [], freedAt: c };
					rsFreedNow.add(e.rs);
				}
				events.push({ type: 'xend', n });
			}
		}

		// 5. Dispatch: one per cycle, in order.
		const insn = insnOf(nextN);
		let stall: 'rob' | 'pr' | 'rs' | undefined;
		const rsIdx = insn.kind === 'branch' ? -1 : rs.findIndex((r, i) => r.kind === insn.kind && !r.busy && !rsFreedNow.has(i));
		if (robUsed >= robSize) stall = 'rob';
		else if (insn.dest && free.length === 0) stall = 'pr';
		else if (insn.kind !== 'branch' && rsIdx < 0) stall = 'rs';
		if (stall) {
			events.push({ type: 'stall', n: nextN, reason: stall });
		} else {
			const n = nextN++;
			const srcPR = insn.srcs.map((r) => map[r]);
			const e: RobEntry = { n, slot: (n - 1) % robSize, text: insn.text, kind: insn.kind, dest: insn.dest, srcPR, D: c };
			if (insn.dest) {
				e.T = free.shift()!;
				e.Told = map[insn.dest];
				map[insn.dest] = e.T;
				ready.delete(e.T);
			}
			if (rsIdx >= 0) {
				e.rs = rsIdx;
				rs[rsIdx] = { name: rs[rsIdx].name, kind: rs[rsIdx].kind, busy: true, n, op: insn.text.split(' ')[0], T: e.T, srcs: srcPR };
			}
			entries.set(n, e);
			rob[e.slot] = e;
			live.push(n);
			events.push({ type: 'dispatch', n, T: e.T, Told: e.Told });
		}

		free = [...free, ...freedLater];
		snap(c, events, cdb, stall);
	}
	return snaps;
}

/** The lecture's loop and machine. */
export const LECTURE_LOOP: R10kInsn[] = [
	{ text: 'L.S #0(r1) -> f0', kind: 'load', dest: 'f0', srcs: ['r1'] },
	{ text: 'MUL.S f0,f2 -> f4', kind: 'mult', dest: 'f4', srcs: ['f0', 'f2'] },
	{ text: 'S.S f4 -> #0(r1)', kind: 'store', srcs: ['r1', 'f4'] },
	{ text: 'SUBI r1,#4 -> r1', kind: 'add', dest: 'r1', srcs: ['r1'] },
	{ text: 'BNEZ r1,Loop', kind: 'branch', srcs: ['r1'] },
];
