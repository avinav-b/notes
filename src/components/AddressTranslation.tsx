// Address translation, step by step: a token (the VA, then the PTE, the PA, the data word) travels
// between the CPU, the MMU (and its TLB), cache/memory (which holds the page table) and disk.
// Modes: physical addressing, page table lookup, TLB hit, TLB miss, page fault. A meter counts the
// memory accesses (and disk transfers) the load costs, so the price of each case is visible.
import { useEffect, useRef, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './AddressTranslation.module.css';

type Pt = [number, number];
interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
type PathId = 'va' | 'tlbq' | 'tlbr' | 'pteq' | 'pter' | 'tlbfill' | 'pa' | 'pa0' | 'data' | 'fault' | 'victim' | 'newpage' | 'restart';
interface PathGeo {
	pts: Pt[];
	/** Badge position; the label goes to its right (or left with `left`). */
	lab: Pt;
	left?: boolean;
}
interface Rows {
	x: number;
	y: number;
	w: number;
	rowH: number;
	head: Pt;
}
interface Layout {
	W: number;
	H: number;
	chip: Box;
	cpu: Box;
	mmu: Box;
	tlb: Box;
	os: Box;
	mem: Box;
	disk: Box;
	pt: Rows;
	frames: Rows;
	/** Position of the i-th page on disk. */
	diskItem: (i: number) => Box;
	paths: Record<PathId, PathGeo>;
}

const WIDE: Layout = {
	W: 680,
	H: 312,
	chip: { x: 8, y: 8, w: 318, h: 222 },
	tlb: { x: 176, y: 20, w: 132, h: 72 },
	mmu: { x: 176, y: 124, w: 132, h: 76 },
	cpu: { x: 24, y: 140, w: 88, h: 44 },
	os: { x: 176, y: 256, w: 150, h: 48 },
	mem: { x: 376, y: 8, w: 152, h: 296 },
	disk: { x: 596, y: 8, w: 76, h: 296 },
	pt: { x: 386, y: 52, w: 132, rowH: 20, head: [386, 44] },
	frames: { x: 386, y: 188, w: 132, rowH: 34, head: [386, 180] },
	diskItem: (i) => ({ x: 604, y: 40 + i * 32, w: 60, h: 26 }),
	paths: {
		va: { pts: [[112, 162], [176, 162]], lab: [132, 150] },
		tlbq: { pts: [[220, 124], [220, 92]], lab: [206, 108], left: true },
		tlbr: { pts: [[264, 92], [264, 124]], lab: [278, 108] },
		pteq: { pts: [[308, 136], [376, 136]], lab: [320, 126] },
		pter: { pts: [[376, 158], [308, 158]], lab: [320, 172] },
		tlbfill: { pts: [[360, 158], [360, 50], [308, 50]], lab: [334, 40] },
		pa: { pts: [[308, 190], [344, 190], [344, 238], [376, 238]], lab: [320, 206] },
		pa0: { pts: [[112, 162], [344, 162], [344, 238], [376, 238]], lab: [140, 150] },
		data: { pts: [[376, 254], [44, 254], [44, 184]], lab: [140, 244] },
		fault: { pts: [[242, 200], [242, 256]], lab: [256, 240] },
		victim: { pts: [[528, 266], [596, 266]], lab: [552, 254] },
		newpage: { pts: [[596, 284], [528, 284]], lab: [552, 298] },
		restart: { pts: [[176, 280], [84, 280], [84, 184]], lab: [100, 270] },
	},
};

const NARROW: Layout = {
	W: 400,
	H: 466,
	chip: { x: 8, y: 8, w: 282, h: 184 },
	tlb: { x: 150, y: 22, w: 128, h: 72 },
	mmu: { x: 150, y: 116, w: 128, h: 60 },
	cpu: { x: 18, y: 122, w: 76, h: 44 },
	os: { x: 300, y: 116, w: 92, h: 60 },
	mem: { x: 8, y: 212, w: 384, h: 164 },
	disk: { x: 8, y: 406, w: 384, h: 52 },
	pt: { x: 16, y: 258, w: 180, rowH: 20, head: [16, 250] },
	frames: { x: 206, y: 258, w: 178, rowH: 33, head: [206, 250] },
	diskItem: (i) => ({ x: 70 + i * 70, y: 418, w: 60, h: 28 }),
	paths: {
		va: { pts: [[94, 144], [150, 144]], lab: [108, 132] },
		tlbq: { pts: [[190, 116], [190, 94]], lab: [176, 105], left: true },
		tlbr: { pts: [[238, 94], [238, 116]], lab: [252, 105] },
		pteq: { pts: [[160, 176], [160, 212]], lab: [146, 194], left: true },
		pter: { pts: [[184, 212], [184, 176]], lab: [198, 194] },
		tlbfill: { pts: [[184, 200], [130, 200], [130, 58], [150, 58]], lab: [118, 80], left: true },
		pa: { pts: [[250, 176], [250, 212]], lab: [264, 194] },
		pa0: { pts: [[94, 144], [250, 144], [250, 212]], lab: [264, 194] },
		data: { pts: [[50, 212], [50, 166]], lab: [50, 190], left: true },
		fault: { pts: [[278, 146], [300, 146]], lab: [289, 186] },
		victim: { pts: [[260, 376], [260, 406]], lab: [246, 391], left: true },
		newpage: { pts: [[300, 406], [300, 376]], lab: [314, 391] },
		restart: { pts: [[346, 116], [346, 104], [56, 104], [56, 122]], lab: [110, 104] },
	},
};

const PATH_LABEL: Record<PathId, string> = {
	va: 'VA',
	tlbq: 'VP',
	tlbr: 'PTE',
	pteq: 'PTE req',
	pter: 'PTE',
	tlbfill: 'fill',
	pa: 'PA',
	pa0: 'PA',
	data: 'data',
	fault: 'page fault',
	victim: 'victim',
	newpage: 'new page',
	restart: 'restart',
};

// ---- the world: 5 virtual pages, 3 physical pages (PP 5-7), the rest on disk ----
type Mark = 'cur' | 'bad' | 'new' | 'hit';
interface World {
	/** VP -> PP, or null when the page is on disk. */
	pt: (number | null)[];
	/** PP -> VP held there (frames 5, 6, 7). */
	frames: Record<number, { vp: number | null; dirty?: boolean }>;
	tlb: ({ vp: number; pp: number } | null)[];
	disk: number[];
	mem: number;
	io: number;
	ptMark?: { vp: number; m: Mark };
	frameMark?: { pp: number; m: Mark };
	tlbMark?: { slot: number | 'all'; m: Mark };
	diskMark?: { vp: number; m: Mark };
	os?: boolean;
}

const base = (): World => ({
	pt: [7, null, 6, 5, null],
	frames: { 5: { vp: 3 }, 6: { vp: 2 }, 7: { vp: 0, dirty: true } },
	tlb: [],
	disk: [1, 4],
	mem: 0,
	io: 0,
});

type Tone = 'addr' | 'pte' | 'bad' | 'data' | 'page';
interface StepDef {
	path: PathId;
	token: string;
	tone: Tone;
	msg: string;
	/** Extra paths lit with this step (e.g. the TLB fill branch). */
	also?: PathId[];
	/** Applied once the token arrives. */
	fx?: (w: World) => void;
}
interface ModeDef {
	id: string;
	label: string;
	intro: string;
	mmu: boolean;
	tlb: boolean;
	fault: boolean;
	start?: (w: World) => void;
	steps: StepDef[];
}

const tlbWith = (entries: { vp: number; pp: number }[]) => (w: World) => {
	w.tlb = [entries[0] ?? null, entries[1] ?? null, entries[2] ?? null];
};

const VA = 'VA 0x2A10';
const PA = 'PA 0x6A10';

const MODES: ModeDef[] = [
	{
		id: 'physical',
		label: 'Physical addressing',
		intro: 'No MMU: the program uses physical addresses directly.',
		mmu: false,
		tlb: false,
		fault: false,
		steps: [
			{ path: 'pa0', token: PA, tone: 'addr', msg: 'The CPU sends the physical address straight to memory.', fx: (w) => ((w.mem += 1), (w.frameMark = { pp: 6, m: 'cur' })) },
			{ path: 'data', token: 'data', tone: 'data', msg: 'The data word comes back: one memory access.', fx: (w) => (w.frameMark = { pp: 6, m: 'hit' }) },
		],
	},
	{
		id: 'pt',
		label: 'Page table',
		intro: 'The program only knows virtual address 0x2A10 (VP 2).',
		mmu: true,
		tlb: false,
		fault: false,
		steps: [
			{ path: 'va', token: VA, tone: 'addr', msg: 'The CPU sends the VA to the MMU.' },
			{ path: 'pteq', token: 'VP 2?', tone: 'addr', msg: 'The MMU asks the page table in memory for VP 2.', fx: (w) => ((w.mem += 1), (w.ptMark = { vp: 2, m: 'cur' })) },
			{ path: 'pter', token: 'PP 6', tone: 'pte', msg: 'The PTE says VP 2 is in physical page 6.', fx: (w) => (w.ptMark = { vp: 2, m: 'hit' }) },
			{ path: 'pa', token: PA, tone: 'addr', msg: 'The MMU sends the PA to cache/memory.', fx: (w) => ((w.mem += 1), (w.frameMark = { pp: 6, m: 'cur' })) },
			{ path: 'data', token: 'data', tone: 'data', msg: 'Data returns: two memory accesses for one load.', fx: (w) => (w.frameMark = { pp: 6, m: 'hit' }) },
		],
	},
	{
		id: 'tlbhit',
		label: 'TLB hit',
		intro: 'The TLB caches a few recent PTEs inside the MMU.',
		mmu: true,
		tlb: true,
		fault: false,
		start: tlbWith([
			{ vp: 0, pp: 7 },
			{ vp: 2, pp: 6 },
			{ vp: 3, pp: 5 },
		]),
		steps: [
			{ path: 'va', token: VA, tone: 'addr', msg: 'The CPU sends the VA to the MMU.' },
			{ path: 'tlbq', token: 'VP 2?', tone: 'addr', msg: 'The MMU looks up VP 2 in the TLB.', fx: (w) => (w.tlbMark = { slot: 1, m: 'hit' }) },
			{ path: 'tlbr', token: 'PP 6', tone: 'pte', msg: 'TLB hit: the PTE comes back without touching memory.' },
			{ path: 'pa', token: PA, tone: 'addr', msg: 'The MMU sends the PA to cache/memory.', fx: (w) => ((w.mem += 1), (w.frameMark = { pp: 6, m: 'cur' })) },
			{ path: 'data', token: 'data', tone: 'data', msg: 'Data returns: only one memory access.', fx: (w) => (w.frameMark = { pp: 6, m: 'hit' }) },
		],
	},
	{
		id: 'tlbmiss',
		label: 'TLB miss',
		intro: 'This time the TLB has no entry for VP 2.',
		mmu: true,
		tlb: true,
		fault: false,
		start: tlbWith([
			{ vp: 0, pp: 7 },
			{ vp: 3, pp: 5 },
		]),
		steps: [
			{ path: 'va', token: VA, tone: 'addr', msg: 'The CPU sends the VA to the MMU.' },
			{ path: 'tlbq', token: 'VP 2?', tone: 'addr', msg: 'The MMU looks up VP 2 in the TLB.', fx: (w) => (w.tlbMark = { slot: 'all', m: 'bad' }) },
			{ path: 'tlbr', token: 'miss', tone: 'bad', msg: 'TLB miss: no valid entry for VP 2.' },
			{ path: 'pteq', token: 'VP 2?', tone: 'addr', msg: 'The MMU reads the PTE from the page table.', fx: (w) => ((w.mem += 1), (w.tlbMark = undefined), (w.ptMark = { vp: 2, m: 'cur' })) },
			{
				path: 'pter',
				token: 'PP 6',
				tone: 'pte',
				also: ['tlbfill'],
				msg: 'The PTE goes to the MMU and is cached in the TLB.',
				fx: (w) => ((w.tlb[2] = { vp: 2, pp: 6 }), (w.tlbMark = { slot: 2, m: 'new' }), (w.ptMark = { vp: 2, m: 'hit' })),
			},
			{ path: 'pa', token: PA, tone: 'addr', msg: 'The MMU sends the PA to cache/memory.', fx: (w) => ((w.mem += 1), (w.frameMark = { pp: 6, m: 'cur' })) },
			{ path: 'data', token: 'data', tone: 'data', msg: 'Data returns: two memory accesses, as if there were no TLB.', fx: (w) => (w.frameMark = { pp: 6, m: 'hit' }) },
		],
	},
	{
		id: 'fault',
		label: 'Page fault',
		intro: 'VA 0x1C04 is in VP 1, which is only on disk.',
		mmu: true,
		tlb: false,
		fault: true,
		steps: [
			{ path: 'va', token: 'VA 0x1C04', tone: 'addr', msg: 'The CPU sends the VA to the MMU.' },
			{ path: 'pteq', token: 'VP 1?', tone: 'addr', msg: 'The MMU asks the page table for VP 1.', fx: (w) => ((w.mem += 1), (w.ptMark = { vp: 1, m: 'bad' })) },
			{ path: 'pter', token: 'invalid', tone: 'bad', msg: 'The PTE is invalid: VP 1 is not in memory.' },
			{ path: 'fault', token: 'page fault', tone: 'bad', msg: 'The MMU raises a page fault; the OS handler runs.', fx: (w) => ((w.os = true), (w.ptMark = undefined)) },
			{
				path: 'victim',
				token: 'VP 0',
				tone: 'page',
				msg: 'Victim: PP 7 is dirty, so VP 0 is written to disk.',
				fx: (w) => {
					w.frames[7] = { vp: null };
					w.pt[0] = null;
					w.disk = [1, 4, 0];
					w.io += 1;
					w.diskMark = { vp: 0, m: 'new' };
					w.ptMark = { vp: 0, m: 'cur' };
				},
			},
			{
				path: 'newpage',
				token: 'VP 1',
				tone: 'page',
				msg: 'VP 1 is read into PP 7 and its PTE is updated.',
				fx: (w) => {
					w.frames[7] = { vp: 1 };
					w.pt[1] = 7;
					w.io += 1;
					w.diskMark = { vp: 1, m: 'cur' };
					w.ptMark = { vp: 1, m: 'new' };
					w.frameMark = { pp: 7, m: 'new' };
				},
			},
			{
				path: 'restart',
				token: 'restart',
				tone: 'addr',
				msg: 'The handler returns and the load restarts: now VP 1 is mapped.',
				fx: (w) => ((w.os = false), (w.diskMark = undefined), (w.frameMark = undefined)),
			},
		],
	},
];

function worldAt(mode: ModeDef, upto: number): World {
	const w = base();
	mode.start?.(w);
	for (let i = 0; i < upto; i++) mode.steps[i].fx?.(w);
	return w;
}

// ---- geometry helpers ----
const segLen = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function pointAt(pts: Pt[], t: number): Pt {
	const lens = pts.slice(1).map((p, i) => segLen(pts[i], p));
	let d = t * lens.reduce((a, b) => a + b, 0);
	for (let i = 0; i < lens.length; i++) {
		if (d <= lens[i] || i === lens.length - 1) {
			const f = lens[i] ? Math.min(1, d / lens[i]) : 1;
			return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
		}
		d -= lens[i];
	}
	return pts[pts.length - 1];
}
const toD = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

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
	/** Which modes to offer, by id (default: all). */
	modes?: string[];
}

export default function AddressTranslation({ modes: only }: Props) {
	const modes = only ? MODES.filter((m) => only.includes(m.id)) : MODES;
	const [mi, setMi] = useState(0);
	const mode = modes[mi];
	const stepper = useStepper(mode.steps.length, { intervalMs: 1500 });
	const step = stepper.step;
	const [rootRef, narrow] = useNarrow();
	const L = narrow ? NARROW : WIDE;

	// Token animation: `t` runs 0 -> 1 along the current step's path; effects apply on arrival.
	const [t, setT] = useState(1);
	const prev = useRef({ step, mi });
	useEffect(() => {
		const p = prev.current;
		prev.current = { step, mi };
		const forward = p.mi === mi && step === p.step + 1;
		const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!forward || reduce || step === 0) {
			setT(1);
			return;
		}
		let raf = 0;
		const t0 = performance.now();
		const dur = 650 / Math.max(0.5, Math.min(2, stepper.speed));
		const tick = (now: number) => {
			const k = Math.min(1, (now - t0) / dur);
			setT(k);
			if (k < 1) raf = requestAnimationFrame(tick);
		};
		setT(0);
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [step, mi]);

	const arrived = t >= 1;
	const w = worldAt(mode, arrived ? step : step - 1);
	const cur = step > 0 ? mode.steps[step - 1] : null;
	const used = new Set<PathId>(mode.steps.flatMap((d) => [d.path, ...(d.also ?? [])]));
	const badge = new Map<PathId, number>();
	mode.steps.forEach((d, i) => badge.set(d.path, i + 1));

	const tokenPos: Pt = cur ? pointAt(L.paths[cur.path].pts, ease(t)) : [L.cpu.x + L.cpu.w / 2, L.cpu.y - 14];
	const tokenText = cur ? cur.token : mode.id === 'fault' ? 'VA 0x1C04' : mode.id === 'physical' ? PA : VA;
	const tokenTone: Tone = cur ? cur.tone : 'addr';
	const tokenW = tokenText.length * 7.2 + 14;

	const switchMode = (i: number) => {
		setMi(i);
		stepper.reset();
	};

	const box = (b: Box, label: string, cls: string, on = true, sub?: string) => (
		<g className={`${s.box} ${cls}`} style={{ opacity: on ? 1 : 0 }}>
			<rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} />
			<text className={s.boxLabel} x={b.x + b.w / 2} y={b.y + b.h / 2 + (sub ? -2 : 5)} textAnchor="middle">
				{label}
			</text>
			{sub && (
				<text className={s.boxSub} x={b.x + b.w / 2} y={b.y + b.h / 2 + 14} textAnchor="middle">
					{sub}
				</text>
			)}
		</g>
	);
	const markCls = (m?: Mark) => (m ? s[`mark_${m}`] : '');

	const pips = (n: number, max: number, cls: string) => (
		<span className={s.pips}>
			{Array.from({ length: max }, (_, i) => (
				<span key={i} className={`${s.pip} ${i < n ? cls : ''}`} />
			))}
		</span>
	);
	const maxMem = Math.max(...modes.map((m) => worldAt(m, m.steps.length).mem));

	return (
		<div ref={rootRef} className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`step ${step} / ${mode.steps.length}`}>
				{modes.length > 1 && (
					<div className={s.modes} role="group" aria-label="Case">
						{modes.map((m, i) => (
							<button key={m.id} className={`viz-btn ${i === mi ? 'viz-primary' : ''}`} aria-pressed={i === mi} onClick={() => switchMode(i)}>
								{m.label}
							</button>
						))}
					</div>
				)}
			</StepControls>
			<p className={s.message}>
				{cur ? (
					<>
						<span className={s.stepNo}>{step}</span>
						{cur.msg}
					</>
				) : (
					mode.intro
				)}
			</p>

			<svg className={s.svg} viewBox={`0 0 ${L.W} ${L.H}`} role="img" aria-label={`Address translation: ${mode.label}`}>
				<defs>
					<marker id="at-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.headIdle} />
					</marker>
					<marker id="at-arrow-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.headOn} />
					</marker>
					<marker id="at-arrow-done" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.headDone} />
					</marker>
				</defs>

				{/* CPU chip */}
				<rect className={s.chip} x={L.chip.x} y={L.chip.y} width={L.chip.w} height={L.chip.h} rx={10} />
				<text className={s.section} x={L.chip.x + 10} y={L.chip.y + 18}>
					CPU chip
				</text>

				{box(L.cpu, 'CPU', s.cpu)}
				{box(L.mmu, 'MMU', s.mmu, mode.mmu)}
				{box(L.os, narrow ? 'OS fault' : 'OS page fault', `${s.os} ${w.os ? s.osOn : ''}`, mode.fault, 'handler')}

				{/* TLB */}
				<g className={s.box} style={{ opacity: mode.tlb ? 1 : 0 }}>
					<rect x={L.tlb.x} y={L.tlb.y} width={L.tlb.w} height={L.tlb.h} rx={6} />
					<text className={s.boxLabel} x={L.tlb.x + 8} y={L.tlb.y + 16}>
						TLB
					</text>
					<text className={s.colHead} x={L.tlb.x + L.tlb.w - 8} y={L.tlb.y + 16} textAnchor="end">
						VP → PP
					</text>
					{[0, 1, 2].map((i) => {
						const e = w.tlb[i];
						const y = L.tlb.y + 22 + i * 16;
						const m = w.tlbMark && (w.tlbMark.slot === 'all' || w.tlbMark.slot === i) ? w.tlbMark.m : undefined;
						return (
							<g key={i} className={`${s.row} ${markCls(e || m !== 'bad' ? m : undefined)}`}>
								<rect x={L.tlb.x + 6} y={y} width={L.tlb.w - 12} height={14} rx={3} />
								<text className={s.rowText} x={L.tlb.x + L.tlb.w / 2} y={y + 11} textAnchor="middle">
									{e ? `VP ${e.vp} → PP ${e.pp}` : 'empty'}
								</text>
							</g>
						);
					})}
				</g>

				{/* Memory: page table and physical pages */}
				<g className={s.memBox}>
					<rect x={L.mem.x} y={L.mem.y} width={L.mem.w} height={L.mem.h} rx={6} />
					<text className={s.section} x={L.mem.x + 10} y={L.mem.y + 18}>
						cache / memory
					</text>
				</g>
				<g style={{ opacity: mode.mmu ? 1 : 0 }} className={s.fade}>
					<text className={s.colHead} x={L.pt.head[0]} y={L.pt.head[1]}>
						page table
					</text>
					{w.pt.map((pp, vp) => {
						const y = L.pt.y + vp * L.pt.rowH;
						const m = w.ptMark?.vp === vp ? w.ptMark.m : undefined;
						return (
							<g key={vp} className={`${s.row} ${pp === null ? s.invalid : ''} ${markCls(m)}`}>
								<rect x={L.pt.x} y={y} width={L.pt.w} height={L.pt.rowH - 3} rx={3} />
								<text className={s.rowText} x={L.pt.x + 8} y={y + 12.5}>
									VP {vp}
								</text>
								<text className={s.rowText} x={L.pt.x + L.pt.w - 8} y={y + 12.5} textAnchor="end">
									{pp === null ? 'disk' : `PP ${pp}`}
								</text>
							</g>
						);
					})}
				</g>
				<text className={s.colHead} x={L.frames.head[0]} y={L.frames.head[1]}>
					physical pages
				</text>
				{[5, 6, 7].map((pp, i) => {
					const f = w.frames[pp];
					const y = L.frames.y + i * L.frames.rowH;
					const m = w.frameMark?.pp === pp ? w.frameMark.m : undefined;
					return (
						<g key={pp} className={`${s.frame} ${markCls(m)}`}>
							<rect x={L.frames.x} y={y} width={L.frames.w} height={L.frames.rowH - 4} rx={4} />
							<text className={s.frameNo} x={L.frames.x + 8} y={y + (L.frames.rowH - 4) / 2 + 4}>
								PP {pp}
							</text>
							<text className={s.rowText} x={L.frames.x + L.frames.w - 8} y={y + (L.frames.rowH - 4) / 2 + 4} textAnchor="end">
								{mode.id === 'physical' ? '' : f.vp === null ? 'free' : `VP ${f.vp}${f.dirty ? ' · dirty' : ''}`}
							</text>
						</g>
					);
				})}

				{/* Disk */}
				<g className={`${s.memBox} ${s.fade}`} style={{ opacity: mode.fault ? 1 : mode.mmu ? 0.3 : 0 }}>
					<rect x={L.disk.x} y={L.disk.y} width={L.disk.w} height={L.disk.h} rx={6} />
					<text className={s.section} x={L.disk.x + (narrow ? 10 : L.disk.w / 2)} y={L.disk.y + (narrow ? L.disk.h / 2 + 4 : 18)} textAnchor={narrow ? 'start' : 'middle'}>
						disk
					</text>
					{w.disk.map((vp, i) => {
						const b = L.diskItem(i);
						const m = w.diskMark?.vp === vp ? w.diskMark.m : undefined;
						return (
							<g key={vp} className={`${s.frame} ${markCls(m)}`}>
								<rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} />
								<text className={s.rowText} x={b.x + b.w / 2} y={b.y + b.h / 2 + 4} textAnchor="middle">
									VP {vp}
								</text>
							</g>
						);
					})}
				</g>

				{/* Arrows */}
				{(Object.keys(L.paths) as PathId[]).map((id) => {
					if (!used.has(id)) return null;
					const g = L.paths[id];
					const n = badge.get(id);
					const k = mode.steps.findIndex((d) => d.path === id || d.also?.includes(id)) + 1;
					const state = k === step ? 'on' : k < step ? 'done' : 'idle';
					return (
						<g key={`${mode.id}-${id}`} className={`${s.path} ${s[`p_${state}`]} ${id === 'fault' ? s.dashed : ''}`}>
							<path d={toD(g.pts)} markerEnd={`url(#at-arrow${state === 'on' ? '-on' : state === 'done' ? '-done' : ''})`} />
							{n !== undefined && (
								<g className={s.badge}>
									<circle cx={g.lab[0]} cy={g.lab[1]} r={8} />
									<text x={g.lab[0]} y={g.lab[1] + 4} textAnchor="middle">
										{n}
									</text>
								</g>
							)}
							<text className={s.pathLabel} x={g.lab[0] + (g.left ? -12 : 12)} y={g.lab[1] + 4} textAnchor={g.left ? 'end' : 'start'}>
								{PATH_LABEL[id]}
							</text>
						</g>
					);
				})}

				{/* The travelling token */}
				<g className={`${s.token} ${s[`tone_${tokenTone}`]}`} transform={`translate(${tokenPos[0]}, ${tokenPos[1]})`}>
					<rect x={-tokenW / 2} y={-10} width={tokenW} height={20} rx={10} />
					<text y={4} textAnchor="middle">
						{tokenText}
					</text>
				</g>
			</svg>

			<div className={s.meters}>
				<span className={s.meter}>
					<span className={s.meterLabel}>memory accesses</span>
					{pips(w.mem, maxMem, s.pipMem)}
					<b>{w.mem}</b>
				</span>
				{mode.fault && (
					<span className={s.meter}>
						<span className={s.meterLabel}>disk transfers</span>
						{pips(w.io, 2, s.pipDisk)}
						<b>{w.io}</b>
						<span className={s.meterNote}>each ~100,000x a DRAM access</span>
					</span>
				)}
			</div>
			<div className={s.legend}>
				<span className={s.lg}>
					<span className={`${s.sw} ${s.swCur}`} />
					being looked up
				</span>
				<span className={s.lg}>
					<span className={`${s.sw} ${s.swOk}`} />
					found / filled
				</span>
				{modes.some((m) => m.id === 'tlbmiss' || m.fault) && (
					<span className={s.lg}>
						<span className={`${s.sw} ${s.swBad}`} />
						miss / invalid
					</span>
				)}
				{modes.some((m) => m.mmu) && (
					<span className={s.lg}>
						<span className={`${s.sw} ${s.swDisk}`} />
						page only on disk
					</span>
				)}
			</div>
		</div>
	);
}
