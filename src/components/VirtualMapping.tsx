// Two processes' virtual address spaces mapped through their own page tables onto one physical
// memory (and disk). Each tab highlights one problem that the indirection solves: memory
// management, fit, portability, protection, sharing.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import s from './VirtualMapping.module.css';

type Proc = 1 | 2;
type PageName = 'stack' | 'lib' | 'heap' | 'data' | 'text';
/** Virtual layout, top (high addresses) to bottom (address 0); null = unused gap. */
const SLOTS: (PageName | null)[] = ['stack', null, 'lib', null, 'heap', 'data', 'text'];
const PAGES: PageName[] = ['stack', 'lib', 'heap', 'data', 'text'];

/** Where each page lives: a frame number, or 'disk'. */
type Where = number | 'disk';
interface Machine {
	frames: number;
	map: Record<Proc, Record<PageName, Where>>;
}
const MACHINES: Machine[] = [
	{
		frames: 7,
		map: {
			1: { stack: 0, lib: 3, heap: 'disk', data: 5, text: 2 },
			2: { stack: 4, lib: 3, heap: 1, data: 'disk', text: 6 },
		},
	},
	{
		frames: 4,
		map: {
			1: { stack: 0, lib: 3, heap: 'disk', data: 'disk', text: 2 },
			2: { stack: 'disk', lib: 3, heap: 1, data: 'disk', text: 'disk' },
		},
	},
];

type Tab = 'manage' | 'fit' | 'port' | 'protect' | 'share';
const TABS: { id: Tab; label: string; msg: string }[] = [
	{ id: 'manage', label: 'Memory management', msg: 'Every process gets the same layout; the OS picks any free frame.' },
	{ id: 'fit', label: 'Fit', msg: 'Only pages in use need a frame; the rest wait on disk.' },
	{ id: 'port', label: 'Portability', msg: 'Same program, less memory: only the mapping changes.' },
	{ id: 'protect', label: 'Protection', msg: "No entry in P1's page table points at P2's frames." },
	{ id: 'share', label: 'Sharing', msg: 'Both page tables map their lib page to the same frame.' },
];

/** Animate a list of numbers towards their targets. */
function useTween(target: number[], ms = 550) {
	const [cur, setCur] = useState(target);
	const from = useRef(target);
	const key = target.join(',');
	useEffect(() => {
		const start = from.current;
		if (start.length !== target.length) {
			from.current = target;
			setCur(target);
			return;
		}
		let raf = 0;
		const t0 = performance.now();
		const tick = (now: number) => {
			const k = Math.min(1, (now - t0) / ms);
			const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
			const v = target.map((x, i) => start[i] + (x - start[i]) * e);
			from.current = v;
			setCur(v);
			if (k < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [key]);
	return cur;
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

export default function VirtualMapping() {
	const [tab, setTab] = useState<Tab>('manage');
	const [mi, setMi] = useState(0);
	const [rootRef, narrow] = useNarrow();
	const machine = MACHINES[tab === 'port' ? mi : 0];

	const W = narrow ? 400 : 680;
	const colW = narrow ? 84 : 112;
	const X1 = narrow ? 8 : 16; // process 1
	const XM = narrow ? 158 : 284; // physical memory
	const X2 = W - (narrow ? 8 : 16) - colW; // process 2
	const TOP = 58;
	const RH = 30;
	const PH = 24;
	const memRows = 7;
	const diskY = TOP + memRows * RH + 26;
	const diskW = narrow ? 150 : 172;
	const diskX = XM + colW / 2 - diskW / 2;
	const H = diskY + 92;

	// Disk slots, filled in a stable order.
	const onDisk: { p: Proc; page: PageName }[] = [];
	for (const p of [1, 2] as Proc[]) for (const page of PAGES) if (machine.map[p][page] === 'disk') onDisk.push({ p, page });
	const diskSlot = (i: number) => ({ x: diskX + 8 + (i % 2) * ((diskW - 24) / 2 + 8), y: diskY + 24 + Math.floor(i / 2) * 22, w: (diskW - 24) / 2, h: 18 });

	const pageY = (page: PageName) => TOP + SLOTS.indexOf(page) * RH;
	const frameY = (f: number) => TOP + f * RH;

	// Line endpoints, tweened so lines swing to their new frame when the machine changes.
	const ends: number[] = [];
	for (const p of [1, 2] as Proc[])
		for (const page of PAGES) {
			const w = machine.map[p][page];
			if (w === 'disk') {
				const d = diskSlot(onDisk.findIndex((o) => o.p === p && o.page === page));
				ends.push(p === 1 ? d.x : d.x + d.w, d.y + d.h / 2);
			} else ends.push(p === 1 ? XM : XM + colW, frameY(w) + PH / 2);
		}
	const tw = useTween(ends);

	// Frame contents.
	const owners: { p: Proc; page: PageName }[][] = Array.from({ length: memRows }, () => []);
	for (const p of [1, 2] as Proc[])
		for (const page of PAGES) {
			const w = machine.map[p][page];
			if (w !== 'disk') owners[w].push({ p, page });
		}

	const lineCls = (p: Proc, page: PageName) => {
		const w = machine.map[p][page];
		if (tab === 'share') return page === 'lib' ? s.lineOn : s.lineDim;
		if (tab === 'fit') return w === 'disk' ? s.lineOn : s.lineDim;
		if (tab === 'protect') return p === 1 ? '' : s.lineDim;
		return '';
	};
	const frameDim = (f: number) => {
		const o = owners[f];
		if (tab === 'share') return !o.some((x) => x.page === 'lib');
		if (tab === 'fit') return false;
		return false;
	};

	const curve = (x1: number, y1: number, x2: number, y2: number) => {
		const mx = (x1 + x2) / 2;
		return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
	};

	const column = (p: Proc, x: number) => (
		<g className={`${s.proc} ${s[`p${p}`]} ${tab === 'port' ? s.procHl : ''}`}>
			<text className={s.head} x={x + colW / 2} y={18} textAnchor="middle">
				Process {p}
			</text>
			<text className={s.sub} x={x + colW / 2} y={34} textAnchor="middle">
				{tab === 'fit' ? (
					<>
						2<tspan className={s.sup} dy={-4}>64</tspan>
						<tspan dy={4}> B = 16 EB</tspan>
					</>
				) : (
					'virtual memory'
				)}
			</text>
			<rect className={s.space} x={x} y={TOP - 4} width={colW} height={SLOTS.length * RH + 2} rx={5} />
			{SLOTS.map((page, i) =>
				page ? (
					<g key={i} className={`${s.vpage} ${tab === 'protect' && p === 2 ? s.dim : ''}`}>
						<rect x={x + 4} y={TOP + i * RH} width={colW - 8} height={PH} rx={4} />
						<text x={x + colW / 2} y={TOP + i * RH + PH / 2 + 4} textAnchor="middle">
							{page}
						</text>
					</g>
				) : (
					<text key={i} className={s.gap} x={x + colW / 2} y={TOP + i * RH + PH / 2 + 4} textAnchor="middle">
						unused
					</text>
				),
			)}
		</g>
	);

	let k = 0;
	const lines = ([1, 2] as Proc[]).flatMap((p) =>
		PAGES.map((page) => {
			const ex = tw[k++];
			const ey = tw[k++];
			const x1 = p === 1 ? X1 + colW - 4 : X2 + 4;
			const y1 = pageY(page) + PH / 2;
			return <path key={`${p}${page}`} className={`${s.line} ${s[`l${p}`]} ${lineCls(p, page)}`} d={curve(x1, y1, ex, ey)} />;
		}),
	);

	// Protection: P1 tries to reach P2's heap frame; its page table has no entry for it.
	const target = frameY(1) + PH / 2;
	const tryY = TOP + 3 * RH + PH / 2;
	const stopX = X1 + colW + (XM - X1 - colW) * 0.62;

	return (
		<div ref={rootRef} className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.controls}`} role="group" aria-label="Problem">
				{TABS.map((t) => (
					<button key={t.id} className={t.id === tab ? 'viz-primary' : undefined} aria-pressed={t.id === tab} onClick={() => setTab(t.id)}>
						{t.label}
					</button>
				))}
			</div>
			<p className={s.message}>{TABS.find((t) => t.id === tab)!.msg}</p>
			{tab === 'port' && (
				<div className={`viz-controls ${s.controls} ${s.sub2}`} role="group" aria-label="Machine">
					{MACHINES.map((m, i) => (
						<button key={i} className={i === mi ? 'viz-primary' : undefined} aria-pressed={i === mi} onClick={() => setMi(i)}>
							Machine {i + 1}: {m.frames} frames
						</button>
					))}
				</div>
			)}

			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Two processes' virtual pages mapped onto physical memory">
				{/* page table bands */}
				{([1, 2] as Proc[]).map((p) => {
					const x = p === 1 ? X1 + colW : XM + colW;
					const w = p === 1 ? XM - X1 - colW : X2 - XM - colW;
					return (
						<g key={p} className={s.band}>
							<rect x={x + 6} y={TOP - 4} width={w - 12} height={SLOTS.length * RH + 2} rx={5} />
							<text x={x + w / 2} y={TOP - 12} textAnchor="middle">
								{narrow ? `table ${p}` : `P${p} page table`}
							</text>
						</g>
					);
				})}

				{lines}

				{column(1, X1)}
				{column(2, X2)}

				{/* physical memory */}
				<text className={s.head} x={XM + colW / 2} y={18} textAnchor="middle">
					Physical
				</text>
				<text className={s.sub} x={XM + colW / 2} y={34} textAnchor="middle">
					{tab === 'fit' ? 'e.g. 1 TB' : 'memory'}
				</text>
				<rect className={s.space} x={XM} y={TOP - 4} width={colW} height={memRows * RH + 2} rx={5} />
				{owners.map((o, f) => {
					const exists = f < machine.frames;
					const y = frameY(f);
					const shared = o.length > 1;
					return (
						<g key={f} className={s.frame} style={{ opacity: !exists ? 0 : frameDim(f) ? 0.3 : 1 }}>
							<rect className={o.length ? s[`f${o[0].p}`] : s.free} x={XM + 4} y={y} width={colW - 8} height={PH} rx={4} />
							{shared && (
								<path className={s.f2} d={`M${XM + colW / 2},${y} H${XM + colW - 8} a4,4 0 0 1 4,4 V${y + PH - 4} a4,4 0 0 1 -4,4 H${XM + colW / 2} Z`} />
							)}
							<text x={XM + colW / 2} y={y + PH / 2 + 4} textAnchor="middle">
								{o.length === 0 ? 'free' : shared ? `shared ${o[0].page}` : `P${o[0].p} ${o[0].page}`}
							</text>
						</g>
					);
				})}
				{machine.frames < memRows && (
					<text className={s.gap} x={XM + colW / 2} y={frameY(machine.frames) + 30} textAnchor="middle">
						(no more memory)
					</text>
				)}

				{/* disk */}
				<g className={`${s.disk} ${tab === 'fit' ? s.diskHl : ''}`}>
					<rect x={diskX} y={diskY} width={diskW} height={H - diskY - 4} rx={6} />
					<text className={s.diskLabel} x={diskX + 10} y={diskY + 15}>
						disk
					</text>
					{onDisk.map((o, i) => {
						const d = diskSlot(i);
						return (
							<g key={`${o.p}${o.page}`} className={s.frame}>
								<rect className={s[`f${o.p}`]} x={d.x} y={d.y} width={d.w} height={d.h} rx={3} />
								<text x={d.x + d.w / 2} y={d.y + d.h / 2 + 4} textAnchor="middle">
									P{o.p} {o.page}
								</text>
							</g>
						);
					})}
				</g>

				{/* protection: a blocked attempt */}
				<g className={s.attempt} style={{ opacity: tab === 'protect' ? 1 : 0 }}>
					<path d={curve(X1 + colW - 4, tryY, XM, target)} className={s.attemptGhost} />
					<path d={`M${X1 + colW - 4},${tryY} L${stopX - 10},${tryY - ((tryY - target) * 0.55)}`} className={s.attemptLine} />
					<X x={stopX - 18} y={tryY - (tryY - target) * 0.55 - 9} width={18} height={18} className={s.attemptX} strokeWidth={3} />
					<text className={s.attemptText} x={stopX - 9} y={tryY - (tryY - target) * 0.55 + 22} textAnchor="middle">
						no PTE
					</text>
				</g>
			</svg>

			<div className={s.legend}>
				<span className={s.lg}>
					<span className={`${s.sw} ${s.sw1}`} />
					Process 1
				</span>
				<span className={s.lg}>
					<span className={`${s.sw} ${s.sw2}`} />
					Process 2
				</span>
				<span className={s.lg}>
					<span className={`${s.sw} ${s.swShared}`} />
					shared frame
				</span>
				<span className={s.lg}>
					<span className={s.lineSw} />
					page table entry
				</span>
			</div>
		</div>
	);
}
