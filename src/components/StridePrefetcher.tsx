// Hardware prefetching, one access at a time. An address stream arrives; the prefetcher (none,
// next-block, or stride) requests blocks ahead of it; later accesses hit on prefetched blocks.
// Memory is drawn as two 4 KB pages of cache blocks; prefetches never cross a page boundary.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { StepControls, useStepper } from './StepControls';
import s from './StridePrefetcher.module.css';

const BLOCK = 0x100; // toy block size, so the slide's addresses land on whole blocks
const PAGE = 0x1000;
const PER_PAGE = PAGE / BLOCK;
const NPAGES = 2;

type Kind = 'none' | 'next' | 'stride';
const KINDS: { id: Kind; label: string }[] = [
	{ id: 'none', label: 'No prefetch' },
	{ id: 'next', label: 'Next-block' },
	{ id: 'stride', label: 'Stride' },
];
interface Stream {
	label: string;
	addrs: number[];
}
const STREAMS: Stream[] = [
	{ label: 'Stride 0x200', addrs: Array.from({ length: 10 }, (_, i) => 0x100 + i * 0x200) },
	{ label: 'Sequential', addrs: Array.from({ length: 10 }, (_, i) => 0xa00 + i * 0x100) },
];

const hex = (a: number) => `0x${a.toString(16).toUpperCase()}`;
const pageOf = (a: number) => Math.floor(a / PAGE);

interface Pf {
	to: number;
	blocked: boolean;
}
interface Frame {
	/** Result of each access so far. */
	results: ('hit' | 'miss')[];
	cached: Set<number>;
	/** Prefetched blocks not (yet) used by an access. */
	unused: Set<number>;
	/** Prefetched blocks that a later access hit on. */
	useful: Set<number>;
	demand: Set<number>;
	pfs: Pf[];
	stride: number | null;
	confirmed: boolean;
	issued: number;
}

function simulate(kind: Kind, addrs: number[], upto: number): Frame {
	const f: Frame = { results: [], cached: new Set(), unused: new Set(), useful: new Set(), demand: new Set(), pfs: [], stride: null, confirmed: false, issued: 0 };
	let last: number | null = null;
	for (let i = 0; i < upto; i++) {
		const a = addrs[i];
		const hit = f.cached.has(a);
		f.results.push(hit ? 'hit' : 'miss');
		if (f.unused.has(a)) {
			f.unused.delete(a);
			f.useful.add(a);
		} else if (!hit) f.demand.add(a);
		f.cached.add(a);
		f.pfs = [];
		const want: number[] = [];
		if (kind === 'next') want.push(a + BLOCK);
		if (kind === 'stride') {
			if (last !== null) {
				const st = a - last;
				f.confirmed = st !== 0 && st === f.stride;
				f.stride = st;
			}
			last = a;
			if (f.confirmed && f.stride) want.push(a + f.stride, a + 2 * f.stride);
		}
		for (const t of want) {
			if (pageOf(t) !== pageOf(a)) f.pfs.push({ to: t, blocked: true });
			else if (!f.cached.has(t)) {
				f.pfs.push({ to: t, blocked: false });
				f.cached.add(t);
				f.unused.add(t);
				f.issued += 1;
			}
		}
	}
	return f;
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

interface Props {
	/** Prefetchers to offer (default: all). */
	kinds?: Kind[];
	/** Starting prefetcher. */
	kind?: Kind;
}

export default function StridePrefetcher({ kinds = ['none', 'next', 'stride'], kind: k0 = 'stride' }: Props) {
	const [kind, setKind] = useState<Kind>(k0);
	const [si, setSi] = useState(0);
	const stream = STREAMS[si];
	const n = stream.addrs.length;
	const stepper = useStepper(n, { intervalMs: 1300 });
	const step = stepper.step;
	const [rootRef, narrow] = useNarrow();
	const f = simulate(kind, stream.addrs, step);
	const cur = step > 0 ? stream.addrs[step - 1] : null;
	const hits = f.results.filter((r) => r === 'hit').length;
	const misses = f.results.length - hits;

	// ---- layout ----
	const W = narrow ? 400 : 680;
	const perRow = narrow ? 8 : 16;
	const LW = narrow ? 0 : 58;
	const cw = (W - LW - 28) / perRow;
	const CH = 28;
	const rowsPerPage = PER_PAGE / perRow;
	const ROWGAP = 40; // room for prefetch arcs above each row
	const PAGEGAP = narrow ? 18 : 0;
	const TOP = 34;
	const rowY = (r: number) => TOP + r * (CH + ROWGAP) + Math.floor(r / rowsPerPage) * PAGEGAP;
	const nrows = NPAGES * rowsPerPage;
	const H = rowY(nrows - 1) + CH + 8;
	const cell = (a: number) => {
		const b = a / BLOCK;
		const r = Math.floor(b / perRow);
		return { x: LW + (b % perRow) * cw, y: rowY(r), r };
	};
	const pageEnd = (a: number) => {
		const p = pageOf(a);
		const r = (p + 1) * rowsPerPage - 1;
		return { x: LW + perRow * cw, y: rowY(r) };
	};

	const arc = (from: number, to: number, blocked: boolean) => {
		const a = cell(from);
		const x1 = a.x + cw / 2;
		const y1 = a.y - 2;
		let x2: number;
		let y2: number;
		if (blocked) {
			const e = pageEnd(from);
			x2 = e.x + 14;
			y2 = e.y + CH / 2;
		} else {
			const b = cell(to);
			x2 = b.x + cw / 2;
			y2 = b.y - 2;
		}
		const lift = Math.min(ROWGAP - 6, 12 + Math.abs(x2 - x1) * 0.18);
		const cx = (x1 + x2) / 2;
		const cy = Math.min(y1, y2) - lift;
		return { d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`, end: [x2, y2] as const };
	};

	const cellState = (a: number) => {
		if (a === cur) return f.results[step - 1] === 'hit' ? s.cHitNow : s.cMissNow;
		if (f.unused.has(a)) return s.cPf;
		if (f.useful.has(a)) return s.cUseful;
		if (f.demand.has(a)) return s.cDemand;
		return '';
	};

	const switchKind = (k: Kind) => {
		setKind(k);
		stepper.reset();
	};
	const switchStream = (i: number) => {
		setSi(i);
		stepper.reset();
	};

	let msg = 'Press Step to send the first address.';
	if (cur !== null) {
		const r = f.results[step - 1];
		const issued = f.pfs.filter((p) => !p.blocked);
		const blocked = f.pfs.some((p) => p.blocked);
		const pf = issued.length ? ` Prefetch ${issued.map((p) => hex(p.to)).join(', ')}.` : '';
		const learn = kind === 'stride' && !f.confirmed && f.stride !== null && step >= 2 ? ` Stride ${hex(f.stride)} seen once.` : '';
		msg = `${hex(cur)}: ${r}.${pf}${learn}${blocked ? ' Next page: not prefetched.' : ''}`;
	}

	return (
		<div ref={rootRef} className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`access ${step} / ${n}`}>
				<div className={s.groups}>
					<div className={s.group} role="group" aria-label="Prefetcher">
						{KINDS.filter((k) => kinds.includes(k.id)).map((k) => (
							<button key={k.id} className={`viz-btn ${k.id === kind ? 'viz-primary' : ''}`} aria-pressed={k.id === kind} onClick={() => switchKind(k.id)}>
								{k.label}
							</button>
						))}
					</div>
					<div className={s.group} role="group" aria-label="Address stream">
						{STREAMS.map((st, i) => (
							<button key={st.label} className={`viz-btn ${i === si ? 'viz-primary' : ''}`} aria-pressed={i === si} onClick={() => switchStream(i)}>
								{st.label}
							</button>
						))}
					</div>
				</div>
			</StepControls>
			<p className={s.message}>{msg}</p>

			{/* the address stream */}
			<div className={s.stream} aria-label="Address stream">
				{stream.addrs.map((a, i) => (
					<span key={i} className={`${s.chip} ${i === step - 1 ? s.chipCur : ''} ${i < step ? (f.results[i] === 'hit' ? s.chipHit : s.chipMiss) : ''}`}>
						{hex(a)}
					</span>
				))}
			</div>

			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Memory blocks, two 4 KB pages">
				<defs>
					<marker id="sp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.head} />
					</marker>
				</defs>
				{Array.from({ length: NPAGES }, (_, p) => {
					const y0 = rowY(p * rowsPerPage);
					const y1 = rowY((p + 1) * rowsPerPage - 1) + CH;
					return (
						<g key={p}>
							<rect className={s.page} x={LW - 4} y={y0 - 4} width={perRow * cw + 8} height={y1 - y0 + 8} rx={6} />
							<text className={s.pageLabel} x={narrow ? LW : 4} y={narrow ? y0 - 10 : y0 + CH / 2 + 4}>
								page {p}
							</text>
						</g>
					);
				})}
				{Array.from({ length: NPAGES * PER_PAGE }, (_, b) => {
					const a = b * BLOCK;
					const c = cell(a);
					return (
						<g key={b} className={`${s.cell} ${cellState(a)}`}>
							<rect x={c.x + 1.5} y={c.y} width={cw - 3} height={CH} rx={4} />
							<text x={c.x + cw / 2} y={c.y + CH / 2 + 4} textAnchor="middle">
								{a.toString(16).toUpperCase()}
							</text>
						</g>
					);
				})}
				{f.pfs.map((p, i) => {
					const g = arc(cur!, p.to, p.blocked);
					return (
						<g key={`${step}-${i}`} className={`${s.pf} ${p.blocked ? s.pfBlocked : ''}`}>
							<path d={g.d} markerEnd={p.blocked ? undefined : 'url(#sp-arrow)'} />
							{p.blocked && <X x={g.end[0] - 8} y={g.end[1] - 8} width={16} height={16} strokeWidth={3} className={s.x} />}
						</g>
					);
				})}
			</svg>

			<div className={s.stats}>
				<span className={s.stat}>
					<span className={`${s.dot} ${s.dHit}`} />
					hits <b>{hits}</b>
				</span>
				<span className={s.stat}>
					<span className={`${s.dot} ${s.dMiss}`} />
					misses <b>{misses}</b>
				</span>
				{kind !== 'none' && (
					<>
						<span className={s.stat}>
							prefetches <b>{f.issued}</b>
						</span>
						<span className={s.stat}>
							<span className={`${s.dot} ${s.dPf}`} />
							{step === n ? 'never used' : 'not used yet'} <b>{f.unused.size}</b>
						</span>
					</>
				)}
				{kind === 'stride' && (
					<span className={s.stat}>
						stride <b>{f.stride === null ? '?' : hex(f.stride)}</b>
						{f.stride !== null && <span className={f.confirmed ? s.ok : s.wait}>{f.confirmed ? 'locked on' : 'seen once'}</span>}
					</span>
				)}
			</div>
			<div className={s.legend}>
				<span className={s.lg}>
					<span className={`${s.sw} ${s.swMiss}`} />
					miss
				</span>
				<span className={s.lg}>
					<span className={`${s.sw} ${s.swHit}`} />
					hit on a prefetched block
				</span>
				<span className={s.lg}>
					<span className={`${s.sw} ${s.swPf}`} />
					prefetched, not used yet
				</span>
				<span className={s.lg}>
					<span className={s.arrowSw} />
					prefetch request
				</span>
				<span className={s.lg}>one cell = one cache block</span>
			</div>
		</div>
	);
}
