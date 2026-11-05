// Cycle-by-cycle simulator for "Simple Tomasulo" (ECE552 L04), used by TomasuloSim.
//
// Timing rules, worked out from the annotated lecture slides:
// - D (dispatch): one instruction per cycle, in program order. Needs a free RS entry of the right kind,
//   otherwise it stalls (and everything younger stalls behind it). An entry freed by a W in cycle c can
//   only be reused from cycle c+1. Dispatch reads the map table after this cycle's W: the register file is
//   written in the first half of the cycle, so a value broadcast in cycle c is read as a value.
// - S (issue): at least one cycle after D, once every operand has arrived. A value broadcast on the CDB
//   in cycle c lets a waiting instruction issue in that same cycle c. Without speculation, nothing younger
//   than a branch issues before the cycle in which the branch executes.
// - X: starts the cycle after S and takes the op's latency; the X column records the last cycle.
//   With `serialLoads`, a load's access also waits for the previous load's access to finish.
// - W: the cycle after X. One CDB broadcast per cycle; the oldest instruction wins and the rest wait.
//   Stores and branches have no result and don't use the CDB. W frees the RS entry (end of cycle).

export type Layout = 'rs' | 'load' | 'store';

export interface StationGroup {
	/** Table title, e.g. "Reservation Stations" or "Load buffers". Groups with the same title share a table. */
	title?: string;
	layout: Layout;
	/** Mnemonics this group accepts, e.g. ['ADD.S', 'SUB.S']. */
	ops: string[];
	/** Entry tags in allocation order, e.g. ['Add1', 'Add2'] or { tag: 'RS#4', fu: 'FP1' }. */
	entries: (string | { tag: string; fu?: string })[];
}

export interface ProgramItem {
	text: string;
	/** Label for the result on the CDB (default: worked out from the operands). */
	value?: string;
	/** Execute latency for this instruction (overrides `latency`). */
	lat?: number;
}

export interface SimConfig {
	program: (string | ProgramItem)[];
	stations: StationGroup[];
	/** Execute latency by mnemonic. */
	latency: Record<string, number>;
	/** Latency of the 1st, 2nd, ... dynamic load (falls back to `latency`). */
	loadLatencies?: number[];
	/** One load access at a time: a load waits for the previous load's access to finish. */
	serialLoads?: boolean;
	/** Known register values (numbers are used for addresses and integer ops). Others show as [F4]. */
	regValues?: Record<string, number | string>;
	/** Stop the run at this cycle (default: when everything has written back). */
	endCycle?: number;
}

export type OperandKind = 'value' | 'imm';

export interface Operand {
	/** What is being read: a register name, or an immediate. */
	src: string;
	tag: string | null;
	value: string | null;
}

export interface Parsed {
	text: string;
	op: string;
	kind: 'alu' | 'load' | 'store' | 'branch';
	dest: string | null;
	/** Register sources / immediates in RS order (load: [imm, base]; store: [data, base]). */
	srcs: string[];
	imm: number;
	name: string; // short name for messages, e.g. "L.S #2"
}

const REG = /^[rf]\d+$/i;
const isReg = (s: string) => REG.test(s);
const isNum = (s: string) => /^#?-?\d+$/.test(s);

/** Parse "MUL.S f2,f4→f0", "L.S #0(r1)→f0", "LD.S 34(r2)→f6", "L.S [r1+4]→f1", "S.S f4→#0(r1)", "BNEZ r1,Loop". */
export function parseInsn(text: string): Omit<Parsed, 'name'> {
	const [lhs, rhs = ''] = text.split(/->|→/).map((s) => s.trim());
	const [op, ...rest] = lhs.split(/\s+/);
	const args = rest.join('');
	const mem = (s: string): { base: string; imm: number } | null => {
		let m = s.match(/^#?(-?\d+)\((\w+)\)$/);
		if (m) return { base: m[2], imm: Number(m[1]) };
		m = s.match(/^\[(\w+)\s*\+\s*(-?\d+)\]$/);
		if (m) return { base: m[1], imm: Number(m[2]) };
		return null;
	};
	const lm = mem(args);
	if (lm) return { text, op, kind: 'load', dest: rhs, srcs: [String(lm.imm), lm.base], imm: lm.imm };
	const rm = mem(rhs);
	if (rm) return { text, op, kind: 'store', dest: null, srcs: [args, rm.base], imm: rm.imm };
	const parts = args.split(',').filter(Boolean);
	if (!rhs) return { text, op, kind: 'branch', dest: null, srcs: parts.filter(isReg), imm: 0 };
	return { text, op, kind: 'alu', dest: rhs, srcs: parts.map((p) => p.replace(/^#/, '')), imm: 0 };
}

// ---------- Frames ----------

export type RowState =
	| { k: 'idle' }
	| { k: 'stall' } // stuck in D: no free RS
	| { k: 'blocked' } // dispatch stalled behind an older stalled instruction
	| { k: 'raw' } // in the RS, waiting for operands
	| { k: 'branch' } // operands ready, waiting for an older branch to resolve
	| { k: 'mem' } // issued, waiting for the memory port
	| { k: 'exec'; done: number; lat: number }
	| { k: 'cdb' } // finished, lost the CDB to an older instruction
	| { k: 'done' };

export interface InsnRow {
	d?: number;
	s?: number;
	x?: number;
	w?: number;
	state: RowState;
	rs?: string;
}

export interface Entry {
	tag: string;
	fu?: string;
	group: number;
	busy: boolean;
	insn: number | null;
	op: string;
	ops: Operand[]; // rs layout: [j, k]; load: [imm, base]; store: [data, base]
}

export interface Broadcast {
	tag: string;
	value: string;
	insn: number;
}

export interface Frame {
	cycle: number;
	rows: InsnRow[];
	entries: Entry[];
	map: Record<string, string | null>;
	regfile: Record<string, string>;
	cdb: Broadcast | null;
	/** Cell ids changed this cycle (see cellId helpers in TomasuloSim). */
	changed: Set<string>;
	/** Cell ids that took the broadcast value this cycle. */
	targets: string[];
	/** Tags cleared this cycle, by cell id (shown struck through). */
	ghosts: Record<string, string>;
	/** Register whose writer broadcast this cycle but which has since been renamed again (not written). */
	stale: { reg: string; tag: string } | null;
	events: {
		dispatched: number | null;
		stalled: number | null;
		issued: number[];
		finished: number[]; // X completed
		written: number[]; // W (with or without CDB)
		lostCdb: number[];
	};
}

export interface SimResult {
	insns: Parsed[];
	frames: Frame[];
	regs: string[];
}

const SYM: Record<string, string> = { ADD: '+', SUB: '−', MUL: '×', DIV: '/' };

export const regLabel = (r: string) => `[${r.toUpperCase()}]`;
const bare = (v: string) => v.replace(/^\[(.*)\]$/, '$1');
const numeric = (v: string | null) => (v !== null && /^-?\d+$/.test(v) ? Number(v) : null);

export function simulate(cfg: SimConfig): SimResult {
	const items = cfg.program.map((p) => (typeof p === 'string' ? { text: p } : p));
	const counts: Record<string, number> = {};
	for (const it of items) {
		const op = it.text.trim().split(/\s+/)[0];
		counts[op] = (counts[op] ?? 0) + 1;
	}
	const seen: Record<string, number> = {};
	const insns: Parsed[] = items.map((it) => {
		const p = parseInsn(it.text);
		seen[p.op] = (seen[p.op] ?? 0) + 1;
		return { ...p, name: counts[p.op] > 1 ? `${p.op} #${seen[p.op]}` : p.op };
	});
	const n = insns.length;

	const regValue = (r: string): string => {
		const v = cfg.regValues?.[r];
		return v === undefined ? regLabel(r) : String(v);
	};

	// Registers shown in the map table: everything the program names, in a stable order.
	const regSet = new Set<string>();
	for (const p of insns) {
		for (const s of p.srcs) if (isReg(s)) regSet.add(s);
		if (p.dest) regSet.add(p.dest);
	}
	const regs = [...regSet].sort((a, b) => (a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : a[0] === 'f' ? -1 : 1));

	// Mutable machine state.
	const entries: Entry[] = [];
	cfg.stations.forEach((g, gi) => {
		for (const e of g.entries) {
			const { tag, fu } = typeof e === 'string' ? { tag: e, fu: undefined } : e;
			entries.push({ tag, fu, group: gi, busy: false, insn: null, op: '', ops: [] });
		}
	});
	const map: Record<string, string | null> = Object.fromEntries(regs.map((r) => [r, null]));
	const regfile: Record<string, string> = Object.fromEntries(regs.map((r) => [r, regValue(r)]));
	const rows: InsnRow[] = insns.map(() => ({ state: { k: 'idle' } }));
	const execStart: number[] = new Array(n).fill(0);
	const lat: number[] = new Array(n).fill(1);
	const results: string[] = new Array(n).fill('');
	let next = 0; // next instruction to dispatch
	let loadCount = 0;
	let memFree = 0; // first cycle the load port is free (serialLoads)

	const entryOf = (i: number) => entries.find((e) => e.insn === i && e.busy)!;

	const clone = (): Pick<Frame, 'rows' | 'entries' | 'map' | 'regfile'> => ({
		rows: rows.map((r) => ({ ...r, state: { ...r.state } })),
		entries: entries.map((e) => ({ ...e, ops: e.ops.map((o) => ({ ...o })) })),
		map: { ...map },
		regfile: { ...regfile },
	});

	const resultLabel = (i: number): string => {
		const item = items[i];
		if (item.value) return item.value;
		const p = insns[i];
		const e = entryOf(i);
		if (p.kind === 'load') {
			const a = addrOf(e);
			return numeric(a) !== null ? `M[${a}]` : `Mem(${loadIndex[i]})`;
		}
		const [a, b] = e.ops.map((o) => o.value ?? '?');
		const sym = SYM[p.op.replace(/I?(\.S|\.D)?$/, '')] ?? SYM[p.op.slice(0, 3)] ?? '∘';
		const na = numeric(a);
		const nb = numeric(b);
		if (na !== null && nb !== null && b !== undefined) {
			if (sym === '+') return String(na + nb);
			if (sym === '−') return String(na - nb);
			if (sym === '×') return String(na * nb);
		}
		return `${bare(a)}${sym}${bare(b ?? '')}`;
	};

	const loadIndex: number[] = [];
	{
		let k = 0;
		insns.forEach((p, i) => {
			if (p.kind === 'load') loadIndex[i] = ++k;
		});
	}

	const addrOf = (e: Entry): string | null => {
		const [imm, base] = e.ops;
		if (base.tag) return null;
		const nb = numeric(base.value);
		const ni = Number(imm.value);
		if (nb !== null) return String(nb + ni);
		return `${ni}+${base.value}`;
	};

	const frames: Frame[] = [];
	const empty = (): Frame['events'] => ({ dispatched: null, stalled: null, issued: [], finished: [], written: [], lostCdb: [] });
	frames.push({ cycle: 0, ...clone(), cdb: null, changed: new Set(), targets: [], ghosts: {}, stale: null, events: empty() });

	const limit = cfg.endCycle ?? 500;
	for (let c = 1; c <= limit; c++) {
		const changed = new Set<string>();
		const targets: string[] = [];
		const ghosts: Record<string, string> = {};
		const ev = empty();
		let cdb: Broadcast | null = null;
		let stale: Frame['stale'] = null;
		const freeing: Entry[] = [];

		// 1. W (first half of the cycle).
		const ready = rows
			.map((r, i) => i)
			.filter((i) => rows[i].x !== undefined && rows[i].x! < c && rows[i].w === undefined)
			.sort((a, b) => a - b);
		let cdbTaken = false;
		for (const i of ready) {
			const p = insns[i];
			const e = entryOf(i);
			if (!p.dest) {
				rows[i].w = c;
				rows[i].state = { k: 'done' };
				changed.add(`ins-${i}-w`);
				ev.written.push(i);
				freeing.push(e);
				continue;
			}
			if (cdbTaken) {
				rows[i].state = { k: 'cdb' };
				ev.lostCdb.push(i);
				continue;
			}
			cdbTaken = true;
			const value = results[i];
			cdb = { tag: e.tag, value, insn: i };
			if (map[p.dest] !== undefined && map[p.dest] !== e.tag) stale = { reg: p.dest, tag: e.tag };
			rows[i].w = c;
			rows[i].state = { k: 'done' };
			changed.add(`ins-${i}-w`);
			ev.written.push(i);
			freeing.push(e);
			for (const o of entries) {
				if (!o.busy || o === e) continue;
				o.ops.forEach((op, k) => {
					if (op.tag === e.tag) {
						ghosts[`rs-${o.tag}-q${k}`] = op.tag;
						op.tag = null;
						op.value = value;
						changed.add(`rs-${o.tag}-q${k}`);
						changed.add(`rs-${o.tag}-v${k}`);
						targets.push(`rs-${o.tag}-v${k}`);
					}
				});
			}
			for (const r of regs) {
				if (map[r] === e.tag) {
					ghosts[`map-${r}-t`] = e.tag;
					map[r] = null;
					regfile[r] = value;
					changed.add(`map-${r}-t`);
					changed.add(`map-${r}-v`);
					targets.push(`map-${r}-t`);
				}
			}
		}

		// 2. D (second half: sees this cycle's register writes).
		if (next < n) {
			const p = insns[next];
			const e = entries.find((x) => !x.busy && cfg.stations[x.group].ops.includes(p.op));
			if (!e) {
				rows[next].state = { k: 'stall' };
				ev.stalled = next;
				for (let j = next + 1; j < n; j++) rows[j].state = { k: 'blocked' };
			} else {
				const i = next++;
				e.busy = true;
				e.insn = i;
				e.op = p.op;
				e.ops = p.srcs.map((s, k) => {
					if (!isReg(s)) return { src: s, tag: null, value: String(Number(s.replace('#', ''))) };
					const t = map[s];
					return t ? { src: s, tag: t, value: null } : { src: s, tag: null, value: regfile[s] };
				});
				if (p.kind === 'load') {
					lat[i] = items[i].lat ?? cfg.loadLatencies?.[loadCount] ?? cfg.latency[p.op] ?? 1;
					loadCount++;
				} else lat[i] = items[i].lat ?? cfg.latency[p.op] ?? 1;
				if (p.dest) {
					map[p.dest] = e.tag;
					changed.add(`map-${p.dest}-t`);
				}
				rows[i].d = c;
				rows[i].rs = e.tag;
				rows[i].state = { k: 'raw' };
				changed.add(`ins-${i}-d`);
				changed.add(`rs-${e.tag}-row`);
				ev.dispatched = i;
				for (let j = i + 1; j < n; j++) if (rows[j].state.k === 'blocked') rows[j].state = { k: 'idle' };
			}
		}

		// 3. S: issue anything whose operands have all arrived (including via this cycle's broadcast).
		for (let i = 0; i < n; i++) {
			const r = rows[i];
			if (r.d === undefined || r.d >= c || r.s !== undefined) continue;
			const e = entryOf(i);
			if (e.ops.some((o) => o.tag)) {
				r.state = { k: 'raw' };
				continue;
			}
			const branchPending = insns.some((q, j) => j < i && q.kind === 'branch' && (rows[j].x === undefined || rows[j].x! > c));
			if (branchPending) {
				r.state = { k: 'branch' };
				continue;
			}
			r.s = c;
			changed.add(`ins-${i}-s`);
			ev.issued.push(i);
			let start = c + 1;
			if (insns[i].kind === 'load' && cfg.serialLoads) {
				start = Math.max(start, memFree);
				memFree = start + lat[i];
			}
			execStart[i] = start;
			r.x = start + lat[i] - 1; // decided now; shown once reached
			results[i] = insns[i].dest ? resultLabel(i) : '';
			r.state = start > c + 1 ? { k: 'mem' } : { k: 'exec', done: 0, lat: lat[i] };
		}

		// 4. X progress.
		for (let i = 0; i < n; i++) {
			const r = rows[i];
			if (r.s === undefined || r.s >= c || r.w !== undefined || r.state.k === 'cdb') continue;
			if (c < execStart[i]) r.state = { k: 'mem' };
			else if (c <= r.x!) {
				r.state = { k: 'exec', done: c - execStart[i] + 1, lat: lat[i] };
				if (c === r.x) {
					changed.add(`ins-${i}-x`);
					ev.finished.push(i);
				}
			}
		}

		// End of cycle: free the entries that wrote back.
		for (const e of freeing) {
			e.busy = false;
			e.insn = null;
			e.op = '';
			e.ops = [];
			changed.add(`rs-${e.tag}-row`);
		}

		const snap = clone();
		// Hide X cycle numbers that haven't been reached yet.
		snap.rows.forEach((r, i) => {
			if (r.x !== undefined && r.x > c) snap.rows[i] = { ...r, x: undefined };
		});
		frames.push({ cycle: c, ...snap, cdb, changed, targets, ghosts, stale, events: ev });

		if (cfg.endCycle === undefined && next >= n && rows.every((r) => r.w !== undefined)) break;
	}

	return { insns, frames, regs };
}
