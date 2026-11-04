import { embed } from '../types';

// ---- Virtual memory ----
export const processLayout = embed('MemFigure', 'IA32 Linux process memory layout', 429, { figure: 'process' });
export const physicalAddressing = embed('AddressTranslation', 'A system using physical addressing', 533, { modes: ['physical'] });
export const virtualMapping = embed('VirtualMapping', 'Virtual memory: per-process page tables onto shared physical memory', 571);
export const pageTableLookup = embed('AddressTranslation', 'Page table lookup and page fault', 568, { modes: ['pt', 'fault'] });
export const tlbLookup = embed('AddressTranslation', 'TLB hit vs TLB miss', 568, { modes: ['pt', 'tlbhit', 'tlbmiss'] });
export const tlbReach = embed('TlbReach', 'TLB reach vs cache, memory and working set', 342);

// ---- Prefetching ----
type Seg = { start: number; len?: number; kind?: 'work' | 'wait' | 'stuck' | 'miss'; label?: string; short?: string; key?: string };
const work = (start: number, label?: string): Seg => ({ start, label });

// Slide 24: every instruction takes one cycle; a miss takes 4.
export const prefetchIdea = embed('OooTimeline', 'Original code vs code with a prefetch', 539, {
	rows: [
		{ id: 'i1', label: 'inst1' },
		{ id: 'pf', label: 'prefetch X' },
		{ id: 'i2', label: 'inst2' },
		{ id: 'i3', label: 'inst3' },
		{ id: 'i4', label: 'inst4' },
		{ id: 'ld', label: 'load X' },
		{ id: 'i5', label: 'inst5 (uses X)' },
		{ id: 'i6', label: 'inst6' },
	],
	modes: [
		{
			label: 'Original code',
			note: 'load X misses; inst5 waits for its value.',
			rows: {
				i1: [work(1)],
				i2: [work(2)],
				i3: [work(3)],
				i4: [work(4)],
				ld: [{ start: 5, len: 4, kind: 'miss', label: 'cache miss', key: 'ldmiss' }],
				i5: [{ start: 6, len: 3, kind: 'wait' }, work(9)],
				i6: [{ start: 7, len: 3, kind: 'stuck' }, work(10)],
			},
		},
		{
			label: 'With prefetching',
			note: 'The prefetch starts the miss early, so load X hits.',
			rows: {
				i1: [work(1)],
				pf: [{ start: 2, len: 4, kind: 'miss', label: 'cache miss', key: 'pfmiss' }],
				i2: [work(3)],
				i3: [work(4)],
				i4: [work(5)],
				ld: [{ ...work(6, 'hit'), key: 'ldhit' }],
				i5: [work(7)],
				i6: [work(8)],
			},
		},
	],
});

export const hardwarePrefetch = embed('StridePrefetcher', 'Hardware prefetching: next-block and stride', 452);
export const prefetchPaths = embed('MemoryHierarchy', 'Core i7 hardware prefetchers', 307, { view: 'prefetch' });

// Slide 28: walking a linked list; process() takes as long as a miss (4 cycles here).
const nodes = [1, 2, 3].map((k) => ({ id: `n${k}`, label: `node ${k}` }));
const proc = (start: number): Seg => ({ start, len: 4, label: 'process(p)', short: 'proc', key: 'proc' });
export const softwarePrefetch = embed('OooTimeline', 'Linked list walk with and without prefetch(q)', 365, {
	rows: nodes,
	unit: 'cycle',
	modes: [
		{
			label: 'process_list',
			note: 'Each node misses before it can be processed.',
			rows: Object.fromEntries(
				nodes.map((r, k) => [r.id, [{ start: 8 * k + 1, len: 4, kind: 'miss', label: 'cache miss', short: 'miss', key: 'm' }, proc(8 * k + 5)]]),
			),
		},
		{
			label: 'process_list_PF',
			note: 'The next node is fetched while process(p) runs.',
			rows: Object.fromEntries(
				nodes.map((r, k) => [
					r.id,
					[{ start: k === 0 ? 1 : 4 * k + 1, len: 4, kind: 'miss', label: k === 0 ? 'cache miss' : 'prefetch', short: k === 0 ? 'miss' : 'pf', key: 'm' }, proc(4 * k + 5)],
				]),
			),
		},
	],
});
