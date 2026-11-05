import { embed } from '../types';

const BRANCH = {
	program: ['ADDI r1, #1 -> r3', 'BNEZ r3, targ', 'SW r6 -> #4(r7)', 'ADD r2, r1 -> r4', 'targ: ADD r4, r5 -> r4'],
	branchIndex: 1,
	targetIndex: 4,
};

// The inner loop branch of for (i...) for (j = 0; j < 3; j++): taken 3 times, then not taken, per outer iteration.
const LOOP = 'TTTN TTTN TTTN';

export const alwaysStall = embed('ControlHazardPipeline', 'Control hazard: always stall', 370, {
	...BRANCH,
	program: BRANCH.program.slice(0, 3),
	scenarios: [{ label: 'Always stall', branch: { policy: 'stall', taken: false } }],
});

export const speculationRecovery = embed('ControlHazardPipeline', 'Guess not-taken: correct guess vs mis-speculation', 496, {
	...BRANCH,
	scenarios: [
		{ label: 'Guess right (not taken)', branch: { policy: 'predict-not-taken', taken: false } },
		{ label: 'Guess wrong (taken)', branch: { policy: 'predict-not-taken', taken: true } },
	],
});

export const branchCpi = embed('CpiBars', 'Branch CPI: stall vs predict not-taken vs dynamic prediction', 164, {
	penaltyLabel: 'branch stall cycles per instruction',
	bars: [
		{ label: 'Always stall', cpi: 1.4, note: '40% slower' },
		{ label: 'Predict not taken', cpi: 1.3, note: '30% slower' },
		{ label: 'Dynamic, 95% accurate', cpi: 1.02, note: '2% slower' },
	],
});

export const oneBitSim = embed('BranchPredictorSim', '1-bit predictor on the inner loop branch', 380, {
	outcomes: LOOP,
	modes: [{ label: '1-bit', history: 0, counter: 1 }],
});
export const counterFsm = embed('CounterFsm', 'Two-bit saturating counter state machine', 470);
export const twoBitSim = embed('BranchPredictorSim', '2-bit counter on the inner loop branch', 606, {
	outcomes: LOOP,
	modes: [{ label: '2-bit counter', history: 0, counter: 2 }],
});
export const correlatedSim = embed('BranchPredictorSim', 'Correlated predictor: 2-bit vs 3-bit BHR', 628, {
	outcomes: LOOP,
	modes: [
		{ label: 'BHR 2 bits', history: 2, counter: 1 },
		{ label: 'BHR 3 bits', history: 3, counter: 1 },
	],
});

export const predictorTables = embed('PredictorTables', 'Two-level predictors: GAg, GAp, PAg, PAp and their size', 623, {
	history: 8,
	pcHistory: 6,
	pcTable: 2,
});
export const hybridPredictor = embed('HybridPredictor', 'Hybrid (tournament) predictor', 388);

export const btbLookup = embed('BtbLookup', 'BTB lookup in the fetch stage', 618, {
	withRas: false,
	fetches: [
		{ pc: 0x00401a20, insn: 'ADD r1, r2 → r3', kind: 'alu' },
		{ pc: 0x00401a24, insn: 'BNEZ r3, loop', kind: 'cond', dirp: 'T' },
		{ pc: 0x00405a24, insn: 'SUB r4, r5 → r6', kind: 'alu' },
	],
	btb: [
		{ pc: 0x00403218, target: 0x00403100 },
		{ pc: 0x0040221c, target: 0x00402000 },
		{ pc: 0x00401a24, target: 0x00401a00 },
		{ pc: 0x00400628, target: 0x00400500 },
	],
});
export const fetchPrediction = embed('BtbLookup', 'Next-PC prediction: BTB, direction predictor and RAS', 618);
