import { embed } from '../types';

export const arrayAccess1d = embed('MatrixAccess', '1D array: sequential access and reuse', 482, {
	presets: ['seq', 'outer-fits', 'outer-nofit'],
});
export const arrayAccess2d = embed('MatrixAccess', '2D array: row order vs column order', 638, {
	presets: ['row-fits', 'row-nofit', 'col-fits', 'col-nofit'],
});
export const loopInterchange = embed('MatrixAccess', 'Loop interchange', 606, {
	presets: ['interchange-before', 'interchange-after'],
});
export const matmulTinyCache = embed('MatrixAccess', 'Matrix multiply on a 4-block cache', 653, {
	presets: ['matmul'],
});
export const tilingGrid = embed('TilingViz', 'Untiled vs tiled matrix multiply: misses', 547, { view: 'grid', n: 24, T: 8, block: 8 });
export const tilingTotals = embed('TilingViz', 'Total misses: untiled vs tiled', 222, { view: 'totals', cacheBytes: 32768, cacheName: 'L1' });
