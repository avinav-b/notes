import { embed } from '../types';

export const carBusRace = embed('CarBusRace', 'Latency vs throughput: car vs bus', 541, {
	distance: 10,
	duration: 60,
	step: 5,
	vehicles: [
		{ name: 'Car', icon: 'car', capacity: 5, speed: 60 },
		{ name: 'Bus', icon: 'bus', capacity: 60, speed: 20 },
	],
});

export const cpiExample = embed('CpiStack', 'CPI example: equal integer, memory and FP', 235, {
	classes: [
		{ name: 'Integer', freq: 1 / 3 },
		{ name: 'Memory', freq: 1 / 3 },
		{ name: 'FP', freq: 1 / 3 },
	],
	scenarios: [{ label: 'Example', designs: [{ label: 'CPI', cycles: [1, 2, 3] }] }],
});

export const cpiBranchVsCache = embed('CpiStack', 'CPI: branch prediction (A) vs a bigger data cache (B)', 358, {
	classes: [
		{ name: 'Integer ALU', freq: 0.5 },
		{ name: 'Load', freq: 0.2 },
		{ name: 'Store', freq: 0.1 },
		{ name: 'Branch', freq: 0.2 },
	],
	scenarios: [
		{
			label: 'Example',
			designs: [
				{ label: 'Base', cycles: [1, 5, 1, 2] },
				{ label: 'A', cycles: [1, 5, 1, 1] },
				{ label: 'B', cycles: [1, 3, 1, 2] },
			],
		},
	],
});

export const cpiClockTradeoff = embed('CpiStack', 'CPI vs clock: faster stores or faster ALU, with a 20% slower clock', 337, {
	classes: [
		{ name: 'ALU', freq: 0.45 },
		{ name: 'Load', freq: 0.2 },
		{ name: 'Store', freq: 0.15 },
		{ name: 'Branch', freq: 0.2 },
	],
	scenarios: [
		{
			label: 'A: stores 2 to 1 cycle',
			designs: [
				{ label: 'Old', cycles: [1, 1, 2, 2] },
				{ label: 'New', cycles: [1, 1, 1, 2], clock: 0.8 },
			],
		},
		{
			label: 'B: ALU 2 to 1 cycle',
			designs: [
				{ label: 'Old', cycles: [2, 1, 1, 2] },
				{ label: 'New', cycles: [1, 1, 1, 2], clock: 0.8 },
			],
		},
	],
});

export const amdahlCores = embed('AmdahlCurve', "Amdahl's law: speedup vs number of cores", 673, {
	fractions: [0.8, 0.9, 0.99, 0.999],
	ranges: [16, 64],
	f: 0.9,
	n: 16,
});
