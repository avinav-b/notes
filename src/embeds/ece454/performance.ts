import { embed } from '../types';

export const latencyThroughput = embed('ServerTimeline', 'Latency vs throughput on three machines', 465, {
	requests: 3,
	work: 4,
	speedup: 2,
	cores: 3,
	slowdown: 3,
	unit: 'ms',
});

export const throughputVsThreads = embed('ThroughputCurve', 'Throughput vs number of threads', 421);
