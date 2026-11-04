// TLB reach = entries x page size, on one log-scale axis next to the L2 cache and main memory, plus a
// working-set slider that crosses the two thresholds: past the TLB reach you get TLB misses, past
// main memory the pages thrash.
import { useEffect, useRef, useState } from 'react';
import s from './TlbReach.module.css';

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const LO = 16; // axis starts at 2^16 = 64 KB
const HI = 40; // and ends at 2^40 = 1 TB

const fmt = (b: number) => {
	if (b >= 1024 * GB) return `${+(b / (1024 * GB)).toFixed(1)} TB`;
	if (b >= GB) return `${+(b / GB).toFixed(b < 10 * GB ? 1 : 0)} GB`;
	if (b >= MB) return `${+(b / MB).toFixed(b < 10 * MB ? 1 : 0)} MB`;
	return `${Math.round(b / KB)} KB`;
};
const fmtCount = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : `${Math.round(n)}`);

interface Props {
	/** L2 cache size in bytes (slide: 8 MB). */
	l2?: number;
	/** Main memory size in bytes. */
	memory?: number;
	/** Starting TLB entries, page size and working set. */
	entries?: number;
	pageSize?: number;
	workingSet?: number;
}

function useNarrow(below = 540) {
	const ref = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < below));
		ro.observe(el);
		return () => ro.disconnect();
	}, [below]);
	return [ref, narrow] as const;
}

export default function TlbReach({ l2 = 8 * MB, memory = 16 * GB, entries: e0 = 256, pageSize: p0 = 4 * KB, workingSet: w0 = 4 * MB }: Props) {
	const [entLog, setEntLog] = useState(Math.log2(e0));
	const [page, setPage] = useState(p0);
	const [wsLog, setWsLog] = useState(Math.log2(w0));
	const [rootRef, narrow] = useNarrow();

	const entries = 2 ** entLog;
	const reach = entries * page;
	const ws = 2 ** wsLog;
	const wsPages = ws / page;
	const zone = ws > memory ? 'thrash' : wsPages > entries ? 'tlbmiss' : 'hit';

	const W = narrow ? 400 : 680;
	const LW = narrow ? 92 : 128;
	const AW = W - LW - (narrow ? 12 : 20);
	const x = (b: number) => LW + ((Math.log2(Math.max(b, 2 ** LO)) - LO) / (HI - LO)) * AW;
	const ROW = 34;
	const TOP = 30;
	const bars = [
		{ id: 'reach', label: 'TLB reach', value: reach, text: `${entries} × ${fmt(page)} = ${fmt(reach)}` },
		{ id: 'l2', label: 'L2 cache', value: l2, text: fmt(l2) },
		{ id: 'mem', label: 'Main memory', value: memory, text: fmt(memory) },
		{ id: 'ws', label: 'Working set', value: ws, text: `${fmt(ws)} = ${fmtCount(wsPages)} pages` },
	];
	const H = TOP + bars.length * ROW + 34;
	const ticks = narrow ? [16, 24, 32, 40] : [16, 20, 24, 28, 32, 36, 40];

	return (
		<div ref={rootRef} className={`not-content ${s.root}`}>
			<div className={s.controls}>
				<label className={s.slider}>
					<span>
						TLB entries <b>{entries}</b>
					</span>
					<input type="range" min={4} max={11} step={1} value={entLog} onChange={(e) => setEntLog(+e.target.value)} aria-label="TLB entries" />
				</label>
				<div className={`viz-controls ${s.seg}`} role="group" aria-label="Page size">
					<span className={s.segLabel}>page size</span>
					{[4 * KB, 2 * MB].map((p) => (
						<button key={p} className={p === page ? 'viz-primary' : undefined} aria-pressed={p === page} onClick={() => setPage(p)}>
							{p === 4 * KB ? '4 KB' : '2 MB (huge)'}
						</button>
					))}
				</div>
				<label className={s.slider}>
					<span>
						working set <b>{fmt(ws)}</b>
					</span>
					<input type="range" min={LO} max={HI} step={0.5} value={wsLog} onChange={(e) => setWsLog(+e.target.value)} aria-label="Working set size" />
				</label>
			</div>

			<p className={`${s.verdict} ${s[zone]}`}>
				{zone === 'hit' && (
					<>
						<b>TLB hits.</b> {fmtCount(wsPages)} pages ≤ {entries} TLB entries.
					</>
				)}
				{zone === 'tlbmiss' && (
					<>
						<b>TLB misses.</b> {fmtCount(wsPages)} pages &gt; {entries} TLB entries.
					</>
				)}
				{zone === 'thrash' && (
					<>
						<b>Thrashing.</b> The working set is bigger than main memory.
					</>
				)}
			</p>

			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="TLB reach compared with cache and memory sizes">
				{/* zones */}
				<rect className={`${s.zone} ${s.zHit}`} x={LW} y={TOP - 6} width={x(reach) - LW} height={bars.length * ROW + 4} style={{ transition: 'width 400ms' }} />
				<rect className={`${s.zone} ${s.zMiss}`} x={x(reach)} y={TOP - 6} width={Math.max(0, x(memory) - x(reach))} height={bars.length * ROW + 4} />
				<rect className={`${s.zone} ${s.zThrash}`} x={x(memory)} y={TOP - 6} width={LW + AW - x(memory)} height={bars.length * ROW + 4} />
				{[
					{ cls: s.tHit, x0: LW, x1: x(reach), text: narrow ? 'hits' : 'TLB hits' },
					{ cls: s.tMiss, x0: x(reach), x1: x(memory), text: 'TLB misses' },
					{ cls: s.tThrash, x0: x(memory), x1: LW + AW, text: 'thrashing' },
				]
					.filter((z) => z.x1 - z.x0 >= z.text.length * 7.5 + 6)
					.map((z) => (
						<text key={z.text} className={`${s.zoneLabel} ${z.cls}`} x={z.x0 + 4} y={TOP - 12}>
							{z.text}
						</text>
					))}

				{/* grid */}
				{ticks.map((k) => (
					<g key={k}>
						<line className={s.grid} x1={x(2 ** k)} x2={x(2 ** k)} y1={TOP - 6} y2={TOP + bars.length * ROW - 2} />
						<text className={s.tick} x={x(2 ** k)} y={TOP + bars.length * ROW + 14} textAnchor={k === HI ? 'end' : k === LO ? 'start' : 'middle'}>
							{fmt(2 ** k)}
						</text>
					</g>
				))}

				{bars.map((b, i) => {
					const y = TOP + i * ROW;
					const w = x(b.value) - LW;
					const inside = w > b.text.length * 7 + 16;
					return (
						<g key={b.id} className={`${s.bar} ${s[`b_${b.id}`]} ${b.id === 'ws' ? s[`ws_${zone}`] : ''}`}>
							<text className={s.barLabel} x={LW - 8} y={y + 18} textAnchor="end">
								{b.label}
							</text>
							<rect x={LW} y={y + 4} width={Math.max(2, w)} height={ROW - 10} rx={4} />
							<text className={`${s.value} ${inside ? s.valueIn : ''}`} x={inside ? LW + w - 8 : LW + w + 6} y={y + 21} textAnchor={inside ? 'end' : 'start'}>
								{b.text}
							</text>
						</g>
					);
				})}
				<text className={s.axisNote} x={LW} y={H - 2}>
					{narrow ? 'log scale: each grid line is 256x the last' : 'log scale: each grid line is 16x the last'}
				</text>
			</svg>
		</div>
	);
}
