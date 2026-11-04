// Average memory access time = hit time + miss rate x miss penalty, as a bar you can drag.
// 100 squares show the accesses (misses in red); the bars show how long an access takes on average.
import { useEffect, useRef, useState } from 'react';
import s from './AmatBar.module.css';

interface Props {
	/** Cycles for a hit. */
	hitTime?: number;
	/** Extra cycles for a miss. */
	missPenalty?: number;
	/** Hit rates (%) drawn as fixed reference bars. */
	references?: number[];
	/** Lowest hit rate on the slider (%). */
	min?: number;
	/** Starting slider value (%). */
	start?: number;
}

const GX = 8; // grid origin
const CELL = 15;
const ROW = 46;

export default function AmatBar({ hitTime = 1, missPenalty = 100, references = [97, 99], min = 90, start = 95 }: Props) {
	const [rate, setRate] = useState(start);
	const rootRef = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = rootRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 540));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	// Wide: squares left, bars right. Narrow (phones): squares above the bars.
	const W = narrow ? 380 : 680;
	const BX = narrow ? 92 : 250; // bar origin
	const BW = narrow ? 250 : 380; // bar area width
	const BY = narrow ? 10 * CELL + 64 : 0; // top of the bar section
	const misses = 100 - rate;
	const amat = (h: number) => hitTime + ((100 - h) / 100) * missPenalty;
	const maxT = amat(min);
	const scale = (t: number) => (t / maxT) * BW;
	const rows = [...references.map((r) => ({ r, live: false })), { r: rate, live: true }];
	const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
	const ticks = Array.from({ length: Math.floor(maxT) + 1 }, (_, t) => t).filter((t) => maxT <= 12 || t % 2 === 0);
	const barsTop = BY + 30;
	const H = Math.max(10 * CELL + 40, barsTop + rows.length * ROW + 30);

	return (
		<div ref={rootRef} className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.controls}`}>
				<label className={s.slider}>
					<span>hit rate</span>
					<input type="range" min={min} max={100} step={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Hit rate" />
					<span className={s.value}>{rate}%</span>
				</label>
				<span className={s.formula}>
					{hitTime} + {(misses / 100).toFixed(2)} × {missPenalty} = <b>{fmt(amat(rate))} cycles</b>
				</span>
			</div>

			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average access time for different hit rates">
				{/* 100 accesses */}
				<text className={s.section} x={GX} y={14}>
					100 accesses
				</text>
				{Array.from({ length: 100 }, (_, n) => {
					const miss = n >= 100 - misses;
					return (
						<rect
							key={n}
							className={miss ? s.cellMiss : s.cellHit}
							x={GX + (n % 10) * CELL}
							y={24 + Math.floor(n / 10) * CELL}
							width={CELL - 3}
							height={CELL - 3}
							rx={2.5}
						/>
					);
				})}
				<text className={s.gridNote} x={GX} y={24 + 10 * CELL + 14}>
					<tspan className={s.missText}>{misses}</tspan> miss{misses === 1 ? '' : 'es'} × {missPenalty} cycles
				</text>

				{/* bars */}
				<text className={s.section} x={narrow ? GX : BX} y={BY + 14}>
					average cycles per access
				</text>
				{ticks.map((t) => (
					<g key={t}>
						<line className={s.tick} x1={BX + scale(t)} x2={BX + scale(t)} y1={barsTop - 4} y2={barsTop + rows.length * ROW - 10} />
						<text className={s.tickText} x={BX + scale(t)} y={barsTop + rows.length * ROW + 6} textAnchor="middle">
							{t}
						</text>
					</g>
				))}
				{rows.map(({ r, live }, n) => {
					const y = barsTop + n * ROW;
					const t = amat(r);
					return (
						<g key={live ? 'live' : r} className={live ? s.live : undefined}>
							<text className={s.rowLabel} x={BX - 10} y={y + 21} textAnchor="end">
								{r}% hits
							</text>
							<rect className={s.hitSeg} x={BX} y={y + 6} width={scale(hitTime)} height={22} rx={3} />
							<rect className={s.missSeg} x={BX + scale(hitTime)} y={y + 6} width={Math.max(0, scale(t - hitTime))} height={22} rx={3} />
							<text className={s.barText} x={BX + scale(t) + 8} y={y + 22}>
								{fmt(t)}
							</text>
						</g>
					);
				})}
			</svg>

			<div className={s.legend}>
				<span className={s.lgHit}>hit time ({hitTime} cycle)</span>
				<span className={s.lgMiss}>miss rate × miss penalty</span>
			</div>
		</div>
	);
}
