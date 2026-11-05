import { embed } from '../types';

export const insnBuffer = embed('InsnBufferPipeline', 'In-order vs out-of-order issue', 770);
export const registerRenaming = embed('RenameDemo', 'Register renaming', 690, {
	program: ['div r2,r3 -> r1', 'add r2,r1 -> r3', 'subi r4,4 -> r2', 'add r4,r2 -> r1'],
	archRegs: 4,
	physRegs: 8,
});

// Value-based renaming: the slide's four instructions, run to completion.
export const valueRenaming = embed('TomasuloSim', 'Value-based register renaming', 684, {
	program: [
		{ text: 'L.S [r1+0]→f1', value: 'M1' },
		{ text: 'MUL.S f0,f1→f2', value: 'f0×M1' },
		{ text: 'ADD.S f7,f8→f0', value: 'f7+f8' },
		{ text: 'L.S [r1+4]→f1', value: 'M2' },
	],
	stations: [
		{
			layout: 'rs',
			ops: ['ADDI', 'SUBI'],
			entries: [{ tag: 'RS#1', fu: 'INT' }],
		},
		{
			layout: 'rs',
			ops: ['L.S'],
			entries: [
				{ tag: 'RS#2', fu: 'LD' },
				{ tag: 'RS#3', fu: 'LD' },
			],
		},
		{
			layout: 'rs',
			ops: ['MUL.S', 'ADD.S'],
			entries: [
				{ tag: 'RS#4', fu: 'FP1' },
				{ tag: 'RS#5', fu: 'FP2' },
			],
		},
	],
	latency: { 'L.S': 2, 'ADD.S': 2, 'MUL.S': 4 },
	loadLatencies: [8, 2],
	regs: ['f0', 'f1', 'f2', 'r1'],
	showRegfile: true,
	intro: 'Four instructions; the first load will miss (8 cycles).',
	notes: {
		1: 'L.S gets RS#2; f1 now means "RS#2\'s result".',
		2: 'MUL.S copies f0\'s value, but f1 is a tag: watch for RS#2.',
		3: 'ADD.S gets RS#5 and renames f0; MUL.S already has its copy.',
		4: 'The second L.S renames f1 to RS#3 (the WAW is gone).',
		7: 'ADD.S writes f0 before MUL.S even executes: no WAR hazard.',
		8: 'The second load writes f1 before the first load finishes.',
		11: 'RS#2 broadcasts: MUL.S takes M1, but f1 no longer maps to RS#2.',
	},
});

const slideRs = [
	{ layout: 'rs' as const, ops: ['ADD.S', 'SUB.S', 'SUBI'], entries: ['Add1', 'Add2', 'Add3'] },
	{ layout: 'rs' as const, ops: ['MUL.S', 'DIV.S'], entries: ['Mult1', 'Mult2'] },
];

// The lecture's 6-instruction example, cycles 1 to 58.
export const tomasuloExample = embed('TomasuloSim', 'Tomasulo, cycle by cycle', 806, {
	program: [
		{ text: 'LD.S 34(r2)→f6', value: 'M1' },
		{ text: 'LD.S 45(r3)→f2', value: 'M2' },
		'MUL.S f2,f4→f0',
		'SUB.S f6,f2→f8',
		'DIV.S f0,f6→f10',
		{ text: 'ADD.S f8,f2→f6', value: '(M1−M2)+M2' },
	],
	stations: [{ layout: 'load', ops: ['LD.S'], entries: ['Load1', 'Load2', 'Load3'] }, ...slideRs],
	latency: { 'LD.S': 2, 'ADD.S': 2, 'SUB.S': 2, 'MUL.S': 10, 'DIV.S': 40 },
	intro: 'Latencies: load 2, add 2, multiply 10, divide 40.',
	notes: {
		2: 'Load2 dispatches: multiple loads can be outstanding.',
		3: 'f2 is renamed, so MUL.S waits for Load2, not the register file.',
		4: 'SUB.S takes both tags; the first load finishes executing.',
		5: 'Load1 broadcasts M1: SUB.S takes it; DIV.S reads the new f6.',
		6: 'Load2 broadcasts: MUL.S and SUB.S issue in the same cycle.',
		7: 'No change: MUL.S and SUB.S execute; DIV.S and ADD.S wait (RAW).',
		9: 'Add1 broadcasts: ADD.S has both operands and issues.',
		12: 'ADD.S writes f6, long after DIV.S copied the old f6 (no WAR).',
		13: 'No change: MUL.S still executing (10 cycles); DIV.S waits.',
		17: 'Mult1 broadcasts: DIV.S issues; its 40 cycles start at 18.',
		58: 'In-order dispatch, out-of-order execute and completion.',
	},
});

// SAX loop, two iterations plus the start of the third, cycles 1 to 19.
export const tomasuloLoop = embed('TomasuloSim', 'Tomasulo overlapping loop iterations', 990, {
	program: [
		'L.S #0(r1)→f0',
		'MUL.S f0,f2→f4',
		'S.S f4→#0(r1)',
		'SUBI r1,4→r1',
		'BNEZ r1,Loop',
		'L.S #0(r1)→f0',
		'MUL.S f0,f2→f4',
		'S.S f4→#0(r1)',
		'SUBI r1,4→r1',
		'BNEZ r1,Loop',
		'L.S #0(r1)→f0',
		'MUL.S f0,f2→f4',
		'S.S f4→#0(r1)',
	],
	stations: [
		{ layout: 'load', ops: ['L.S'], entries: ['Ld1', 'Ld2', 'Ld3'] },
		{ layout: 'store', ops: ['S.S'], entries: ['St1', 'St2', 'St3'] },
		...slideRs,
		{ layout: 'rs', ops: ['BNEZ'], entries: ['Br1'] },
	],
	latency: { 'L.S': 1, 'S.S': 1, SUBI: 1, BNEZ: 1, 'MUL.S': 4 },
	loadLatencies: [8, 1, 8],
	serialLoads: true,
	regValues: { r1: 80 },
	regs: ['f0', 'f2', 'f4', 'r1'],
	endCycle: 19,
	breaks: [5, 10],
	intro: 'Load 1 misses (8 cycles), load 2 hits (1); multiply 4; r1 = 80.',
	notes: {
		1: 'L.S #1 dispatches to Ld1: f0 now means "Ld1\'s result".',
		3: 'Renaming has set up a dataflow graph: St1 waits on Mult1.',
		5: 'BNEZ waits on Add1 for the new r1.',
		6: 'f0 now maps to Ld2: Ld1\'s value only reaches MUL.S, via the CDB.',
		7: 'Add1 broadcasts 76; L.S #2 has its address but waits for the branch.',
		8: 'The branch resolves in X, so L.S #2 can issue (no speculation).',
		9: 'SUBI #2 reuses Add1; the iterations now overlap.',
		11: 'Ld1 broadcasts to MUL.S #1; f0 is Ld3\'s now, so it\'s skipped.',
		12: 'MUL.S #3 has no free Mult RS: stall in D, younger insns stall too.',
		13: 'SUBI #2 lost the CDB to the older L.S #2 last cycle; it goes now.',
		14: 'BNEZ #2 resolves, so L.S #3 issues.',
		16: 'Mult1 broadcasts: St1 gets its data and issues.',
		17: 'Mult1 was freed last cycle, so MUL.S #3 finally dispatches.',
		18: 'S.S #1 completes without the CDB; S.S #3 dispatches to St3.',
		19: 'Both iterations are done; the third is already under way.',
	},
});

export const tomasuloOrganization = embed('TomasuloOrg', 'Tomasulo organization', 519);

// "1st store has page fault?": W cycles of the two loop iterations (slide variant stores to #100(r1)).
export const storePageFault = embed('CompletionOrder', 'Out-of-order completion vs. a faulting store', 371, {
	rows: [
		{ text: 'L.S #0(r1)→f0', w: 11 },
		{ text: 'MUL.S f0,f2→f4', w: 16 },
		{ text: 'S.S f4→#100(r1)', w: 18 },
		{ text: 'SUBI r1,4→r1', w: 7 },
		{ text: 'BNEZ r1,Loop', w: 9 },
		{ text: 'L.S #0(r1)→f0', w: 12 },
		{ text: 'MUL.S f0,f2→f4', w: 17 },
		{ text: 'S.S f4→#100(r1)', w: 19 },
	],
	fault: 2,
	faultLabel: 'page fault',
});
