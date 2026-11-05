// When to prefetch: one cache frame over time. Block A is resident and still used for a while, then it
// is dead (never used again). Prefetching B into the frame while A is live evicts a useful block (A
// misses and comes back, pushing B out); prefetching once A is dead costs nothing and B hits.
// Data-driven: the access stream, the initial block, and the prefetch time of each mode.
import { useRef, useState } from 'react';
import { useWidth } from './OooTimeline';
import s from './DeadBlockPrefetch.module.css';

interface Use {
	t: number;
	block: string;
}
interface Mode {
	name: string;
	/** Prefetch time and block, or null for no prefetch. */
	prefetch: { t: number; block: string } | null;
}
interface Props {
	uses?: Use[];
	initial?: string;
	end?: number;
	modes?: Mode[];
}

const USES: Use[] = [
	{ t: 1, block: 'A' },
	{ t: 2.5, block: 'A' },
	{ t: 4, block: 'A' },
	{ t: 8, block: 'B' },
];
const MODES: Mode[] = [
	{ name: 'No prefetch', prefetch: null },
	{ name: 'Too early', prefetch: { t: 3, block: 'B' } },
	{ name: 'Once A is dead', prefetch: { t: 5.5, block: 'B' } },
];
const COLORS = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)', 'var(--viz-series-4)'];

interface Seg {
	block: string;
	from: number;
	to: number;
}

function simulate(uses: Use[], initial: string, end: number, prefetch: Mode['prefetch']) {
	const events = [...uses.map((u) => ({ ...u, kind: 'use' as const })), ...(prefetch ? [{ ...prefetch, kind: 'prefetch' as const }] : [])].sort((a, b) => a.t - b.t);
	const segs: Seg[] = [{ block: initial, from: 0, to: end }];
	const outcomes: (Use & { hit: boolean })[] = [];
	for (const e of events) {
		const cur = segs[segs.length - 1];
		const hit = cur.block === e.block;
		if (e.kind === 'use') outcomes.push({ t: e.t, block: e.block, hit });
		if (!hit) {
			cur.to = e.t;
			segs.push({ block: e.block, from: e.t, to: end });
		}
	}
	return { segs, outcomes };
}

export default function DeadBlockPrefetch({ uses = USES, initial = 'A', end = 10, modes = MODES }: Props) {
	const [mi, setMi] = useState(modes.length - 1);
	const mode = modes[mi];
	const wrap = useRef<HTMLDivElement>(null);
	const [width] = useWidth(wrap);
	const narrow = width < 500;
	const { segs, outcomes } = simulate(uses, initial, end, mode.prefetch);
	const misses = outcomes.filter((o) => !o.hit).length;
	const blocks = [...new Set([initial, ...uses.map((u) => u.block)])];
	const color = (b: string) => COLORS[blocks.indexOf(b) % COLORS.length];
	const lastUse = (b: string) => Math.max(...uses.filter((u) => u.block === b).map((u) => u.t));

	const L = narrow ? 8 : 104;
	const R = 16;
	const x = (t: number) => L + (t / end) * (width - L - R);
	const yUse = narrow ? 60 : 34;
	const yFrame = yUse + (narrow ? 66 : 58);
	const FH = 30;
	const H = yFrame + FH + 34;

	const evicted = mode.prefetch ? segs.find((sg) => sg.to === mode.prefetch!.t) : undefined;
	const evictedLive = evicted && lastUse(evicted.block) > evicted.to;
	let msg = `No prefetch: B misses when it is first used.`;
	if (mode.prefetch && evictedLive) msg = `Prefetching B evicts A while A is still live: more misses.`;
	else if (mode.prefetch) msg = `A is dead, so evicting it costs nothing: B hits.`;

	return (
		<div className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.controls}`}>
				<div className={s.seg} role="group" aria-label="Prefetch timing">
					{modes.map((m, i) => (
						<button key={m.name} className={`viz-btn ${i === mi ? s.on : ''}`} aria-pressed={i === mi} onClick={() => setMi(i)}>
							{m.name}
						</button>
					))}
				</div>
				<span className={misses ? s.missCount : s.okCount}>
					{misses} {misses === 1 ? 'miss' : 'misses'}
				</span>
			</div>
			<p className={s.message} aria-live="polite">
				{msg}
			</p>
			<div ref={wrap} className={s.wrap}>
				<svg className={s.svg} width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={msg}>
					<text className={s.rowLbl} x={narrow ? L : L - 10} y={narrow ? yUse - 26 : yUse + 4} textAnchor={narrow ? 'start' : 'end'}>
						Accesses
					</text>
					<text className={s.rowLbl} x={narrow ? L : L - 10} y={narrow ? yFrame - 8 : yFrame + FH / 2 + 4} textAnchor={narrow ? 'start' : 'end'}>
						Cache frame
					</text>

					{/* Frame contents over time */}
					{segs.map((sg, i) => {
						// The last segment runs to the end of the window: its future is unknown, so it stays live.
						const deadFrom = sg.to >= end ? sg.to : Math.max(sg.from, Math.min(sg.to, lastUse(sg.block)));
						return (
							<g key={`${mi}-${i}`} style={{ ['--c' as string]: color(sg.block) }}>
								<rect className={s.live} x={x(sg.from)} y={yFrame} width={Math.max(0, x(deadFrom) - x(sg.from))} height={FH} />
								<rect className={s.dead} x={x(deadFrom)} y={yFrame} width={Math.max(0, x(sg.to) - x(deadFrom))} height={FH} />
								<text className={s.segLbl} x={deadFrom > sg.from ? (x(sg.from) + x(deadFrom)) / 2 : (x(sg.from) + x(sg.to)) / 2} y={yFrame + FH / 2 + 5} textAnchor="middle">
									{sg.block}
									{deadFrom === sg.from && deadFrom < sg.to && x(sg.to) - x(sg.from) > 70 ? ' (dead)' : ''}
								</text>
								{deadFrom > sg.from && x(sg.to) - x(deadFrom) > 50 && (
									<text className={s.deadLbl} x={(x(deadFrom) + x(sg.to)) / 2} y={yFrame + FH / 2 + 4} textAnchor="middle">
										dead
									</text>
								)}
							</g>
						);
					})}
					<line className={s.axis} x1={x(0)} x2={x(end) + 8} y1={yFrame + FH + 12} y2={yFrame + FH + 12} />
					<polygon className={s.axisHead} points={`${x(end) + 10},${yFrame + FH + 12} ${x(end) + 3},${yFrame + FH + 8} ${x(end) + 3},${yFrame + FH + 16}`} />
					<text className={s.axisLbl} x={x(end)} y={yFrame + FH + 28} textAnchor="end">
						time
					</text>

					{/* Prefetch */}
					{mode.prefetch && (
						<g className={s.pf}>
							<line x1={x(mode.prefetch.t)} x2={x(mode.prefetch.t)} y1={yUse + 18} y2={yFrame - 4} />
							<polygon points={`${x(mode.prefetch.t)},${yFrame - 1} ${x(mode.prefetch.t) - 5},${yFrame - 9} ${x(mode.prefetch.t) + 5},${yFrame - 9}`} />
							<text x={x(mode.prefetch.t) + 7} y={(yUse + yFrame) / 2 + 6}>
								prefetch {mode.prefetch.block}
							</text>
						</g>
					)}

					{/* Accesses */}
					{outcomes.map((o, i) => (
						<g key={i} className={o.hit ? s.hit : s.miss}>
							<line x1={x(o.t)} x2={x(o.t)} y1={yUse + 12} y2={yFrame} />
							<circle cx={x(o.t)} cy={yUse} r={12} />
							<text x={x(o.t)} y={yUse + 4.5} textAnchor="middle">
								{o.block}
							</text>
							<text className={s.outcome} x={x(o.t)} y={yUse - 17} textAnchor="middle">
								{o.hit ? 'hit' : 'miss'}
							</text>
						</g>
					))}
				</svg>
			</div>
			<div className={s.legend}>
				{blocks.map((b) => (
					<span key={b} className={s.lg} style={{ ['--c' as string]: color(b) }}>
						<span className={s.swLive} /> {b} live
					</span>
				))}
				<span className={s.lg}>
					<span className={s.swDead} /> dead: never used again
				</span>
				<span className={s.lg}>
					<span className={s.swHit} /> hit
				</span>
				<span className={s.lg}>
					<span className={s.swMiss} /> miss
				</span>
			</div>
		</div>
	);
}
