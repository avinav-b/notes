import { embed } from '../types';

export const cacheHitMiss = embed('CacheSim', 'Cache hit and miss', 512, {
	configs: [{ name: 'Fully associative, 4 blocks', sets: 1, ways: 4 }],
	blockSize: 1,
	addrBits: 4,
	showBits: false,
	memory: 'grid',
	memoryBlocks: 16,
	initial: [
		{ addr: 8, age: -3 },
		{ addr: 9, age: -4 },
		{ addr: 14, age: -2 },
		{ addr: 3, age: -1 },
	],
	accesses: [{ addr: 14 }, { addr: 12 }],
});

export const directVsTwoWay = embed('CacheSim', 'Direct-mapped vs 2-way set associative', 718, {
	configs: [
		{ name: 'Direct-mapped (64 sets)', sets: 64, ways: 1 },
		{ name: '2-way (32 sets)', sets: 32, ways: 2 },
	],
	blockSize: 8,
	addrBits: 12,
	accesses: [
		{ addr: 0x0, label: 'a[0]' },
		{ addr: 0x200, label: 'a[64]' },
		{ addr: 0x0, label: 'a[0]' },
		{ addr: 0x8, label: 'a[1]' },
		{ addr: 0x100, label: 'a[32]' },
	],
});

export const conflictMisses = embed('CacheSim', 'Conflict misses: blocks 0, 8, 0, 8', 803, {
	configs: [
		{ name: 'Direct-mapped (8 sets)', sets: 8, ways: 1 },
		{ name: '2-way (4 sets)', sets: 4, ways: 2 },
	],
	blockSize: 1,
	addrBits: 4,
	accesses: [0, 8, 0, 8, 0, 8].map((b) => ({ addr: b, label: `block ${b}` })),
});

export const averageAccessTime = embed('AmatBar', 'Average access time vs hit rate', 300, {
	hitTime: 1,
	missPenalty: 100,
	references: [97, 99],
	min: 90,
	start: 95,
});

export const memoryPyramid = embed('MemoryHierarchy', 'The memory hierarchy: size and latency', 612, { view: 'pyramid' });
export const ugMachineCaches = embed('MemoryHierarchy', 'Caches on the UG machines (Core i7-4790)', 427, { view: 'chip' });
