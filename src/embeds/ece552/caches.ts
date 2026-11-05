import { embed } from '../types';

export const memoryGap = embed('MemoryGapChart', 'The processor-memory performance gap', 447);
export const locality = embed('LocalityDemo', 'Temporal vs spatial locality', 482, {
	blockSize: 4,
	memWords: 16,
	cacheBlocks: 2,
	modes: [
		{ name: 'Temporal', accesses: [5, 13, 5, 13, 5, 13, 5] },
		{ name: 'Spatial', accesses: [0, 1, 2, 3, 4, 5, 6, 7] },
	],
});
