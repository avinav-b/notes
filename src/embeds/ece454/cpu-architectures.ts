import { embed } from '../types';

type Seg = { start: number; len?: number; kind?: 'work' | 'wait' | 'stuck' | 'miss' | 'flush'; label?: string; short?: string; key?: string };

const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const SHORT = ['F', 'D', 'X', 'M', 'W'];
/** The five stages of one instruction, starting at `start`. */
const pipe = (start: number): Seg[] => STAGES.map((label, k) => ({ start: start + k, label, short: SHORT[k] }));
/** Wrong-path stages that get flushed (different keys, so they don't merge with the real ones). */
const flushed = (start: number, n: number): Seg[] => STAGES.slice(0, n).map((label, k) => ({ start: start + k, label, short: SHORT[k], kind: 'flush', key: `x${label}` }));

// ---- Pipelining (slide 11) ----
const insns = [1, 2, 3].map((k) => ({ id: `i${k}`, label: `insn ${k}` }));
export const pipelining = embed('OooTimeline', 'Unpipelined vs pipelined execution', 367, {
	rows: insns,
	modes: [
		{
			label: 'Unpipelined',
			note: 'Each instruction finishes all 5 stages before the next starts: CPI = 5.',
			rows: Object.fromEntries(insns.map((r, k) => [r.id, pipe(5 * k + 1)])),
		},
		{
			label: 'Pipelined',
			note: 'A new instruction enters every cycle: CPI approaches 1.',
			rows: Object.fromEntries(insns.map((r, k) => [r.id, pipe(k + 1)])),
		},
	],
});

// ---- Branches (slides 13-15): the branch direction is known at the end of EX ----
const branchRows = [
	{ id: 'br', label: 'BNEZ R3, L1' },
	{ id: 'n1', label: 'insn 4' },
	{ id: 'n2', label: 'insn 5' },
];
export const branchStall = embed('OooTimeline', 'Stalling vs predicting a branch', 420, {
	rows: branchRows,
	modes: [
		{
			label: 'Wait for branch',
			note: 'Fetch stalls until the branch resolves in EX.',
			rows: { br: pipe(1), n1: [{ start: 2, len: 2, kind: 'wait', label: 'which?' }, ...pipe(4)], n2: [{ start: 3, len: 2, kind: 'stuck' }, ...pipe(5)] },
		},
		{
			label: 'Predict right',
			note: 'Guess the direction and keep fetching: no lost cycles.',
			rows: { br: pipe(1), n1: pipe(2), n2: pipe(3) },
		},
		{
			label: 'Predict wrong',
			note: 'Wrong-path work is flushed: as slow as waiting.',
			rows: { br: pipe(1), n1: [...flushed(2, 2), ...pipe(4)], n2: [...flushed(3, 1), ...pipe(5)] },
		},
	],
});

// ---- Data hazard (slides 19-20) ----
export const dataHazard = embed('OooTimeline', 'In-order vs out-of-order: data hazard', 394, {
	rows: [
		{ id: 'div', label: 'DIV F0,F2,F4' },
		{ id: 'add', label: 'ADD F10,F0,F8' },
		{ id: 'sub', label: 'SUB F12,F8,F14' },
	],
	modes: [
		{
			label: 'In-order',
			note: 'ADD waits for F0, and SUB is stuck behind ADD.',
			rows: {
				div: pipe(1),
				add: [{ start: 2, len: 2, kind: 'wait', label: 'F0?' }, ...pipe(4)],
				sub: [{ start: 3, len: 2, kind: 'stuck' }, ...pipe(5)],
			},
		},
		{
			label: 'Out-of-order',
			note: 'SUB does not need F0, so it goes ahead of ADD.',
			rows: {
				div: pipe(1),
				add: [{ start: 2, len: 2, kind: 'wait', label: 'F0?' }, ...pipe(4)],
				sub: pipe(2),
			},
		},
	],
});

// ---- Cache miss (slide 21): every instruction takes one cycle; the load misses for 4 cycles ----
const work = (start: number): Seg => ({ start });
export const cacheMiss = embed('OooTimeline', 'Out-of-order execution hides a cache miss', 514, {
	rows: [
		{ id: 'i1', label: 'inst1' },
		{ id: 'i2', label: 'inst2' },
		{ id: 'i3', label: 'inst3' },
		{ id: 'i4', label: 'inst4' },
		{ id: 'ld', label: 'load' },
		{ id: 'i5', label: 'inst5 (uses load)' },
		{ id: 'i6', label: 'inst6' },
	],
	modes: [
		{
			label: 'In-order',
			note: 'Nothing runs while the load waits for memory.',
			rows: {
				i1: [work(1)],
				i2: [work(2)],
				i3: [work(3)],
				i4: [work(4)],
				ld: [{ start: 5, len: 4, kind: 'miss', label: 'cache miss' }],
				i5: [{ start: 6, len: 3, kind: 'wait' }, work(9)],
				i6: [{ start: 7, len: 3, kind: 'stuck' }, work(10)],
			},
		},
		{
			label: 'Out-of-order',
			note: 'Start the load early; inst2 to inst4 run during the miss.',
			rows: {
				i1: [work(1)],
				i2: [work(3)],
				i3: [work(4)],
				i4: [work(5)],
				ld: [{ start: 2, len: 4, kind: 'miss', label: 'cache miss' }],
				i5: [work(6)],
				i6: [work(7)],
			},
		},
	],
});

// ---- Issue slots (slides 17, 22, 26, 27, 28) ----
const a = (...n: number[]) => n.map((k) => `a${k}`);
const OOO = [a(1, 2, 6), a(3, 4, 5), a(7, 8), a(9)];
const MODES = {
	single: { label: 'Single-issue', width: 1, rows: a(1, 2, 3, 4, 5, 6, 7, 8, 9).map((id) => [id]), note: 'One instruction per cycle: CPI = 1.' },
	superscalar: { label: 'Superscalar', width: 3, rows: [a(1, 2), a(3, 4, 5), a(6), a(7, 8), a(9)], note: 'Up to 3 per cycle, in program order.' },
	ooo: { label: 'Out-of-order', width: 3, rows: OOO, note: 'Instruction 6 fills an empty slot early.' },
	wider: { label: 'Wider OoO', width: 6, rows: OOO, note: 'Twice the slots, same time: not enough independent work.' },
	mt: {
		label: 'Context switching',
		width: 3,
		switchAfter: 4,
		rows: [...OOO, ...OOO.map((r) => r.map((id) => id.replace('a', 'b')))],
		note: 'The apps take turns; empty slots stay empty.',
	},
	smt: {
		label: 'SMT',
		width: 3,
		rows: [
			['a1', 'a2', 'b1'],
			['b2', 'a6', 'b6'],
			['b3', 'a3', 'a5'],
			['a4', 'b4', 'b5'],
			['a7', 'a8', 'b7'],
			['a9', 'b8'],
			['b9'],
		],
		note: 'Both apps issue in the same cycle, filling the gaps.',
	},
};

export const issueSlots = embed('IssueSlots', 'Issue slots: single-issue to wider out-of-order', 571, {
	modes: [MODES.single, MODES.superscalar, MODES.ooo, MODES.wider],
});

export const multithreading = embed('IssueSlots', 'Issue slots: context switching vs SMT', 537, {
	apps: ['Application 1', 'Application 2'],
	modes: [{ ...MODES.ooo, label: 'One app', note: 'One app alone leaves slots empty.' }, MODES.mt, MODES.smt],
});
