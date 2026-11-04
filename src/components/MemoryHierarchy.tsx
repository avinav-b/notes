// The memory hierarchy as a pyramid with a log-scale latency bar per level (view "pyramid"),
// or the cache layout of one chip (view "chip"). Hover or tap a level / cache for its numbers.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import s from './MemoryHierarchy.module.css';

interface Level {
	id: string;
	name: string;
	tech: string;
	size?: string;
	/** Latency range in cycles. */
	lat?: [number, number];
	latText?: string;
	org?: string;
	holds: string;
}

const LEVELS: Level[] = [
	{ id: 'reg', name: 'Registers', tech: 'Inside the CPU core', holds: 'Words retrieved from L1' },
	{
		id: 'l1',
		name: 'L1 cache',
		tech: 'SRAM, on chip, one per core',
		size: '32 KB',
		lat: [4, 4],
		latText: '4 cycles',
		org: 'Separate 32 KB data and 32 KB instruction caches, each 8-way, 64 B blocks',
		holds: 'Cache lines retrieved from L2',
	},
	{
		id: 'l2',
		name: 'L2 cache',
		tech: 'SRAM, on chip, one per core',
		size: '256 KB',
		lat: [10, 10],
		latText: '10 cycles',
		org: 'Unified (instructions and data), 8-way, 64 B blocks',
		holds: 'Cache lines retrieved from L3',
	},
	{
		id: 'l3',
		name: 'L3 cache',
		tech: 'SRAM, on chip, shared by all cores',
		size: '8 MB',
		lat: [40, 75],
		latText: '40-75 cycles',
		org: '16-way',
		holds: 'Cache lines retrieved from main memory',
	},
	{
		id: 'mem',
		name: 'Main memory',
		tech: 'DRAM',
		size: '16 GB',
		lat: [60, 100],
		latText: '60-100 cycles',
		holds: 'Disk blocks retrieved from local disks',
	},
	{
		id: 'disk',
		name: 'Local disk',
		tech: 'Local secondary storage',
		size: '> 500 GB',
		lat: [1e7, 1e8],
		latText: '10s of millions of cycles',
		holds: 'Files retrieved from disks on remote servers',
	},
	{ id: 'remote', name: 'Remote storage', tech: 'Tapes, distributed file systems, web servers', holds: 'Everything else' },
];

// ---- pyramid layout ----
const TOP = 34;
const RH = 42;
const DECADES = 8;
const tickLabel = (d: number) => ['1', '10', '100', '1K', '10K', '100K', '1M', '10M', '100M'][d];

function humanScale(l: Level) {
	if (!l.lat) return null;
	const [lo, hi] = l.lat.map((c) => c / 4); // seconds, if a 4-cycle L1 hit took 1 s
	const fmt = (x: number) => {
		if (x < 10) return `${Number(x.toFixed(1))} s`;
		if (x < 120) return `${Math.round(x)} s`;
		const days = x / 86400;
		if (days < 60) return `${Math.round(days)} days`;
		return `${Math.round(days / 30)} months`;
	};
	return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`;
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

function Pyramid({ narrow }: { narrow: boolean }) {
	const [sel, setSel] = useState('mem');
	// Narrow (phones): a smaller viewBox so text stays readable when scaled down.
	const W = narrow ? 400 : 680;
	const PX = 0;
	const PW = narrow ? 146 : 270; // pyramid base width
	const PTOP = narrow ? 76 : 70; // pyramid top width
	const SX = narrow ? 154 : 296; // size column
	const LX = narrow ? 222 : 372; // latency axis start
	const LW = narrow ? 164 : 292; // latency axis width
	const lx = (cycles: number) => LX + (Math.log10(Math.max(cycles, 1)) / DECADES) * LW;
	const n = LEVELS.length;
	const H = TOP + n * RH + 34;
	const widthAt = (y: number) => PTOP + ((y - TOP) / (n * RH)) * (PW - PTOP);
	const cur = LEVELS.find((l) => l.id === sel)!;
	const hs = humanScale(cur);

	return (
		<>
			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Memory hierarchy: size and latency per level">
				<text className={s.section} x={narrow ? PX + 2 : PX + PW / 2} y={16} textAnchor={narrow ? 'start' : 'middle'}>
					{narrow ? 'smaller, faster' : 'smaller, faster, costlier per byte'}
				</text>
				<text className={s.section} x={SX} y={16}>
					size
				</text>
				<text className={s.section} x={LX} y={16}>
					{narrow ? 'latency (cycles, log)' : 'latency (cycles, log scale)'}
				</text>
				{/* decade grid */}
				{Array.from({ length: DECADES + 1 }, (_, d) => (
					<g key={d}>
						<line className={s.grid} x1={LX + (d / DECADES) * LW} x2={LX + (d / DECADES) * LW} y1={TOP - 4} y2={TOP + n * RH - 2} />
						{(!narrow || d % 2 === 0) && (
							<text className={s.tick} x={LX + (d / DECADES) * LW} y={TOP + n * RH + 14} textAnchor="middle">
								{tickLabel(d)}
							</text>
						)}
					</g>
				))}
				{LEVELS.map((l, i) => {
					const y0 = TOP + i * RH;
					const y1 = y0 + RH - 4;
					const w0 = widthAt(y0);
					const w1 = widthAt(y1);
					const cx = PX + PW / 2;
					const on = l.id === sel;
					return (
						<g
							key={l.id}
							className={`${s.level} ${on ? s.levelOn : ''}`}
							onMouseEnter={() => setSel(l.id)}
							onClick={() => setSel(l.id)}
							role="button"
							tabIndex={0}
							aria-label={l.name}
							onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSel(l.id)}
						>
							<rect className={s.rowHit} x={0} y={y0 - 2} width={W} height={RH} />
							<path className={s.band} d={`M${cx - w0 / 2},${y0} H${cx + w0 / 2} L${cx + w1 / 2},${y1} H${cx - w1 / 2} Z`} />
							<text className={s.bandText} x={cx} y={y0 + RH / 2 + 2} textAnchor="middle">
								{l.name}
							</text>
							<text className={s.size} x={SX} y={y0 + RH / 2 + 2}>
								{l.size ?? ''}
							</text>
							{l.lat ? (
								<>
									<rect className={s.latBar} x={LX} y={y0 + 8} width={lx(l.lat[0]) - LX} height={RH - 20} rx={3} />
									{l.lat[1] > l.lat[0] && (
										<rect className={s.latRange} x={lx(l.lat[0])} y={y0 + 8} width={lx(l.lat[1]) - lx(l.lat[0])} height={RH - 20} rx={3} />
									)}
									{l.id !== 'disk' && (
										<text className={s.latText} x={lx(l.lat[1]) + 6} y={y0 + RH / 2 + 2}>
											{narrow ? l.latText!.replace(' cycles', '') : l.latText}
										</text>
									)}
									{l.id === 'disk' && (
										<text className={s.latTextIn} x={lx(l.lat[0]) - 6} y={y0 + RH / 2 + 2} textAnchor="end">
											10s of millions
										</text>
									)}
								</>
							) : null}
						</g>
					);
				})}
				<text className={s.section} x={narrow ? PX + 2 : PX + PW / 2} y={H - 4} textAnchor={narrow ? 'start' : 'middle'}>
					{narrow ? 'larger, slower, cheaper' : 'larger, slower, cheaper per byte'}
				</text>
			</svg>
			<div className={s.detail} aria-live="polite">
				<div className={s.detailHead}>
					<b>{cur.name}</b>
					<span>{cur.tech}</span>
				</div>
				<dl className={s.facts}>
					{cur.size && (
						<>
							<dt>size</dt>
							<dd>{cur.size}</dd>
						</>
					)}
					{cur.latText && (
						<>
							<dt>latency</dt>
							<dd>{cur.latText}</dd>
						</>
					)}
					{cur.org && (
						<>
							<dt>organization</dt>
							<dd>{cur.org}</dd>
						</>
					)}
					<dt>holds</dt>
					<dd>{cur.holds}</dd>
					{hs && (
						<>
							<dt>if an L1 hit took 1 s</dt>
							<dd>{hs}</dd>
						</>
					)}
				</dl>
			</div>
		</>
	);
}

// ---- chip view (UG machine: Intel Core i7-4790) ----
interface CacheInfo {
	id: string;
	name: string;
	size: string;
	bytes: number;
	ways: number;
	sets: number;
	shared: string;
	type: string;
}
const LINE = 64;
const CACHES: Record<string, CacheInfo> = {
	l1d: { id: 'l1d', name: 'L1 data', size: '32 KB', bytes: 32 * 1024, ways: 8, sets: 64, shared: 'one core', type: 'data' },
	l1i: { id: 'l1i', name: 'L1 instruction', size: '32 KB', bytes: 32 * 1024, ways: 8, sets: 64, shared: 'one core', type: 'instructions' },
	l2: { id: 'l2', name: 'L2', size: '256 KB', bytes: 256 * 1024, ways: 8, sets: 512, shared: 'one core', type: 'unified (instructions and data)' },
	l3: { id: 'l3', name: 'L3', size: '8 MB', bytes: 8 * 1024 * 1024, ways: 16, sets: 8192, shared: 'all 4 cores', type: 'unified' },
};

function Chip({ narrow }: { narrow: boolean }) {
	const [sel, setSel] = useState('l1d');
	const cur = CACHES[sel];
	const W = narrow ? 400 : 680;
	const CW = narrow ? 88 : 118; // core column width

	const CX0 = narrow ? 16 : 22;
	const chipW = CX0 - 14 + 4 * (CW + 4) + 10;
	const H = narrow ? 370 : 270;
	const chipH = narrow ? 254 : H - 16;
	// main memory: right of the chip (wide) or under it (narrow)
	const dram = narrow ? { x: 8, y: 280, w: chipW, h: 80 } : { x: 544, y: 150, w: 128, h: 96 };
	const pick = (id: string) => ({
		onMouseEnter: () => setSel(id),
		onClick: () => setSel(id),
		role: 'button',
		tabIndex: 0,
		onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && setSel(id),
	});
	const box = (id: string, x: number, y: number, w: number, h: number, label: string, sub: string) => (
		<g key={`${id}${x}`} className={`${s.cache} ${sel === id ? s.cacheOn : ''}`} aria-label={`${label} ${sub}`} {...pick(id)}>
			<rect x={x} y={y} width={w} height={h} rx={5} />
			<text className={s.cacheName} x={x + w / 2} y={y + h / 2 - 1} textAnchor="middle">
				{label}
			</text>
			<text className={s.cacheSize} x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle">
				{sub}
			</text>
		</g>
	);
	return (
		<>
			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cache layout of an Intel Core i7-4790">
				<rect className={s.chip} x={8} y={8} width={chipW} height={chipH} rx={10} />
				<text className={s.section} x={22} y={28}>
					processor chip · i7-4790, 4 cores
				</text>
				{[0, 1, 2, 3].map((c) => {
					const x = CX0 + c * (CW + 4);
					return (
						<g key={c}>
							<g className={s.core}>
								<rect x={x + 24} y={40} width={CW - 52} height={30} rx={15} />
								<text x={x + CW / 2 - 2} y={60} textAnchor="middle">
									core {c}
								</text>
							</g>
							{box('l1d', x, 82, CW / 2 - 4, 46, 'L1 d', '32 KB')}
							{box('l1i', x + CW / 2, 82, CW / 2 - 4, 46, 'L1 i', '32 KB')}
							{box('l2', x, 138, CW - 4, 46, 'L2', '256 KB')}
						</g>
					);
				})}
				{box('l3', CX0, 196, 4 * (CW + 4) - 8, 50, 'L3 (shared)', '8 MB')}
				<path className={s.wire} d={narrow ? `M${8 + chipW / 2},${8 + chipH} V${dram.y}` : `M${8 + chipW},221 H${dram.x}`} />
				<g className={s.dram}>
					<rect x={dram.x} y={dram.y} width={dram.w} height={dram.h} rx={8} />
					<text className={s.cacheName} x={dram.x + dram.w / 2} y={dram.y + dram.h / 2 - 2} textAnchor="middle">
						main memory
					</text>
					<text className={s.cacheSize} x={dram.x + dram.w / 2} y={dram.y + dram.h / 2 + 16} textAnchor="middle">
						16 GB DRAM
					</text>
				</g>
			</svg>
			<div className={`${s.detail} ${s.detailChip}`} aria-live="polite">
				<div className={s.detailHead}>
					<b>{cur.name} cache</b>
					<span>
						{cur.type}, {cur.shared === 'one core' ? 'private to each core' : `shared by ${cur.shared}`}
					</span>
				</div>
				<div className={s.seb}>
					<span className={s.sebPart}>
						<b>{cur.sets}</b> sets
					</span>
					<span className={s.op}>×</span>
					<span className={s.sebPart}>
						<b>{cur.ways}</b> ways
					</span>
					<span className={s.op}>×</span>
					<span className={s.sebPart}>
						<b>{LINE} B</b> lines
					</span>
					<span className={s.op}>=</span>
					<span className={`${s.sebPart} ${s.sebTotal}`}>
						<b>{cur.size}</b>
					</span>
				</div>
			</div>
		</>
	);
}

// ---- prefetch view (slide: Core i7 hardware prefetching) ----
interface PBox {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	lines: string[];
}
interface PLayout {
	W: number;
	H: number;
	boxes: PBox[];
	links: [number, number, number, number][];
	arcs: { id: string; d: string; label: string[]; lx: number; ly: number; anchor: 'start' | 'middle' | 'end' }[];
}
const PREFETCH_WIDE: PLayout = {
	W: 680,
	H: 236,
	boxes: [
		{ id: 'cpu', x: 8, y: 116, w: 84, h: 40, lines: ['CPU + regs'] },
		{ id: 'l1i', x: 126, y: 60, w: 84, h: 44, lines: ['L1 inst', '32 KB'] },
		{ id: 'l1d', x: 126, y: 112, w: 84, h: 44, lines: ['L1 data', '32 KB'] },
		{ id: 'l2', x: 244, y: 60, w: 84, h: 96, lines: ['L2', '256 KB', '10 cycles'] },
		{ id: 'l3', x: 362, y: 60, w: 84, h: 96, lines: ['L3 shared', '8 MB', '40-75 cycles'] },
		{ id: 'mem', x: 480, y: 60, w: 90, h: 96, lines: ['Memory', '16 GB', '60-100 cycles'] },
		{ id: 'disk', x: 604, y: 60, w: 68, h: 96, lines: ['Disk', '> 500 GB', '~10M cyc'] },
	],
	links: [
		[92, 136, 126, 136],
		[210, 82, 244, 82],
		[210, 134, 244, 134],
		[328, 108, 362, 108],
		[446, 108, 480, 108],
		[570, 108, 604, 108],
	],
	arcs: [
		{ id: 'i', d: 'M280,58 Q246,14 178,58', label: ['L2 to L1 instruction prefetching'], lx: 228, ly: 20, anchor: 'middle' },
		{ id: 'd', d: 'M280,158 Q246,204 178,158', label: ['L2 to L1 data prefetching'], lx: 228, ly: 222, anchor: 'middle' },
		{ id: 'm', d: 'M516,158 Q472,204 410,158', label: ['memory to L3 data prefetching'], lx: 464, ly: 222, anchor: 'middle' },
	],
};
const PREFETCH_NARROW: PLayout = {
	W: 400,
	H: 400,
	boxes: [
		{ id: 'cpu', x: 120, y: 8, w: 160, h: 34, lines: ['CPU + registers'] },
		{ id: 'l1i', x: 120, y: 70, w: 76, h: 44, lines: ['L1 inst', '32 KB'] },
		{ id: 'l1d', x: 204, y: 70, w: 76, h: 44, lines: ['L1 data', '32 KB'] },
		{ id: 'l2', x: 120, y: 142, w: 160, h: 44, lines: ['L2 · 256 KB', '10 cycles'] },
		{ id: 'l3', x: 120, y: 214, w: 160, h: 44, lines: ['L3 · 8 MB', '40-75 cycles'] },
		{ id: 'mem', x: 120, y: 286, w: 160, h: 44, lines: ['Memory · 16 GB', '60-100 cycles'] },
		{ id: 'disk', x: 120, y: 350, w: 160, h: 44, lines: ['Disk · > 500 GB', '10s of millions'] },
	],
	links: [
		[242, 42, 242, 70],
		[158, 114, 158, 142],
		[242, 114, 242, 142],
		[200, 186, 200, 214],
		[200, 258, 200, 286],
		[200, 330, 200, 350],
	],
	arcs: [
		{ id: 'i', d: 'M120,168 Q72,140 124,98', label: ['L2 to L1', 'instruction'], lx: 8, ly: 122, anchor: 'start' },
		{ id: 'd', d: 'M280,168 Q328,140 276,98', label: ['L2 to L1', 'data'], lx: 392, ly: 122, anchor: 'end' },
		{ id: 'm', d: 'M120,308 Q72,272 120,238', label: ['memory', 'to L3'], lx: 8, ly: 266, anchor: 'start' },
	],
};

function Prefetch({ narrow }: { narrow: boolean }) {
	const L = narrow ? PREFETCH_NARROW : PREFETCH_WIDE;
	return (
		<svg className={s.svg} viewBox={`0 0 ${L.W} ${L.H}`} role="img" aria-label="Core i7 hardware prefetchers: L2 to L1 instruction and data, memory to L3">
			<defs>
				<marker id="mh-pf" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s.pfHead} />
				</marker>
			</defs>
			{L.links.map(([x1, y1, x2, y2], i) => (
				<line key={i} className={s.link} x1={x1} y1={y1} x2={x2} y2={y2} />
			))}
			{L.boxes.map((b) => (
				<g key={b.id} className={b.id === 'mem' || b.id === 'disk' ? s.dram : s.pfBox}>
					<rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} />
					{b.lines.map((ln, i) => (
						<text
							key={i}
							className={i === 0 ? s.cacheName : s.cacheSize}
							x={b.x + b.w / 2}
							y={b.y + b.h / 2 + 4 + (i - (b.lines.length - 1) / 2) * 16}
							textAnchor="middle"
						>
							{ln}
						</text>
					))}
				</g>
			))}
			{L.arcs.map((a) => (
				<g key={a.id}>
					<path className={s.pfArc} d={a.d} markerEnd="url(#mh-pf)" />
					{a.label.map((ln, i) => (
						<text key={i} className={s.pfLabel} x={a.lx} y={a.ly + i * 14} textAnchor={a.anchor}>
							{ln}
						</text>
					))}
				</g>
			))}
		</svg>
	);
}

export default function MemoryHierarchy({ view = 'pyramid' }: { view?: 'pyramid' | 'chip' | 'prefetch' }) {
	const [ref, narrow] = useNarrow();
	return (
		<div ref={ref} className={`not-content ${s.root}`}>
			{view === 'chip' ? <Chip narrow={narrow} /> : view === 'prefetch' ? <Prefetch narrow={narrow} /> : <Pyramid narrow={narrow} />}
			{view === 'prefetch' ? (
				<p className={s.hint}>Moving dashes: data the hardware prefetches into the faster level before it is asked for.</p>
			) : (
				<p className={s.hint}>
					Hover or tap a {view === 'chip' ? 'cache' : 'level'} for its numbers.{view === 'chip' ? '' : ' The faded end of a bar is a latency range (e.g. 40-75 cycles).'}
				</p>
			)}
		</div>
	);
}
