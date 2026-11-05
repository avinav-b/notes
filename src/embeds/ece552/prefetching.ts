import { embed } from '../types';

export const whenToPrefetch = embed('DeadBlockPrefetch', 'When to prefetch: evicting a live vs a dead block', 319, {
	initial: 'A',
	end: 10,
	uses: [
		{ t: 1, block: 'A' },
		{ t: 2.5, block: 'A' },
		{ t: 4, block: 'A' },
		{ t: 8, block: 'B' },
	],
	modes: [
		{ name: 'No prefetch', prefetch: null },
		{ name: 'Too early', prefetch: { t: 3, block: 'B' } },
		{ name: 'Once A is dead', prefetch: { t: 5.5, block: 'B' } },
	],
});
