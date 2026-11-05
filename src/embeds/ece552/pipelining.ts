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

export const fuPipelines = embed('FuPipelines', 'Execute stage with pipelined functional units', 286);

const WAW_ROWS = {
	div: 'DIV.S f0, f1 -> f2',
	add: 'ADD.S f0, f1 -> f2',
	use: 'ADD.S f2, f3 -> f4',
};
export const wawHazard = embed('ControlHazardPipeline', 'WAW hazard with multi-cycle operations, and two fixes', 478, {
	minCycles: 10,
	scenarios: [
		{
			label: 'WAW hazard',
			rows: [
				{ label: WAW_ROWS.div, cells: 'F D X/ X/ X/ X/ X/ W' },
				{ label: WAW_ROWS.add, cells: '. F D X+ X+ W' },
				{ label: '...', cells: '.' },
				{ label: WAW_ROWS.use, cells: '. . . . . . . F D X+' },
			],
			arrows: [{ from: [0, 8], to: [3, 9], kind: 'wrong' }],
			track: { label: 'f2 holds', cells: '. . . . . ADD.S ADD.S DIV.S! DIV.S! DIV.S!' },
			notes: {
				1: 'DIV.S spends 5 cycles in the divider (X/).',
				4: 'The younger ADD.S only needs 2 cycles in the adder (X+).',
				6: 'ADD.S writes f2 first, out of order.',
				8: 'DIV.S overwrites f2 with the older value.',
				9: 'The later reader gets DIV.S’s f2: wrong.',
			},
		},
		{
			label: 'Option I: stall ADD.S',
			rows: [
				{ label: WAW_ROWS.div, cells: 'F D X/ X/ X/ X/ X/ W' },
				{ label: WAW_ROWS.add, cells: '. F D X+ X+ w* w* w* W' },
				{ label: '...', cells: '.' },
				{ label: WAW_ROWS.use, cells: '. . . . . . . F D X+' },
			],
			arrows: [{ from: [1, 9], to: [3, 9], kind: 'ok' }],
			track: { label: 'f2 holds', cells: '. . . . . . . DIV.S ADD.S~ ADD.S~' },
			notes: {
				1: 'DIV.S spends 5 cycles in the divider (X/).',
				6: 'ADD.S waits to write back until DIV.S has (w*).',
				8: 'DIV.S writes f2.',
				9: 'ADD.S writes last: the reader gets the right f2.',
			},
		},
		{
			label: 'Option II: cancel DIV.S write',
			rows: [
				{ label: WAW_ROWS.div, cells: 'F D X/ X/ X/ X/ X/ W!' },
				{ label: WAW_ROWS.add, cells: '. F D X+ X+ W' },
				{ label: '...', cells: '.' },
				{ label: WAW_ROWS.use, cells: '. . . . . . . F D X+' },
			],
			arrows: [{ from: [1, 6], to: [3, 9], kind: 'ok' }],
			track: { label: 'f2 holds', cells: '. . . . . ADD.S~ ADD.S~ ADD.S~ ADD.S~ ADD.S~' },
			notes: {
				1: 'DIV.S spends 5 cycles in the divider (X/).',
				6: 'ADD.S writes f2 on time.',
				8: 'DIV.S’s write is cancelled: f2 keeps ADD.S’s value.',
				9: 'The reader gets the right f2, with no stalls.',
			},
		},
	],
});

const STRUCT_ROWS = ['LW #0(r1) -> r2', 'ADD r4, r3 -> r1', 'SUB r5, r3 -> r1', 'AND r3, r4 -> r6'];
export const structuralHazard = embed('ControlHazardPipeline', 'Structural hazard on a shared memory, fixed by stalling', 451, {
	scenarios: [
		{
			label: 'Hazard',
			rows: [
				{ label: STRUCT_ROWS[0], cells: 'F D X M W' },
				{ label: STRUCT_ROWS[1], cells: '. F D X M W' },
				{ label: STRUCT_ROWS[2], cells: '. . F D X M W' },
				{ label: STRUCT_ROWS[3], cells: '. . . F D X M W' },
			],
			rings: [
				[0, 4],
				[3, 4],
			],
			notes: {
				1: 'One shared memory serves both instruction fetch and data.',
				4: 'Cycle 4: LW reads data (M) while AND is fetched (F).',
			},
		},
		{
			label: 'Stall the younger AND',
			rows: [
				{ label: STRUCT_ROWS[0], cells: 'F D X M W' },
				{ label: STRUCT_ROWS[1], cells: '. F D X M W' },
				{ label: STRUCT_ROWS[2], cells: '. . F D X M W' },
				{ label: STRUCT_ROWS[3], cells: '. . . s* F D X M W' },
			],
			penalty: 1,
			penaltyAt: 4,
			notes: {
				1: 'One shared memory serves both instruction fetch and data.',
				4: 'AND waits a cycle (s*) so LW can use the memory.',
				5: 'AND is fetched in cycle 5: 1 cycle lost.',
			},
		},
	],
});
