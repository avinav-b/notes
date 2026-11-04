// phkmalloc, step by step. Three figures share one visual language (green = in use, dashed = free,
// purple = what malloc is touching right now):
//   classic: an older malloc that keeps its free list inside the free blocks (slide 4)
//   pages:   phkmalloc's page allocator: page directory + free list of page runs (slides 6 to 9)
//   subpage: phkmalloc's chunk allocator: pginfo bitmaps + one list per chunk size (slides 10 to 15)
import { useId } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './PhkMalloc.module.css';

type Variant = 'classic' | 'pages' | 'subpage';

interface Props {
	variant?: Variant;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const W = 680;

interface Base {
	/** The call being served, e.g. "malloc(3 KB)". */
	tag?: string;
	msg: string;
}

// ---------------------------------------------------------------- classic: free list in free blocks

interface CBlock {
	id: string;
	a: number; // start, KB
	b: number; // end, KB
	free: boolean;
}
interface CFrame extends Base {
	blocks: CBlock[];
	touched: number[]; // pages malloc has read so far
	pagedOut: number[];
	cur?: string; // free block being looked at
	fresh?: string; // block just handed out
	span?: number[]; // pages the new block lands on
}

const PAGE_KB = 4;
const KB = 20; // px per KB
const C_X0 = 20;
const C_PAGES = 8;

const C_BLOCKS: CBlock[] = [
	{ id: 'a', a: 0, b: 2, free: false },
	{ id: 'f1', a: 2, b: 4, free: true },
	{ id: 'b', a: 4, b: 8, free: false },
	{ id: 'f2', a: 8, b: 10, free: true },
	{ id: 'c', a: 10, b: 12, free: false },
	{ id: 'd', a: 12, b: 16, free: false },
	{ id: 'e', a: 16, b: 18, free: false },
	{ id: 'f3', a: 18, b: 20, free: true },
	{ id: 'g', a: 20, b: 22, free: false },
	{ id: 'f4', a: 22, b: 26, free: true },
	{ id: 'h', a: 26, b: 28, free: false },
	{ id: 'i', a: 28, b: 32, free: false },
];
const C_SPLIT: CBlock[] = C_BLOCKS.flatMap((b) =>
	b.id === 'f4'
		? [
				{ id: 'n', a: 22, b: 25, free: false },
				{ id: 'f4', a: 25, b: 26, free: true },
			]
		: [b],
);
const C_REQ = 'malloc(3 KB)';
const CLASSIC: CFrame[] = [
	{ msg: 'Each free block stores the pointer to the next free block.', blocks: C_BLOCKS, touched: [], pagedOut: [2, 4] },
	{ tag: C_REQ, msg: 'Walk the free list. 2 KB: too small.', blocks: C_BLOCKS, touched: [0], pagedOut: [2, 4], cur: 'f1' },
	{ tag: C_REQ, msg: 'Next block is on a paged-out page: page it back in.', blocks: C_BLOCKS, touched: [0, 2], pagedOut: [4], cur: 'f2' },
	{ tag: C_REQ, msg: 'Another page-in. Still too small.', blocks: C_BLOCKS, touched: [0, 2, 4], pagedOut: [], cur: 'f3' },
	{ tag: C_REQ, msg: '4 KB: fits.', blocks: C_BLOCKS, touched: [0, 2, 4, 5], pagedOut: [], cur: 'f4' },
	{
		tag: C_REQ,
		msg: 'The 3 KB block straddles a page boundary: 2 pages, 2 TLB entries.',
		blocks: C_SPLIT,
		touched: [0, 2, 4, 5],
		pagedOut: [],
		fresh: 'n',
		span: [5, 6],
	},
];

function Classic({ f, mk }: { f: CFrame; mk: string }) {
	const SY = 92;
	const SH = 56;
	const kx = (kb: number) => C_X0 + kb * KB;
	const pageW = PAGE_KB * KB;
	const free = f.blocks.filter((b) => b.free);
	const hx = (b: CBlock) => kx(b.a) + 10; // where a block's "next" pointer sits
	const curIdx = free.findIndex((b) => b.id === f.cur);
	return (
		<svg className={s.svg} viewBox={`0 0 ${W} 214`} role="img" aria-label="Free list stored inside free blocks">
			<defs>
				<marker id={`${mk}-a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s.head} />
				</marker>
				<marker id={`${mk}-c`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s.headCur} />
				</marker>
				<pattern id={`${mk}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
					<line x1="0" y1="0" x2="0" y2="7" className={s.hatchLine} />
				</pattern>
			</defs>

			<text className={s.section} x={C_X0} y={22}>
				free list <tspan className={s.sectionSub}>· pointers stored in the free blocks</tspan>
			</text>

			{/* Pages: background, touched tint, paged-out hatch */}
			{Array.from({ length: C_PAGES }, (_, p) => (
				<g key={p}>
					<rect className={s.pageBg} x={kx(p * PAGE_KB)} y={SY} width={pageW} height={SH} />
					<rect className={cx(s.touchBar, f.touched.includes(p) && s.touchBarOn)} x={kx(p * PAGE_KB) + 4} y={SY + SH + 3} width={pageW - 8} height={4} rx={2} />
				</g>
			))}

			{/* Blocks */}
			{f.blocks.map((b) => (
				<g key={b.id + b.a} className={cx(b.free ? s.cFree : s.cUsed, b.id === f.cur && s.cCur, b.id === f.fresh && s.cFresh)}>
					<rect x={kx(b.a) + 1.5} y={SY + 8} width={(b.b - b.a) * KB - 3} height={SH - 16} rx={3} />
					{b.free && <circle className={s.nextDot} cx={hx(b)} cy={SY + 16} r={3.5} />}
				</g>
			))}

			{f.pagedOut.map((p) => (
				<rect key={`out${p}`} className={s.pagedOut} x={kx(p * PAGE_KB)} y={SY} width={pageW} height={SH} fill={`url(#${mk}-hatch)`} />
			))}

			{/* Page boundaries and labels */}
			{Array.from({ length: C_PAGES + 1 }, (_, p) => (
				<line key={`b${p}`} className={s.pageEdge} x1={kx(p * PAGE_KB)} x2={kx(p * PAGE_KB)} y1={SY - 6} y2={SY + SH + 6} />
			))}
			{f.span && (
				<rect className={s.spanBox} x={kx(f.span[0] * PAGE_KB) + 2} y={SY - 4} width={f.span.length * pageW - 4} height={SH + 8} rx={5} />
			)}
			{Array.from({ length: C_PAGES }, (_, p) => {
				const out = f.pagedOut.includes(p);
				const touched = f.touched.includes(p);
				return (
					<g key={`l${p}`}>
						<text className={s.pageNum} x={kx(p * PAGE_KB) + pageW / 2} y={SY + SH + 24} textAnchor="middle">
							page {p}
						</text>
						<text
							className={cx(s.pageState, touched && s.pageStateTouched)}
							x={kx(p * PAGE_KB) + pageW / 2}
							y={SY + SH + 40}
							textAnchor="middle"
						>
							{out ? 'paged out' : touched ? 'touched' : ''}
						</text>
					</g>
				);
			})}

			{/* List arrows between free blocks */}
			<text className={s.rowLabel} x={C_X0} y={56}>
				head
			</text>
			{free.map((b, i) => {
				const x1 = hx(b);
				const x0 = i === 0 ? C_X0 + 30 : hx(free[i - 1]);
				const y0 = i === 0 ? 52 : SY + 12;
				const lift = i === 0 ? 0 : Math.min(48, 16 + (x1 - x0) * 0.18);
				const d = i === 0 ? `M${x0},${y0} Q${x1},${y0} ${x1},${SY + 10}` : `M${x0},${y0} C${x0},${SY - lift} ${x1},${SY - lift} ${x1},${SY + 10}`;
				const hot = curIdx >= 0 && i <= curIdx;
				return <path key={`e${b.id}`} className={cx(s.link, hot && s.linkCur)} d={d} markerEnd={`url(#${mk}-${hot ? 'c' : 'a'})`} />;
			})}
		</svg>
	);
}

// ---------------------------------------------------------------- pages: phkmalloc page allocator

type DirE = 'free' | 'S' | 'F';
interface Run {
	id: string;
	start: number;
	len: number;
}
interface PFrame extends Base {
	heap: number; // pages in the heap
	dir: DirE[];
	runs: Run[]; // free list, address order
	tooSmall?: string[]; // runs checked and skipped
	at?: string; // run being looked at / just updated
	hlDir?: number[];
	hlPages?: number[];
	newPages?: number[]; // pages just handed out
	grown?: boolean;
}

const P_SLOTS = 10;
const P_X0 = 96;
const P_PITCH = 58;
const P_W = 52;
const px = (i: number) => P_X0 + i * P_PITCH;

const D0: DirE[] = ['free', 'S', 'F', 'F', 'free', 'free', 'S', 'free'];
const D1: DirE[] = ['free', 'S', 'F', 'F', 'S', 'F', 'S', 'free'];
const D2: DirE[] = [...D1, 'S', 'F'];
const D3: DirE[] = ['free', 'free', 'free', 'free', 'S', 'F', 'S', 'free', 'S', 'F'];
const R0 = { id: 'r0', start: 0, len: 1 };
const R1 = { id: 'r1', start: 4, len: 2 };
const R2 = { id: 'r2', start: 7, len: 1 };
const A2 = 'allocate(2 pages)';
const FREE1 = 'free(page 1)';
const PAGES: PFrame[] = [
	{ msg: 'Directory: one entry per page. Free list: one node per free run.', heap: 8, dir: D0, runs: [R0, R1, R2] },
	{ tag: A2, msg: 'First fit. 1 page: too small.', heap: 8, dir: D0, runs: [R0, R1, R2], at: 'r0' },
	{ tag: A2, msg: '2 pages: fits.', heap: 8, dir: D0, runs: [R0, R1, R2], tooSmall: ['r0'], at: 'r1' },
	{ tag: A2, msg: 'Write S F into the directory and unlink the run.', heap: 8, dir: D1, runs: [R0, R2], hlDir: [4, 5], newPages: [4, 5] },
	{ tag: A2, msg: 'No free run has 2 pages.', heap: 8, dir: D1, runs: [R0, R2], tooSmall: ['r0', 'r2'] },
	{ tag: A2, msg: 'Grow the heap; reallocate a bigger directory.', heap: 10, dir: D2, runs: [R0, R2], hlDir: [8, 9], newPages: [8, 9], grown: true },
	{ tag: FREE1, msg: 'Directory lookup: S F F, so a 3-page run.', heap: 10, dir: D2, runs: [R0, R2], hlDir: [1, 2, 3], hlPages: [1, 2, 3], grown: true },
	{
		tag: FREE1,
		msg: 'Clear the entries; insert in address order, coalescing with page 0.',
		heap: 10,
		dir: D3,
		runs: [{ ...R0, len: 4 }, R2],
		hlDir: [1, 2, 3],
		at: 'r0',
		grown: true,
	},
];

/** Allocated page runs, read off the directory's S/F entries. */
function allocRuns(dir: DirE[]) {
	const runs: { start: number; len: number }[] = [];
	dir.forEach((e, i) => {
		if (e === 'S') runs.push({ start: i, len: 1 });
		else if (e === 'F') runs[runs.length - 1].len++;
	});
	return runs;
}

function Pages({ f, mk }: { f: PFrame; mk: string }) {
	const DY = 30;
	const DH = 26;
	const LY = 92;
	const LH = 26;
	const HY = 166;
	const HH = 64;
	const hl = (i: number) => f.hlDir?.includes(i);
	const runW = (len: number) => len * P_PITCH - (P_PITCH - P_W);
	const heapEndX = px(f.heap) - (P_PITCH - P_W) / 2;
	return (
		<svg className={s.svg} viewBox={`0 0 ${W} 284`} role="img" aria-label="phkmalloc page directory, free list, and heap pages">
			<defs>
				<marker id={`${mk}-a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s.head} />
				</marker>
				<marker id={`${mk}-c`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s.headCur} />
				</marker>
			</defs>

			{/* Metadata area */}
			<rect className={s.metaBox} x={8} y={6} width={W - 16} height={LY + LH + 12} rx={8} />
			<text className={s.section} x={20} y={22}>
				malloc metadata <tspan className={s.sectionSub}>· kept apart from the heap</tspan>
			</text>
			<text className={s.rowLabel} x={20} y={DY + 17}>
				directory
			</text>
			<g className={cx(s.dirArray, f.grown && s.dirGrown)}>
				<rect className={s.dirOutline} x={px(0) - 4} y={DY - 3} width={px(f.heap) - px(0) + 2} height={DH + 6} rx={5} />
			</g>
			{f.grown && (
				<text className={s.grownTag} x={px(f.heap) - 6} y={DY - 7} textAnchor="end">
					reallocated
				</text>
			)}
			{Array.from({ length: P_SLOTS }, (_, i) => (
				<g key={i} className={cx(s.dirCell, i >= f.heap && s.hidden, f.dir[i] !== 'free' && s.dirUsed, hl(i) && s.dirHl)}>
					<rect x={px(i)} y={DY} width={P_W} height={DH} rx={3} />
					<text x={px(i) + P_W / 2} y={DY + 18} textAnchor="middle">
						{f.dir[i] === 'free' || f.dir[i] === undefined ? '' : f.dir[i]}
					</text>
				</g>
			))}

			<text className={s.rowLabel} x={20} y={LY + 17}>
				free list
			</text>
			{f.runs.map((r, i) => {
				const prev = f.runs[i - 1];
				const x0 = prev ? px(prev.start) + runW(prev.len) : 78;
				const x1 = px(r.start) - 2;
				const hot = f.at === r.id;
				return (
					<path
						key={`l${r.id}`}
						className={cx(s.link, s.linkMove)}
						style={{ d: `path('M${x0},${LY + LH / 2} L${x1},${LY + LH / 2}')` } as React.CSSProperties}
						markerEnd={`url(#${mk}-${hot ? 'c' : 'a'})`}
					/>
				);
			})}
			{f.runs.map((r) => (
				<g key={r.id} className={cx(s.runNode, f.at === r.id && s.runNodeCur, f.tooSmall?.includes(r.id) && s.runNodeSkip)}>
					<rect className={s.geo} x={px(r.start)} y={LY} width={runW(r.len)} height={LH} rx={4} />
					<text className={s.geo} x={px(r.start) + 7} y={LY + 17}>
						{r.len} {r.len === 1 ? 'page' : 'pages'}
					</text>
					<line className={s.runPtr} x1={px(r.start) + P_W / 2} x2={px(r.start) + P_W / 2} y1={LY + LH} y2={HY - 3} markerEnd={`url(#${mk}-a)`} />
				</g>
			))}

			{/* Heap */}
			<text className={s.section} x={20} y={HY - 12}>
				heap
			</text>
			{Array.from({ length: P_SLOTS }, (_, i) => (
				<rect key={`p${i}`} className={cx(s.freePage, i >= f.heap && s.hidden)} x={px(i)} y={HY} width={P_W} height={HH} rx={4} />
			))}
			{allocRuns(f.dir).map((r) => (
				<g key={`${r.start}-${r.len}`} className={cx(s.usedRun, f.newPages?.includes(r.start) && s.newRun)}>
					<rect x={px(r.start)} y={HY} width={runW(r.len)} height={HH} rx={4} />
					{Array.from({ length: r.len - 1 }, (_, k) => (
						<line key={k} x1={px(r.start + k + 1) - 3} x2={px(r.start + k + 1) - 3} y1={HY + 6} y2={HY + HH - 6} />
					))}
				</g>
			))}
			{f.hlPages?.map((i) => (
				<rect key={`h${i}`} className={s.pageHl} x={px(i) - 2} y={HY - 2} width={P_W + 4} height={HH + 4} rx={5} />
			))}
			{Array.from({ length: P_SLOTS }, (_, i) => (
				<text key={`n${i}`} className={cx(s.pageNum, i >= f.heap && s.hidden)} x={px(i) + P_W / 2} y={HY + HH + 16} textAnchor="middle">
					{i}
				</text>
			))}
			<text className={s.marker} x={px(0) - 3} y={HY + HH + 38}>
				heap start
			</text>
			<g className={s.heapEnd} style={{ transform: `translateX(${heapEndX}px)` }}>
				<line x1={0} x2={0} y1={HY - 6} y2={HY + HH + 26} />
				<text x={-3} y={HY + HH + 38} textAnchor="end">
					heap end
				</text>
			</g>
		</svg>
	);
}

// ---------------------------------------------------------------- subpage: chunks, pginfo, size lists

type PKind = { k: 'free' } | { k: 'run' } | { k: 'chunks'; size: 32 | 64; used: boolean[] };
interface SFrame extends Base {
	pages: PKind[];
	lists: Record<32 | 64, number[]>; // pginfo (by page) in list order
	hlChunk?: [number, number];
	hlInfo?: number;
	hlDir?: number;
	hlList?: 32 | 64;
}

const S_X0 = 104;
const S_PITCH = 96;
const S_W = 82;
const sx = (i: number) => S_X0 + i * S_PITCH;
const bits = (str: string) => [...str].map((c) => c === '1');

const FREE: PKind = { k: 'free' };
const RUN: PKind = { k: 'run' };
const c32 = (b: string): PKind => ({ k: 'chunks', size: 32, used: bits(b) });
const P64 = { k: 'chunks', size: 64, used: bits('1011') } as const;
const pg = (p1: string, p2: PKind): PKind[] => [RUN, c32(p1), p2, P64, RUN, FREE];
const A32 = 'allocate(32 B)';
const A20 = 'allocate(20 B)';
const FR = 'free(chunk)';
const SUBPAGE: SFrame[] = [
	{ msg: 'Each chunk page has a pginfo: chunk size plus a bitmap.', pages: pg('11011111', FREE), lists: { 32: [1], 64: [3] } },
	{ tag: A32, msg: 'First pginfo on the 32 B list: the bitmap finds chunk 2.', pages: pg('11111111', FREE), lists: { 32: [1], 64: [3] }, hlInfo: 1, hlChunk: [1, 2] },
	{ tag: A32, msg: 'Page 1 is full: its pginfo leaves the list.', pages: pg('11111111', FREE), lists: { 32: [], 64: [3] }, hlInfo: 1, hlList: 32 },
	{ tag: A20, msg: 'Rounds up to 32 B. The 32 B list is empty.', pages: pg('11111111', FREE), lists: { 32: [], 64: [3] }, hlList: 32 },
	{
		tag: A20,
		msg: 'Get a new page from the page allocator, and a new pginfo.',
		pages: pg('11111111', c32('00000000')),
		lists: { 32: [2], 64: [3] },
		hlDir: 2,
		hlInfo: 2,
	},
	{ tag: A20, msg: 'The bitmap finds chunk 0.', pages: pg('11111111', c32('10000000')), lists: { 32: [2], 64: [3] }, hlInfo: 2, hlChunk: [2, 0] },
	{ tag: FR, msg: 'Directory entry, then pginfo: clear the chunk’s bit.', pages: pg('11111011', c32('10000000')), lists: { 32: [2], 64: [3] }, hlDir: 1, hlInfo: 1, hlChunk: [1, 5] },
	{ tag: FR, msg: 'First free chunk: pginfo rejoins the list, in address order.', pages: pg('11111011', c32('10000000')), lists: { 32: [1, 2], 64: [3] }, hlInfo: 1, hlList: 32 },
	{ tag: FR, msg: 'Free page 2’s only chunk: now every chunk is free.', pages: pg('11111011', c32('00000000')), lists: { 32: [1, 2], 64: [3] }, hlDir: 2, hlInfo: 2, hlChunk: [2, 0] },
	{ tag: FR, msg: 'Free the pginfo; page 2 goes back to the page allocator.', pages: pg('11111011', FREE), lists: { 32: [1], 64: [3] }, hlDir: 2, hlList: 32 },
];

function SubPage({ f, mk }: { f: SFrame; mk: string }) {
	const DY = 30;
	const DH = 24;
	const IY = 78;
	const IH = 44;
	const HY = 166;
	const CH = 16;
	const HH = 8 * CH;
	const LY = 332;
	const LROW = 34;
	const CHIP_W = 84;
	const CHIP_X0 = 120;
	return (
		<svg className={s.svg} viewBox={`0 0 ${W} ${LY + 2 * LROW + 4}`} role="img" aria-label="phkmalloc sub-page allocator: pginfo bitmaps and size lists">
			<defs>
				<marker id={`${mk}-a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s.head} />
				</marker>
				<marker id={`${mk}-c`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s.headCur} />
				</marker>
			</defs>

			<rect className={s.metaBox} x={8} y={6} width={W - 16} height={IY + IH + 8} rx={8} />
			<text className={s.section} x={20} y={22}>
				malloc metadata <tspan className={s.sectionSub}>· kept apart from the heap</tspan>
			</text>
			<text className={s.rowLabel} x={20} y={DY + 16}>
				directory
			</text>
			<text className={s.rowLabel} x={20} y={IY + 26}>
				pginfo
			</text>

			{f.pages.map((p, i) => {
				const isHl = f.hlDir === i;
				return (
					<g key={`d${i}`} className={cx(s.dirCell, p.k !== 'free' && s.dirUsed, isHl && s.dirHl)}>
						<rect x={sx(i)} y={DY} width={S_W} height={DH} rx={3} />
						{p.k === 'run' && (
							<text x={sx(i) + S_W / 2} y={DY + 17} textAnchor="middle">
								S
							</text>
						)}
						{p.k === 'chunks' && (
							<>
								<circle className={s.ptrDot} cx={sx(i) + S_W / 2} cy={DY + DH / 2} r={3.5} />
								<line
									className={cx(s.link, isHl && s.linkCur)}
									x1={sx(i) + S_W / 2}
									x2={sx(i) + S_W / 2}
									y1={DY + DH / 2}
									y2={IY - 2}
									markerEnd={`url(#${mk}-${isHl ? 'c' : 'a'})`}
								/>
							</>
						)}
					</g>
				);
			})}

			{/* pginfo structs */}
			{f.pages.map((p, i) => {
				if (p.k !== 'chunks') return null;
				const n = p.used.length;
				const bw = 8;
				const gap = 1.5;
				const bx = sx(i) + (S_W - (n * bw + (n - 1) * gap)) / 2;
				return (
					<g key={`i${i}-${p.size}`} className={cx(s.info, f.hlInfo === i && s.infoHl)}>
						<rect x={sx(i)} y={IY} width={S_W} height={IH} rx={4} />
						<text className={s.infoSize} x={sx(i) + S_W / 2} y={IY + 16} textAnchor="middle">
							size {p.size}
						</text>
						{p.used.map((u, k) => (
							<rect
								key={k}
								className={cx(s.bit, u && s.bitUsed, f.hlChunk?.[0] === i && f.hlChunk[1] === k && s.bitHl)}
								x={bx + k * (bw + gap)}
								y={IY + 24}
								width={bw}
								height={12}
								rx={1.5}
							/>
						))}
					</g>
				);
			})}

			{/* Heap pages */}
			<text className={s.section} x={20} y={HY - 12}>
				heap
			</text>
			{f.pages.map((p, i) => {
				if (p.k === 'free') return <rect key={`p${i}`} className={s.freePage} x={sx(i)} y={HY} width={S_W} height={HH} rx={4} />;
				if (p.k === 'run')
					return (
						<g key={`p${i}`} className={s.usedRun}>
							<rect x={sx(i)} y={HY} width={S_W} height={HH} rx={4} />
						</g>
					);
				const ch = HH / p.used.length;
				return (
					<g key={`p${i}-c`} className={s.chunkPage}>
						<rect className={s.chunkFrame} x={sx(i)} y={HY} width={S_W} height={HH} rx={4} />
						{p.used.map((u, k) => (
							<rect
								key={k}
								className={cx(s.chunk, u && s.chunkUsed, f.hlChunk?.[0] === i && f.hlChunk[1] === k && s.chunkHl)}
								x={sx(i) + 3}
								y={HY + k * ch + 1.5}
								width={S_W - 6}
								height={ch - 3}
								rx={2}
							/>
						))}
					</g>
				);
			})}
			{f.pages.map((p, i) => (
				<text key={`n${i}`} className={s.pageNum} x={sx(i) + S_W / 2} y={HY + HH + 16} textAnchor="middle">
					page {i}
					{p.k === 'chunks' ? ` · ${p.size} B` : ''}
				</text>
			))}

			{/* Size lists */}
			{([32, 64] as const).map((size, row) => {
				const y = LY + row * LROW;
				const list = f.lists[size];
				const hot = f.hlList === size;
				return (
					<g key={size}>
						<text className={cx(s.rowLabel, hot && s.rowLabelHl)} x={20} y={y + 17}>
							{size} B list
						</text>
						<line
							className={cx(s.link, hot && s.linkCur)}
							x1={90}
							x2={CHIP_X0 - 4}
							y1={y + 12}
							y2={y + 12}
							markerEnd={`url(#${mk}-${hot ? 'c' : 'a'})`}
						/>
						{list.length === 0 && (
							<text className={s.nullText} x={CHIP_X0 + 4} y={y + 17}>
								empty
							</text>
						)}
						{list.map((page, k) => (
							<g key={page} className={s.chipMove} style={{ transform: `translateX(${CHIP_X0 + k * (CHIP_W + 26)}px)` }}>
								<g className={cx(s.chip, f.hlInfo === page && s.chipHl)}>
									<rect x={0} y={y} width={CHIP_W} height={24} rx={12} />
									<text x={CHIP_W / 2} y={y + 16.5} textAnchor="middle">
										pginfo {page}
									</text>
								</g>
								{k < list.length - 1 && <line className={s.link} x1={CHIP_W + 2} x2={CHIP_W + 22} y1={y + 12} y2={y + 12} markerEnd={`url(#${mk}-a)`} />}
							</g>
						))}
					</g>
				);
			})}
		</svg>
	);
}

// ---------------------------------------------------------------- shell

export default function PhkMalloc({ variant = 'pages' }: Props) {
	const mk = `phk${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
	const frames: Base[] = variant === 'classic' ? CLASSIC : variant === 'subpage' ? SUBPAGE : PAGES;
	const last = frames.length - 1;
	const stepper = useStepper(last, { intervalMs: 1700 });
	const step = Math.min(stepper.step, last);
	const f = frames[step];

	let badge: { label: string; value: number; bad: boolean }[];
	if (variant === 'classic') {
		const cf = f as CFrame;
		const pagedIn = 2 - cf.pagedOut.length;
		badge = [
			{ label: 'pages malloc touched', value: cf.touched.length, bad: cf.touched.length > 0 },
			{ label: 'paged in from disk', value: pagedIn, bad: pagedIn > 0 },
		];
	} else badge = [{ label: 'free heap pages malloc touched', value: 0, bad: false }];

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`step ${step} / ${last}`} />
			<p className={s.message}>
				{f.tag && <span className={s.tag}>{f.tag}</span>}
				{f.msg}
			</p>
			<div className={s.figure}>
				{variant === 'classic' && <Classic f={f as CFrame} mk={mk} />}
				{variant === 'pages' && <Pages f={f as PFrame} mk={mk} />}
				{variant === 'subpage' && <SubPage f={f as SFrame} mk={mk} />}
			</div>
			<div className={s.footer}>
				<div className={s.legend}>
					<span className={s.lgUsed}>in use</span>
					<span className={s.lgNew}>just allocated</span>
					<span className={s.lgFree}>free</span>
					<span className={s.lgCur}>malloc touches now</span>
					{variant === 'classic' && <span className={s.lgOut}>paged out</span>}
				</div>
				<div className={s.badges}>
					{badge.map((b) => (
						<span key={b.label} className={cx(s.badge, b.bad ? s.badgeBad : s.badgeGood)}>
							<b>{b.value}</b> {b.label}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
