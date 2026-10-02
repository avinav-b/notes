import { embed } from '../types';

const FULL_BYPASS = ['MX', 'WX', 'WM'];

const EXAMPLE = {
	program: ['add r1, r2 -> r3', 'lw #0(r5) -> r4', 'sw r6 -> #4(r7)'],
	regs: { r1: 10, r2: 20, r5: 100, r6: 7, r7: 200 },
	mem: { 100: 55 },
};
const RAW = {
	program: ['add r1, r2 -> r3', 'lw #0(r3) -> r4', 'addi r3, #1 -> r6', 'sw r3 -> #0(r7)'],
	regs: { r1: 10, r2: 20, r3: 7, r7: 300 },
};
const LOAD_USE = {
	program: ['lw #4(r3) -> r1', 'sub r1, r4 -> r2'],
	regs: { r3: 100, r4: 2 },
	mem: { 104: 42 },
};

export const singleCycle = embed('CpuDatapath', 'Single-cycle processor', 555, { variant: 'single' });
export const multiCycle = embed('CpuDatapath', 'Multi-cycle processor', 545, { variant: 'multi' });
export const singleVsMulti = embed('ExecTimeline', 'Single-cycle vs multi-cycle timing', 228, { variant: 'single-vs-multi' });
export const multiVsPipelined = embed('ExecTimeline', 'Multi-cycle vs pipelined timing', 228, { variant: 'multi-vs-pipelined' });
export const pipelineFlow = embed('PipelineDiagram', 'Instructions flowing through the pipeline', 408, { mode: 'loop', generic: 6, relative: true });
export const pipelinedProcessor = embed('CpuDatapath', '5-stage pipelined processor', 518, { variant: 'pipelined' });

export const exampleSim = embed('PipelineSim', 'Pipeline example', 520, { syncId: 'example', ...EXAMPLE });
export const exampleDiagram = embed('PipelineDiagram', 'Pipeline example: pipeline diagram', 272, { syncId: 'example', minCycles: 9, ...EXAMPLE });

export const rawSim = embed('PipelineSim', 'RAW hazard', 590, { syncId: 'raw', hazardToggle: true, hazard: 'none', watch: ['r3'], ...RAW });
export const rawStallDiagram = embed('PipelineDiagram', 'Stalling on a RAW hazard: pipeline diagram', 398, {
	syncId: 'raw',
	hazardToggle: true,
	activateHazard: 'stall',
	minCycles: 10,
	...RAW,
});

export const bypassPaths = embed('BypassPaths', 'Bypass paths', 410);
export const mxBypassDiagram = embed('PipelineDiagram', 'MX bypass: pipeline diagram', 198, {
	mode: 'static',
	bypass: FULL_BYPASS,
	program: ['add r2, r3 -> r1', 'sub r1, r4 -> r2'],
	minCycles: 10,
});
export const wxBypassDiagram = embed('PipelineDiagram', 'WX bypass: pipeline diagram', 238, {
	mode: 'static',
	bypass: FULL_BYPASS,
	program: ['add r2, r3 -> r1', 'lw #0(r7) -> r5', 'sub r1, r4 -> r2'],
	minCycles: 10,
});
export const wmBypassDiagram = embed('PipelineDiagram', 'WM bypass: pipeline diagram', 200, {
	mode: 'static',
	bypass: FULL_BYPASS,
	program: ['lw #0(r2) -> r1', 'sw r1 -> #0(r4)'],
	minCycles: 10,
});

export const loadUseDiagram = embed('PipelineDiagram', 'Load-use hazard: pipeline diagram', 250, { syncId: 'loaduse', bypass: FULL_BYPASS, minCycles: 10, ...LOAD_USE });
export const loadUseNoWxDiagram = embed('PipelineDiagram', 'Load-use hazard without a WX bypass', 200, {
	mode: 'static',
	bypass: ['MX', 'WM'],
	minCycles: 10,
	...LOAD_USE,
});
export const loadUseSim = embed('PipelineSim', 'Load-use hazard with full bypassing', 620, {
	syncId: 'loaduse',
	bypass: FULL_BYPASS,
	watch: ['r1'],
	...LOAD_USE,
	notes: [
		{
			cycle: 4,
			bypass: 'MX',
			tag: '104 = address, not r1',
			text: 'In cycle 4 the MX bypass is holding 104: the effective address #4(r3) that lw computed in the ALU, not the value of r1. lw only gets r1 = 42 out of the data cache during M, so sub cannot take r1 from MX. It stalls for a cycle and gets r1 through the WX bypass in cycle 5.',
		},
	],
});
