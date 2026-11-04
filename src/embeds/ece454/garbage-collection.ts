import { embed } from '../types';

export const memoryGraph = embed('GcGraph', 'Memory as a graph: reachable blocks and garbage', 362, { variant: 'graph' });
export const markSweep = embed('GcGraph', 'Mark and sweep, and Baker’s algorithm', 670, { variant: 'marksweep' });
export const refCounting = embed('GcGraph', 'Reference counting and a leaked cycle', 580, { variant: 'refcount' });
