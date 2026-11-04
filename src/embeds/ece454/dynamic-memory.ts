import { embed } from '../types';

const ALLOC_OPS = ['p1 = malloc(4)', 'p2 = malloc(5)', 'p3 = malloc(6)', 'free(p2)'];
const SIZE_CLASSES = [
	{ label: '1-2', min: 0, max: 2 },
	{ label: '3', min: 2, max: 3 },
	{ label: '4', min: 3, max: 4 },
	{ label: '5-8', min: 4, max: 8 },
	{ label: '9-16', min: 8, max: 16 },
];

export const processImage = embed('MemFigure', 'Typical process memory image', 429, { figure: 'process' });

export const misalignedRead = embed('MisalignedRead', 'A misaligned int across word and cache block boundaries', 327);

export const structExamples = embed('StructLayout', 'Struct layout with alignment', 386, {
	structs: [
		{
			label: 'char, int[2]',
			name: 'S1',
			fields: [
				{ name: 'c', type: 'char' },
				{ name: 'i[0]', type: 'int', decl: 'int i[2]' },
				{ name: 'i[1]', type: 'int', decl: 'int i[2]' },
			],
		},
		{
			label: 'char, int[2], double',
			name: 'S1',
			fields: [
				{ name: 'c', type: 'char' },
				{ name: 'i[0]', type: 'int', decl: 'int i[2]' },
				{ name: 'i[1]', type: 'int', decl: 'int i[2]' },
				{ name: 'v', type: 'double' },
			],
		},
	],
});

export const structReorder = embed('StructLayout', 'Reordering struct fields to save space', 464, {
	array: 10,
	structs: [
		{
			label: 'short, int, short',
			name: 'S3',
			fields: [
				{ name: 'i', type: 'short' },
				{ name: 'v', type: 'int' },
				{ name: 'j', type: 'short' },
			],
		},
		{
			label: 'short, short, int',
			name: 'S3',
			fields: [
				{ name: 'i', type: 'short' },
				{ name: 'j', type: 'short' },
				{ name: 'v', type: 'int' },
			],
		},
	],
});

export const internalFrag = embed('StructLayout', 'Internal fragmentation: malloc(13) with 4-byte words', 350, {
	base: 'p1',
	structs: [{ label: 'malloc(13)', code: 'p1 = malloc(13);   // word = sizeof(void *) = 4 bytes', fields: [{ name: 'payload', size: 13, align: 1 }], align: 4 }],
});

export const allocExample = embed('HeapSim', 'Allocation example and external fragmentation', 415, {
	words: 17,
	stats: true,
	variants: [
		{ label: 'p4 = malloc(2)', ops: [...ALLOC_OPS, 'p4 = malloc(2)'] },
		{ label: 'p4 = malloc(6)', ops: [...ALLOC_OPS, 'p4 = malloc(6)'] },
	],
});

export const placementPolicies = embed('HeapSim', 'Placement policies on an implicit list', 418, {
	list: 'implicit',
	blocks: [{ size: 6 }, { size: 3, alloc: true, name: 'p1' }, { size: 8 }, { size: 2, alloc: true, name: 'p2' }, { size: 4 }, { size: 3, alloc: true, name: 'p3' }],
	rover: 1,
	ops: ['p4 = malloc(3)'],
	variants: [
		{ label: 'First fit', policy: 'first' },
		{ label: 'Next fit', policy: 'next' },
		{ label: 'Best fit', policy: 'best' },
	],
});

export const coalescing = embed('HeapSim', 'Freeing with and without coalescing', 418, {
	list: 'implicit',
	blocks: [{ size: 4 }, { size: 4, alloc: true, name: 'q' }, { size: 4, alloc: true, name: 'p' }, { size: 2 }, { size: 2, alloc: true, name: 'r' }],
	ops: ['free(p)', 'p2 = malloc(5)'],
	variants: [
		{ label: 'No coalescing', coalesce: false },
		{ label: 'Coalescing', coalesce: true },
	],
});

export const coalesceCases = embed('CoalesceCases', 'Constant-time coalescing with boundary tags', 337);

export const explicitList = embed('HeapSim', 'Explicit free list: allocate, free, coalesce', 463, {
	list: 'explicit',
	footers: true,
	coalesce: true,
	blocks: [
		{ size: 4, name: 'A' },
		{ size: 4, alloc: true, name: 'w' },
		{ size: 10, name: 'C' },
		{ size: 4, alloc: true, name: 'y' },
		{ size: 4, name: 'B' },
	],
	freeOrder: ['A', 'B', 'C'],
	ops: ['x = malloc(4)', 'free(w)', 'free(y)'],
	variants: [
		{ label: 'LIFO', insert: 'lifo' },
		{ label: 'Address order', insert: 'address' },
	],
});

export const segregatedLists = embed('SegregatedLists', 'Segregated free lists', 556, {
	classes: SIZE_CLASSES,
	scenarios: [
		{ label: 'Simple segregated', kind: 'simple', lists: [[2, 2], [3], [4, 4], [8], []], ops: ['p1 = malloc(6)', 'p2 = malloc(12)', 'free(p1)'] },
		{ label: 'Segregated fit', kind: 'fit', lists: [[2], [], [4], [5, 8], [12]], ops: ['p1 = malloc(7)', 'p2 = malloc(3)', 'free(p1)'] },
	],
});

export const buddyAllocator = embed('BuddyAllocator', 'Binary buddy allocator example', 748);

export const allocPatterns = embed('MemFigure', 'Allocation patterns', 219, { figure: 'patterns' });
