// Timeline of instructions (rows, in program order) against cycles (columns), shown under several
// execution modes, e.g. in-order vs out-of-order. Switching modes slides each block to its new cycle,
// so the eye sees which instructions moved earlier and how much total time was saved.
//
// Data-driven: each mode lists, per row, its segments (1-based start cycle, length, kind, label).
// Segments are matched across modes by `key` (default: their label), so the same block slides.
import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import s from './OooTimeline.module.css';

export type SegKind = 'work' | 'wait' | 'stuck' | 'miss' | 'flush';

export interface Seg {
	/** First cycle (1-based). */
	start: number;
	len?: number;
	kind?: SegKind;
	label?: string;
	/** Shorter label used when `label` doesn't fit (e.g. on phones). */
	short?: string;
	/** Identity across modes (defaults to the label, or the kind). */
	key?: string;
}
export interface TimelineMode {
	label: string;
	/** One short sentence shown above the figure. */
	note?: string;
	rows: Record<string, Seg[]>;
}
export interface TimelineRow {
	id: string;
	label: string;
}

interface Props {
	rows: TimelineRow[];
	modes: TimelineMode[];
	/** Number of cycle columns to draw (defaults to the longest mode). */
	cycles?: number;
	/** What the time axis counts, e.g. "cycle". */
	unit?: string;
	/** aria label for the figure. */
	title?: string;
}

/** Width of an element in CSS px, tracked with a ResizeObserver; `fallback` before mount. */
export function useWidth(ref: RefObject<HTMLElement | null>, fallback = 700) {
	const [w, setW] = useState(fallback);
	const [measured, setMeasured] = useState(false);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		setW(el.clientWidth);
		const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
		ro.observe(el);
		// Turn on transitions only after the first real measurement, so nothing slides on load.
		const t = setTimeout(() => setMeasured(true), 60);
		return () => {
			ro.disconnect();
			clearTimeout(t);
		};
	}, []);
	return [w, measured] as const;
}

const KIND_LABEL: Record<SegKind, string> = {
	work: 'Doing work',
	wait: 'Waiting for a result',
	stuck: 'Stuck behind an earlier instruction',
	miss: 'Cache miss (memory latency)',
	flush: 'Wrong guess, flushed',
};

const segEnd = (g: Seg) => g.start + (g.len ?? 1) - 1;
const keyOf = (g: Seg) => g.key ?? g.label ?? g.kind ?? 'work';
const counts = (g: Seg) => g.kind !== 'wait' && g.kind !== 'stuck' && g.kind !== 'flush';
export const modeTotal = (m: TimelineMode) =>
	Math.max(0, ...Object.values(m.rows).flatMap((segs) => segs.filter(counts).map(segEnd)));

const ROW = 30;
const HEAD = 24;
const BAR = 20;
const BAR_GAP = 6;

export default function OooTimeline({ rows, modes, cycles, unit = 'cycle', title }: Props) {
	const [mode, setMode] = useState(0);
	const wrap = useRef<HTMLDivElement>(null);
	const [width, ready] = useWidth(wrap);
	const pid = useId().replace(/:/g, '');

	const totals = modes.map(modeTotal);
	const ncols = cycles ?? Math.max(...modes.map((m) => Math.max(0, ...Object.values(m.rows).flat().map(segEnd))));
	const longest = Math.max(...rows.map((r) => r.label.length), ...modes.map((m) => m.label.length * 0.85));
	const LW = Math.min(Math.round(longest * 7.6 + 14), Math.round(width * 0.34));
	const col = Math.max(10, (width - LW - 4) / ncols);
	const W = LW + col * ncols + 2;
	const gridH = HEAD + rows.length * ROW;
	const barsY = gridH + 18;
	const H = barsY + 16 + modes.length * (BAR + BAR_GAP);
	const x = (cycle: number) => LW + (cycle - 1) * col;

	// Every segment that exists in any mode, so blocks that only exist in some modes can fade in/out.
	const cur = modes[mode];
	// Stable order (so DOM nodes never move and transitions run); geometry from the current mode if present.
	const all = new Map<string, { row: number; seg: Seg; present: boolean }>();
	for (const m of modes) {
		rows.forEach((r, ri) => {
			for (const g of m.rows[r.id] ?? []) {
				const k = `${r.id}|${keyOf(g)}`;
				if (all.has(k)) continue;
				const mine = (cur.rows[r.id] ?? []).find((h) => keyOf(h) === keyOf(g));
				all.set(k, { row: ri, seg: mine ?? g, present: !!mine });
			}
		});
	}

	const kinds = new Set<SegKind>();
	for (const m of modes) for (const segs of Object.values(m.rows)) for (const g of segs) kinds.add(g.kind ?? 'work');

	const step = col >= 20 ? 1 : col >= 11 ? 2 : 4;
	const total = totals[mode];

	return (
		<figure className={`not-content ${s.root} ${ready ? s.ready : ''}`}>
			<div className={`viz-controls ${s.modes}`} role="group" aria-label="Execution mode">
				{modes.map((m, i) => (
					<button key={m.label} className={i === mode ? 'viz-primary' : undefined} aria-pressed={i === mode} onClick={() => setMode(i)}>
						{m.label}
					</button>
				))}
			</div>
			{modes.some((m) => m.note) && <p className={s.message}>{cur.note}</p>}

			<div ref={wrap} className={s.wrap}>
				<svg className={s.svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title ?? modes.map((m) => m.label).join(' vs ')}>
					<defs>
						<pattern id={`${pid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<rect width="6" height="6" className={s.hatchBg} />
							<line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
						</pattern>
					</defs>

					{/* Cycle header and column guides */}
					<text className={s.axis} x={LW - 8} y={16} textAnchor="end">
						{unit}
					</text>
					{Array.from({ length: ncols }, (_, i) => (
						<g key={i}>
							<rect x={x(i + 1)} y={HEAD} width={col} height={rows.length * ROW} className={i % 2 ? s.colOdd : s.colEven} />
							{i % step === 0 ? (
								<text className={s.axis} x={x(i + 1) + col / 2} y={16} textAnchor="middle">
									{i + 1}
								</text>
							) : null}
						</g>
					))}

					{/* Row labels */}
					{rows.map((r, ri) => (
						<text
							key={r.id}
							className={`${s.rowLabel} ${(cur.rows[r.id] ?? []).length ? '' : s.rowEmpty}`}
							x={4}
							y={HEAD + ri * ROW + ROW / 2 + 4}
						>
							{r.label}
						</text>
					))}

					{/* Segments */}
					{[...all.entries()].map(([k, { row, seg, present }]) => {
						const len = seg.len ?? 1;
						const kind = seg.kind ?? 'work';
						const w = len * col - 3;
						const fit = (txt: string) => txt.length * 6.6 + 6 <= w;
						const label = fit(seg.label ?? '') ? (seg.label ?? '') : seg.short && fit(seg.short) ? seg.short : '';
						const fits = label !== '';
						return (
							<g
								key={k}
								className={`${s.seg} ${s[kind]}`}
								style={{ transform: `translate(${x(seg.start) + 1.5}px, ${HEAD + row * ROW + 4}px)`, opacity: present ? 1 : 0 }}
							>
								<rect width={w} height={ROW - 8} rx={4} fill={kind === 'miss' ? `url(#${pid}-hatch)` : undefined} />
								{fits && (
									<text x={w / 2} y={(ROW - 8) / 2 + 4} textAnchor="middle">
										{label}
									</text>
								)}
							</g>
						);
					})}

					{/* Finish line for the current mode */}
					<g className={s.finish} style={{ transform: `translate(${x(total + 1)}px, 0px)` }}>
						<line x1={0} x2={0} y1={HEAD - 4} y2={gridH + 4} />
					</g>

					{/* Total time per mode */}
					<text className={s.axis} x={4} y={barsY + 4}>
						Total time
					</text>
					{modes.map((m, i) => {
						const y = barsY + 12 + i * (BAR + BAR_GAP);
						const bw = totals[i] * col;
						return (
							<g key={m.label} className={i === mode ? s.barCur : s.bar} onClick={() => setMode(i)}>
								<text className={s.barLabel} x={LW - 8} y={y + BAR / 2 + 4} textAnchor="end">
									{m.label}
								</text>
								<rect x={LW} y={y} width={bw} height={BAR} rx={4} />
								<text
									className={`${s.barValue} ${bw > 80 ? s.barValueIn : ''}`}
									x={bw > 80 ? LW + bw - 8 : LW + bw + 6}
									y={y + BAR / 2 + 4}
									textAnchor={bw > 80 ? 'end' : 'start'}
								>
									{totals[i]} {unit}s
								</text>
							</g>
						);
					})}
				</svg>
			</div>

			<div className={s.legend}>
				{(['work', 'wait', 'stuck', 'miss', 'flush'] as SegKind[])
					.filter((k) => kinds.has(k))
					.map((k) => (
						<span key={k} className={s.lg}>
							<svg width="22" height="12" aria-hidden="true">
								<defs>
									<pattern id={`${pid}-lg`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
										<rect width="5" height="5" className={s.hatchBg} />
										<line x1="0" y1="0" x2="0" y2="5" className={s.hatchLine} />
									</pattern>
								</defs>
								<g className={s[k]}>
									<rect x="1" y="1" width="20" height="10" rx="2.5" fill={k === 'miss' ? `url(#${pid}-lg)` : undefined} />
								</g>
							</svg>
							{KIND_LABEL[k]}
						</span>
					))}
				<span className={s.lg}>
					<svg width="22" height="12" aria-hidden="true">
						<line x1="11" x2="11" y1="0" y2="12" className={s.finishSwatch} />
					</svg>
					Last instruction done
				</span>
			</div>
		</figure>
	);
}
