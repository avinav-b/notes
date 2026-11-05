import { embed } from '../types';

const DIV_SS = [
	{ insn: 'DIV.S f0,f1 → f2', start: 1, stages: ['F', 'D', 'E/', 'E/', 'E/', 'E/', 'E/', 'W'] },
	{ insn: 'S.S f2 → [r1]', start: 2, stages: ['F', 'D', 'd*', 'd*', 'd*', 'X', 'M', 'W'] },
];

export const simpleException = embed('ExceptionTimeline', 'Precise exceptions in a 5-stage pipeline', 384, {
	scenarios: [
		{
			label: 'In-order pipeline',
			rows: [
				{ insn: 'DIV r1,r0 → r2', tag: 'page i', start: 1, stages: ['F', 'D', 'X', 'M', 'W'] },
				{ insn: 'ADD r3,r4 → r5', tag: 'page i+1', start: 2, stages: ['F', 'D', 'X', 'M', 'W'] },
			],
			faults: [
				{ row: 1, cycle: 2, label: 'page fault' },
				{ row: 0, cycle: 3, label: '÷ 0' },
			],
			handled: { row: 0, cycle: 5 },
			notes: [
				'DIV is the last instruction on page i; ADD is on page i+1.',
				'DIV is fetched.',
				'Fetching ADD page-faults: flag it, ADD becomes a nop.',
				'DIV divides by zero: flag it too, one cycle later.',
				'The flags ride down the pipeline with their instructions.',
				'DIV’s flag reaches M/W first: handle DIV, flush ADD.',
			],
		},
	],
});

export const oooExceptions = embed('ExceptionTimeline', 'Exceptions with out-of-order writeback', 432, {
	scenarios: [
		{
			label: 'Store page fault',
			rows: [...DIV_SS, { insn: 'ADD.S f0,f1 → f0', start: 3, stages: ['F', 'D', 'E+', 'E+', 'W'] }],
			faults: [{ row: 1, cycle: 8, label: 'page fault' }],
			early: [{ row: 2, cycle: 7, label: 'f0 written' }],
			handled: { row: 1, cycle: 9 },
			notes: [
				'S.S needs DIV.S’s f2; ADD.S is independent.',
				'DIV.S is fetched.',
				'S.S is fetched.',
				'DIV.S starts a 5-cycle divide.',
				'S.S stalls (d*) waiting for f2.',
				'ADD.S executes while the older S.S is still stalled.',
				'ADD.S finishes executing.',
				'ADD.S writes back f0, ahead of the older S.S.',
				'S.S page-faults in M. DIV.S writes back normally.',
				'Handle S.S, flush S.S and ADD.S. But ADD.S already wrote f0!',
			],
		},
		{
			label: 'Two exceptions',
			rows: [...DIV_SS, { insn: 'DIV.S f0,f4 → f2', start: 3, stages: ['F', 'D', 'E/', 'E/', 'E/', 'E/', 'E/', 'W'] }],
			faults: [
				{ row: 2, cycle: 5, label: '÷ 0' },
				{ row: 1, cycle: 8, label: 'page fault' },
			],
			handled: { row: 1, cycle: 9 },
			notes: [
				'Two instructions will fault: S.S and the second DIV.S.',
				'DIV.S is fetched.',
				'S.S is fetched.',
				'The second DIV.S is fetched.',
				'S.S stalls (d*) waiting for f2.',
				'Second DIV.S divides by zero: the first exception in time.',
				'Not handled yet: it is deferred until its writeback.',
				'S.S finally executes.',
				'S.S page-faults: later in time, but older in program order.',
				'Handle S.S first: to it, the second DIV.S never started.',
			],
		},
	],
});

export const stageSplit = embed('StageSplit', 'Splitting writeback into complete and retire', 255);

export const robLsq = embed('RobLsqDemo', 'ROB and LSQ working together', 520);

export const renameOutOfRegs = embed('RenameDemo', 'Renaming until the free list runs out', 686, {
	program: ['add r2,r3 -> r1', 'sub r2,r1 -> r3', 'mul r2,r3 -> r1', 'div r1,r3 -> r2'],
	archRegs: 3,
	physRegs: 7,
});

const R10K_NOTES: Record<number, string> = {
	1: 'Dispatch L.S: new PR#5 for f0, old PR#1 saved as Told.',
	2: 'MUL.S gets PR#6 for f4. L.S issues: r1 (PR#4+) is ready.',
	3: 'S.S dispatches: stores get no physical register.',
	4: 'SUBI renames r1 to PR#7; its input still reads PR#4.',
	5: 'SUBI issues. BNEZ dispatches (its RS is not shown).',
	6: 'Branch predicted taken: the next L.S dispatches. SUBI frees its RS at end of X.',
	7: 'Free list empty: MUL.S stalls. SUBI completes, PR#7 goes on the CDB.',
	8: 'One issue per cycle: L.S #6 issues a cycle after BNEZ.',
	9: 'BNEZ completes: the prediction was correct.',
	10: 'L.S #1 leaves X: a cache miss, 8 cycles.',
	11: 'L.S #1 completes and wakes MUL.S. L.S #6 hits once the D$ is free.',
	12: 'L.S #1 is complete at the head: retire, PR#1 freed.',
	13: 'Head MUL.S #2 is not complete: no retire. MUL.S #7 takes PR#1.',
	14: 'S.S needs only a ROB entry, no physical register.',
	15: 'ROB full: structural hazard, dispatch stalls.',
	16: 'MUL.S #2 completes and wakes S.S #3.',
	17: 'MUL.S #2 retires, PR#3 freed. S.S X only computes the address.',
	18: 'S.S completes: no result, no CDB. SUBI #9 takes PR#3.',
	19: 'S.S retires: only now does it write memory.',
	20: 'SUBI #4 retires, PR#4 freed. BNEZ #10 dispatches.',
	21: 'BNEZ #5 retires: the branch was predicted correctly.',
	22: 'L.S #6 retires; PR#5 can be reused next cycle.',
	23: 'MUL.S #7 retires; MUL.S #12 takes PR#5.',
	24: 'S.S #8 retires and writes memory. S.S #13 dispatches.',
	25: 'L.S #11 completes; MUL.S #12 issues the same cycle.',
	26: 'BNEZ #10 retires: two iterations finished.',
};

export const r10kExample = embed('R10kSim', 'MIPS R10K, cycle by cycle', 827, {
	cycles: 26,
	modes: ['normal'],
	notes: R10K_NOTES,
});

export const r10kRollback = embed('R10kSim', 'R10K serial rollback after a store page fault', 834, {
	cycles: 26,
	fault: 3,
	modes: ['normal', 'fault'],
	initialMode: 'fault',
	faultStart: 16,
	notes: R10K_NOTES,
	faultNotes: {
		16: 'Same as before so far: S.S #3 is about to execute.',
		17: 'S.S #3’s address page-faults: flagged in its ROB entry.',
		18: 'S.S completes with the flag. Nothing is undone yet.',
	},
});
