// Timing model of the lecture's in-order, scalar 5-stage pipeline (F D X M W).
//
// Conventions (matching the course's pipeline diagrams):
// - Cycles are numbered from 1. A stage letter in cycle c means the instruction *completed*
//   that stage in cycle c.
// - Hazards are resolved in D: a stalled instruction shows d* in D; the instruction behind it
//   is stuck in F and shows p*.
// - Internal forwarding: W writes the register file in the first half of a cycle and D reads
//   it in the second half, so a value written in cycle c can be read in cycle c.
// - Bypasses: MX (X/M output -> X), WX (M/W output -> X), WM (M/W output -> M store data).
//   Loads only have their value at the end of M, so MX can't carry it.

export type Stage = 'F' | 'D' | 'X' | 'M' | 'W';
export const STAGES: Stage[] = ['F', 'D', 'X', 'M', 'W'];
export type Bypass = 'MX' | 'WX' | 'WM';
export type Kind = 'alu' | 'load' | 'store';

export interface PInsn {
	text: string; // display form, "add r1, r2 → r3"
	op: string;
	kind: Kind;
	dest: string | null;
	/** Register operands needed at the start of X (ALU inputs, address base). */
	xRegs: string[];
	/** Store data register, needed at the start of M. */
	mReg: string | null;
	/** ALU operands in order (registers or immediates) for ALU ops. */
	operands: string[];
	imm: number; // address offset for loads/stores
	base: string | null;
}

const REG = /^r\d+$/;

export function parsePInsn(raw: string): PInsn {
	const text = raw.replace(/->/g, '→').replace(/\s+/g, ' ').trim();
	const t = text.replace(/→/g, '->');
	let m = t.match(/^(\w+)\s+#?(-?\d+)\((r\d+)\)\s*->\s*(r\d+)$/i);
	if (m) return { text, op: m[1].toLowerCase(), kind: 'load', dest: m[4], xRegs: [m[3]], mReg: null, operands: [], imm: +m[2], base: m[3] };
	m = t.match(/^(\w+)\s+(r\d+)\s*->\s*#?(-?\d+)\((r\d+)\)$/i);
	if (m) return { text, op: m[1].toLowerCase(), kind: 'store', dest: null, xRegs: [m[4]], mReg: m[2], operands: [], imm: +m[3], base: m[4] };
	m = t.match(/^(\w+)\s+(.+?)\s*->\s*(r\d+)$/i);
	if (!m) throw new Error(`Can't parse instruction "${raw}"`);
	const operands = m[2].split(',').map((x) => x.trim().replace(/^#/, ''));
	return { text, op: m[1].toLowerCase(), kind: 'alu', dest: m[3], xRegs: operands.filter((x) => REG.test(x)), mReg: null, operands, imm: 0, base: null };
}

export interface PipeConfig {
	/** 'none': no hazard detection (instructions may read stale values). 'stall': stall in D until safe. */
	hazard: 'none' | 'stall';
	bypass?: Partial<Record<Bypass, boolean>>;
	internalForwarding?: boolean;
	regs?: Record<string, number>;
	mem?: Record<number, number>;
}

export type Source = 'regfile' | 'internal' | Bypass | 'stale';

export interface OperandInfo {
	reg: string;
	role: 'x' | 'm';
	producer: number | null;
	source: Source;
	value: number; // value actually used
	correct: number; // value it should have been
}

export interface Timing {
	fEnter: number;
	F: number;
	D: number;
	X: number;
	M: number;
	W: number;
	operands: OperandInfo[];
	/** Value computed in X (ALU result or effective address). */
	xValue: number;
	/** Value written back (ALU result or loaded data), if any. */
	result: number | null;
	/** What xValue / result should have been with correct inputs. */
	xCorrect: number;
	resultCorrect: number | null;
}

export interface Schedule {
	program: PInsn[];
	timings: Timing[];
	cycles: number; // last cycle anything happens in
	config: PipeConfig;
}

const ALU: Record<string, (a: number, b: number) => number> = {
	add: (a, b) => a + b,
	sub: (a, b) => a - b,
	and: (a, b) => a & b,
	or: (a, b) => a | b,
	xor: (a, b) => a ^ b,
	mul: (a, b) => a * b,
};
const aluFn = (op: string) => ALU[op.replace(/i$/, '')] ?? ALU.add;

export function schedule(lines: string[], config: PipeConfig): Schedule {
	const program = lines.map(parsePInsn);
	const by = config.bypass ?? {};
	const ifwd = config.internalForwarding ?? true;
	const timings: Timing[] = [];
	const regsInit = config.regs ?? {};
	const mem = config.mem ?? {};

	const producerOf = (j: number, reg: string) => {
		for (let p = j - 1; p >= 0; p--) if (program[p].dest === reg) return p;
		return null;
	};

	program.forEach((insn, j) => {
		const prev = timings[j - 1];
		const fEnter = prev ? prev.F + 1 : 1;
		const F = prev ? Math.max(prev.F + 1, prev.D) : 1;
		let D = Math.max(F + 1, prev ? prev.X : 0);

		if (config.hazard === 'stall') {
			const need = (reg: string, role: 'x' | 'm') => {
				const p = producerOf(j, reg);
				if (p === null) return 0;
				const tp = timings[p];
				const routes = [ifwd ? tp.W : tp.W + 1]; // read the register file in D
				if (by.MX && program[p].kind !== 'load') routes.push(tp.X); // in X the cycle after p's X
				if (by.WX) routes.push(tp.M); // in X while p is in W
				if (role === 'm' && by.WM) routes.push(tp.M - 1); // in M while p is in W
				return Math.min(...routes);
			};
			for (const r of insn.xRegs) D = Math.max(D, need(r, 'x'));
			if (insn.mReg) D = Math.max(D, need(insn.mReg, 'm'));
		}

		const X = D + 1;
		const M = X + 1;
		const W = M + 1;
		timings.push({ fEnter, F, D, X, M, W, operands: [], xValue: 0, result: null, xCorrect: 0, resultCorrect: null });
	});

	// Values: what each instruction should compute (sequential semantics) vs what it actually used.
	const correctResult: (number | null)[] = [];
	const regAt = (reg: string, readCycle: number, before: number) => {
		// Register file contents seen by a read in `readCycle` (internal forwarding: same-cycle writes visible).
		let v = regsInit[reg] ?? 0;
		let best = -1;
		for (let p = 0; p < before; p++) {
			const w = timings[p].W;
			if (program[p].dest === reg && (ifwd ? w <= readCycle : w < readCycle) && p > best && actualResult[p] !== null) {
				best = p;
				v = actualResult[p]!;
			}
		}
		return v;
	};
	const actualResult: (number | null)[] = [];
	const correctRegs: Record<string, number> = { ...regsInit };

	program.forEach((insn, j) => {
		const t = timings[j];
		const resolve = (reg: string, role: 'x' | 'm'): OperandInfo => {
			const p = producerOf(j, reg);
			const correct = correctRegs[reg] ?? 0;
			if (p === null) return { reg, role, producer: null, source: 'regfile', value: regsInit[reg] ?? 0, correct };
			const tp = timings[p];
			const useCycle = role === 'x' ? t.X : t.M;
			let source: Source;
			if (t.D > tp.W || (!ifwd && t.D === tp.W)) source = 'regfile';
			else if (t.D === tp.W) source = 'internal';
			else if (by.MX && program[p].kind !== 'load' && t.X === tp.M) source = 'MX';
			else if (by.WX && t.X === tp.W) source = 'WX';
			else if (role === 'm' && by.WM && useCycle === tp.W) source = 'WM';
			else source = 'stale';
			const value = source === 'stale' ? regAt(reg, t.D, j) : actualResult[p]!;
			return { reg, role, producer: p, source, value, correct };
		};
		t.operands = [...insn.xRegs.map((r) => resolve(r, 'x')), ...(insn.mReg ? [resolve(insn.mReg, 'm')] : [])];
		const val = (reg: string, which: 'value' | 'correct') => t.operands.find((o) => o.reg === reg)![which];
		const num = (x: string, which: 'value' | 'correct') => (REG.test(x) ? val(x, which) : Number(x));

		const compute = (which: 'value' | 'correct') => {
			if (insn.kind === 'alu') {
				const [a, b] = insn.operands.map((x) => num(x, which));
				return { x: aluFn(insn.op)(a, b ?? 0), r: aluFn(insn.op)(a, b ?? 0) };
			}
			const addr = val(insn.base!, which) + insn.imm;
			if (insn.kind === 'load') return { x: addr, r: mem[addr] ?? 0 };
			return { x: addr, r: null };
		};
		const actual = compute('value');
		const correct = compute('correct');
		t.xValue = actual.x;
		t.result = actual.r;
		t.xCorrect = correct.x;
		t.resultCorrect = correct.r;
		actualResult[j] = actual.r;
		correctResult[j] = correct.r;
		if (insn.dest && correct.r !== null) correctRegs[insn.dest] = correct.r;
	});

	return { program, timings, cycles: Math.max(...timings.map((t) => t.W)), config };
}

/** What occupies each stage during a cycle. `null` = empty; 'bubble' = a nop inserted by a stall. */
export type Slot = number | 'bubble' | null;

/** Stage occupancy for every cycle; index 0 is unused so table[c] is cycle c. */
export function occupancyTable(sch: Schedule): Record<Stage, Slot>[] {
	const table: Record<Stage, Slot>[] = [{ F: null, D: null, X: null, M: null, W: null }];
	for (let c = 1; c <= sch.cycles; c++) {
		const out: Record<Stage, Slot> = { F: null, D: null, X: null, M: null, W: null };
		sch.timings.forEach((t, j) => {
			if (c >= t.fEnter && c <= t.F) out.F = j;
			if (c >= t.F + 1 && c <= t.D) out.D = j;
			if (c === t.X) out.X = j;
			if (c === t.M) out.M = j;
			if (c === t.W) out.W = j;
		});
		// A stall in D sends a bubble into X, which then flows on through M and W.
		const stalledLastCycle = sch.timings.some((t) => c - 1 >= t.F + 1 && c - 1 <= t.D - 1);
		if (out.X === null && stalledLastCycle) out.X = 'bubble';
		if (out.M === null && table[c - 1].X === 'bubble') out.M = 'bubble';
		if (out.W === null && table[c - 1].M === 'bubble') out.W = 'bubble';
		table.push(out);
	}
	return table;
}

/** The diagram cell for instruction j in a cycle: a stage letter, a stall marker, or nothing. */
export function cellAt(t: Timing, cycle: number): string | null {
	if (cycle === t.F) return 'F';
	if (cycle >= t.fEnter && cycle < t.F) return 'p*';
	if (cycle > t.F && cycle < t.D) return 'd*';
	if (cycle === t.D) return 'D';
	if (cycle === t.X) return 'X';
	if (cycle === t.M) return 'M';
	if (cycle === t.W) return 'W';
	return null;
}

/** Bypass arrows for a pipeline diagram: drawn at the start of the consumer's stage column. */
export interface Arrow {
	kind: Bypass;
	from: number; // producer row
	to: number; // consumer row
	cycle: number; // consumer's cycle (arrow sits on this column's left edge)
}

export function bypassArrows(sch: Schedule): Arrow[] {
	const arrows: Arrow[] = [];
	sch.timings.forEach((t, j) => {
		for (const o of t.operands) {
			if (o.producer === null) continue;
			if (o.source === 'MX' || o.source === 'WX') arrows.push({ kind: o.source, from: o.producer, to: j, cycle: t.X });
			if (o.source === 'WM') arrows.push({ kind: 'WM', from: o.producer, to: j, cycle: t.M });
		}
	});
	return arrows;
}
