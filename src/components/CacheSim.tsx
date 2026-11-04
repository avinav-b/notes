// A set-associative cache stepping through a sequence of accesses: address split into tag | index | offset,
// the index picks a set, the tags in that set are compared, then a hit, or a miss that fetches the block
// from memory and evicts the least recently used line. Data-driven: sets, ways, block size, accesses.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, X } from 'lucide-react';
import { StepControls, useStepper } from './StepControls';
import s from './CacheSim.module.css';

interface Config {
	/** Button label, e.g. "Direct-mapped". */
	name: string;
	sets: number;
	ways: number;
}
interface Access {
	addr: number;
	/** What lives at this address, e.g. "a[64]". */
	label?: string;
	/** Initial blocks only: time of last use (lower = older), to pick the LRU victim. */
	age?: number;
}
interface Props {
	/** One or more cache shapes; with more than one, buttons switch between them. */
	configs?: Config[];
	/** Bytes per block. */
	blockSize?: number;
	/** Address bits drawn (the low bits; higher bits are taken to be 0). */
	addrBits?: number;
	accesses?: Access[];
	/** Blocks already in the cache at the start. */
	initial?: Access[];
	/** false: talk about block numbers only (no address bits, valid bits or tags). */
	showBits?: boolean;
	/** "grid": draw every memory block (for small memories); "list": only the blocks the accesses use. */
	memory?: 'grid' | 'list';
	/** Number of memory blocks drawn in grid mode. */
	memoryBlocks?: number;
}

interface Line {
	valid: boolean;
	tag: number;
	block: number;
	used: number;
}
type Outcome = 'hit' | 'cold' | 'conflict' | 'capacity';
interface Frame {
	phase: 'init' | 'lookup' | 'result';
	k: number;
	lines: Line[][];
	set: number;
	tag: number;
	offset: number;
	hitWay: number;
	fillWay: number;
	victim: Line | null;
	outcomes: Outcome[];
}

const log2 = (n: number) => Math.round(Math.log2(n));
const hex = (n: number) => '0x' + n.toString(16).toUpperCase().padStart(3, '0');

function simulate(cfg: Config, blockSize: number, accesses: Access[], initial: Access[]): Frame[] {
	const S = cfg.sets;
	const E = cfg.ways;
	const blk = (a: number) => Math.floor(a / blockSize);
	const lines: Line[][] = Array.from({ length: S }, () => Array.from({ length: E }, () => ({ valid: false, tag: 0, block: -1, used: -1e9 })));
	const seen = new Set<number>();
	// A fully associative LRU cache of the same size, to tell conflict misses from capacity misses.
	const fa: number[] = [];
	const cap = S * E;
	const touchFa = (b: number) => {
		const i = fa.indexOf(b);
		const hit = i >= 0;
		if (hit) fa.splice(i, 1);
		fa.push(b);
		if (fa.length > cap) fa.shift();
		return hit;
	};
	initial.forEach((a, n) => {
		const b = blk(a.addr);
		const set = b % S;
		const way = lines[set].findIndex((l) => !l.valid);
		if (way < 0) return;
		lines[set][way] = { valid: true, tag: Math.floor(b / S), block: b, used: a.age ?? n - initial.length };
		seen.add(b);
	});
	[...initial].sort((x, y) => (x.age ?? 0) - (y.age ?? 0)).forEach((a) => touchFa(blk(a.addr)));

	const copy = () => lines.map((set) => set.map((l) => ({ ...l })));
	const outcomes: Outcome[] = [];
	const frames: Frame[] = [
		{ phase: 'init', k: -1, lines: copy(), set: -1, tag: 0, offset: 0, hitWay: -1, fillWay: -1, victim: null, outcomes: [] },
	];
	accesses.forEach((a, k) => {
		const b = blk(a.addr);
		const set = b % S;
		const tag = Math.floor(b / S);
		const offset = a.addr % blockSize;
		const before = copy();
		const hitWay = lines[set].findIndex((l) => l.valid && l.tag === tag);
		const faHit = touchFa(b);
		frames.push({ phase: 'lookup', k, lines: before, set, tag, offset, hitWay, fillWay: -1, victim: null, outcomes: [...outcomes] });
		let fillWay = -1;
		let victim: Line | null = null;
		if (hitWay >= 0) {
			lines[set][hitWay].used = k;
			outcomes.push('hit');
		} else {
			fillWay = lines[set].findIndex((l) => !l.valid);
			if (fillWay < 0) {
				fillWay = 0;
				lines[set].forEach((l, w) => {
					if (l.used < lines[set][fillWay].used) fillWay = w;
				});
				victim = { ...lines[set][fillWay] };
			}
			lines[set][fillWay] = { valid: true, tag, block: b, used: k };
			outcomes.push(!seen.has(b) ? 'cold' : faHit ? 'conflict' : 'capacity');
		}
		seen.add(b);
		frames.push({ phase: 'result', k, lines: copy(), set, tag, offset, hitWay, fillWay, victim, outcomes: [...outcomes] });
	});
	return frames;
}

// ---- layout ----
const LH = 32; // line box height
const WAY_GAP = 14;

export default function CacheSim({
	configs = [
		{ name: 'Direct-mapped', sets: 64, ways: 1 },
		{ name: '2-way', sets: 32, ways: 2 },
	],
	blockSize = 8,
	addrBits = 12,
	accesses = [
		{ addr: 0x0, label: 'a[0]' },
		{ addr: 0x200, label: 'a[64]' },
		{ addr: 0x0, label: 'a[0]' },
		{ addr: 0x8, label: 'a[1]' },
		{ addr: 0x100, label: 'a[32]' },
	],
	initial = [],
	showBits = true,
	memory = 'list',
	memoryBlocks = 16,
}: Props) {
	const [ci, setCi] = useState(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = rootRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 540));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	// Wide: memory to the right of the cache. Narrow (phones): memory below it.
	const W = narrow ? 400 : 680;
	const X0 = narrow ? 68 : 70; // start of the ways area
	const X1 = narrow ? 392 : 474; // end of the ways area
	const cfg = configs[Math.min(ci, configs.length - 1)];
	const frames = useMemo(() => simulate(cfg, blockSize, accesses, initial), [cfg, blockSize, accesses, initial]);
	const last = frames.length - 1;
	const stepper = useStepper(last, { intervalMs: 1300 });
	const f = frames[Math.min(stepper.step, last)];
	const S = cfg.sets;
	const E = cfg.ways;
	const ob = log2(blockSize);
	const ib = log2(S);
	const tb = addrBits - ib - ob;
	const acc = f.k >= 0 ? accesses[f.k] : null;

	const labelOf = useMemo(() => {
		const m = new Map<number, string>();
		for (const a of [...initial, ...accesses]) {
			const b = Math.floor(a.addr / blockSize);
			if (!m.has(b)) m.set(b, a.label ?? String(b));
		}
		return (b: number) => m.get(b) ?? String(b);
	}, [accesses, initial, blockSize]);

	// ---- which sets get a row ----
	type Row = { kind: 'set'; set: number } | { kind: 'gap' };
	const rows: Row[] = useMemo(() => {
		if (S <= 8) return Array.from({ length: S }, (_, set) => ({ kind: 'set' as const, set }));
		const used = new Set<number>([0, S - 1]);
		for (const a of [...accesses, ...initial]) used.add(Math.floor(a.addr / blockSize) % S);
		const sorted = [...used].sort((a, b) => a - b);
		const out: Row[] = [];
		sorted.forEach((set, n) => {
			if (n > 0 && set - sorted[n - 1] > 1) out.push({ kind: 'gap' });
			out.push({ kind: 'set', set });
		});
		return out;
	}, [S, accesses, initial, blockSize]);

	// ---- vertical layout ----
	const addrH = showBits ? 104 : 58;
	const cacheY = addrH + 44; // top of first row
	const RH = E > 1 ? 54 : 44; // row pitch (room for the LRU label when sets have several ways)
	const rowTop = rows.map((_, n) => cacheY + n * RH);
	const rowOfSet = (set: number) => rows.findIndex((r) => r.kind === 'set' && r.set === set);
	const cacheBottom = cacheY + rows.length * RH;

	// ---- memory panel ----
	const memBlocks = useMemo(() => {
		if (memory === 'grid') return Array.from({ length: memoryBlocks }, (_, b) => b);
		const set = new Set<number>();
		for (const a of [...initial, ...accesses]) set.add(Math.floor(a.addr / blockSize));
		return [...set].sort((a, b) => a - b);
	}, [memory, memoryBlocks, accesses, initial, blockSize]);
	const MX = narrow ? 12 : 500;
	const MW = narrow ? W - 20 : 172;
	const memY = narrow ? cacheBottom + 30 : cacheY;
	const memCols = memory === 'grid' ? (narrow ? 8 : 4) : narrow ? 2 : 1;
	const memPos = (b: number) => {
		const n = memBlocks.indexOf(b);
		const cw = MW / memCols;
		return { x: MX + (n % memCols) * cw, y: memY + Math.floor(n / memCols) * 34, w: cw - (memCols > 1 ? 6 : 0), h: 28 };
	};
	const memBottom = memY + Math.ceil(memBlocks.length / memCols) * 34;

	// ---- way geometry ----
	const wayW = (X1 - X0 - (E - 1) * WAY_GAP) / E;
	const wayX = (w: number) => X0 + w * (wayW + WAY_GAP);
	const vW = showBits ? 22 : 0;
	const tagW = showBits ? Math.min(64, Math.max(40, tb * 9 + 18)) : 0;
	const dataX = (w: number) => wayX(w) + vW + tagW;
	const dataW = wayW - vW - tagW;

	// ---- tally ----
	const tallyY = Math.max(cacheBottom, memBottom) + 22;
	const H = tallyY + 62;

	// ---- address bits ----
	const bitW = Math.min(44, (X1 - X0) / addrBits);
	const bitX = (i: number) => X0 + i * bitW; // i = 0 is the most significant bit shown
	const fieldOf = (i: number) => {
		const bit = addrBits - 1 - i;
		return bit < ob ? 'offset' : bit < ob + ib ? 'index' : 'tag';
	};
	const fields = [
		{ key: 'tag', n: tb, from: 0, hi: addrBits - 1, lo: ob + ib },
		{ key: 'index', n: ib, from: tb, hi: ob + ib - 1, lo: ob },
		{ key: 'offset', n: ob, from: tb + ib, hi: ob - 1, lo: 0 },
	].filter((x) => x.n > 0);
	const fieldVal = (key: string) => (key === 'tag' ? f.tag : key === 'index' ? f.set : f.offset);

	const looking = f.phase !== 'init';
	const sel = looking ? rowOfSet(f.set) : -1;
	const indexField = fields.find((x) => x.key === 'index');
	const arrowFromX = indexField ? bitX(indexField.from) + (indexField.n * bitW) / 2 : X0 + 40;
	const arrowFromY = showBits ? 99 : 54;
	const arrowY = sel >= 0 ? rowTop[sel] + LH / 2 : 0;
	const arrowPath = `M${arrowFromX},${arrowFromY} V${addrH + 4} H4 V${arrowY} H12`;

	const outcome = f.phase === 'result' ? f.outcomes[f.k] : null;
	const missCount = f.outcomes.filter((o) => o !== 'hit').length;
	const hitCount = f.outcomes.length - missCount;

	const message = (() => {
		if (!acc) return showBits ? 'Step through the accesses.' : 'The cache holds 4 of the 16 memory blocks.';
		const name = acc.label ?? `block ${Math.floor(acc.addr / blockSize)}`;
		if (f.phase === 'lookup')
			return showBits ? `${name}: index picks set ${f.set}; compare tag ${f.tag}.` : `Request ${name}: is it in the cache?`;
		if (outcome === 'hit') return showBits ? 'Hit: valid line with a matching tag.' : `Hit: ${name} is in the cache.`;
		const kind = outcome === 'cold' ? 'Cold miss' : outcome === 'conflict' ? 'Conflict miss' : 'Capacity miss';
		return f.victim ? `${kind}: fetch ${name}, evict ${labelOf(f.victim.block)}.` : `${kind}: fetch ${name} into an empty line.`;
	})();

	const tallyCellW = Math.min(64, (W - 24) / Math.max(accesses.length, 1));

	return (
		<div ref={rootRef} className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`access ${Math.max(f.k + 1, 0)} / ${accesses.length}`}>
				{configs.length > 1 &&
					configs.map((c, n) => (
						<button key={c.name} className={`viz-btn ${n === ci ? s.modeOn : ''}`} aria-pressed={n === ci} onClick={() => setCi(n)}>
							{c.name}
						</button>
					))}
			</StepControls>

			<p className={s.message}>{message}</p>

			<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cache lookup: address bits, sets, tags, hit or miss">
				<defs>
					<marker id="cs-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.headIndex} />
					</marker>
				</defs>

				{/* ---- address ---- */}
				{showBits ? (
					<g>
						<text className={s.section} x={X0} y={14}>
							address
							{acc && (
								<tspan className={s.addrName}>
									{'  '}
									{acc.label ? `${acc.label} = ` : ''}
									{hex(acc.addr)}
								</tspan>
							)}
						</text>
						{Array.from({ length: addrBits }, (_, i) => {
							const bit = addrBits - 1 - i;
							const v = acc ? (acc.addr >> bit) & 1 : null;
							const fld = fieldOf(i);
							return (
								<g key={i} className={`${s.bit} ${looking ? s[`f_${fld}`] : ''}`}>
									<rect x={bitX(i) + 1} y={24} width={bitW - 2} height={28} rx={4} />
									<text x={bitX(i) + bitW / 2} y={43} textAnchor="middle">
										{v ?? '·'}
									</text>
								</g>
							);
						})}
						{fields.map((fl) => {
							const x0 = bitX(fl.from) + 2;
							const x1 = bitX(fl.from + fl.n) - 2;
							const cx = (x0 + x1) / 2;
							return (
								<g key={fl.key} className={s[`fl_${fl.key}`]}>
									<path className={s.brace} d={`M${x0},58 V62 H${x1} V58`} />
									<text className={s.fieldName} x={cx} y={78} textAnchor="middle">
										{fl.key}
									</text>
									<text className={s.fieldBits} x={cx} y={94} textAnchor="middle">
										{fl.n} bit{fl.n > 1 ? 's' : ''}
										{looking ? ` = ${fieldVal(fl.key)}` : ''}
									</text>
								</g>
							);
						})}
					</g>
				) : (
					<g>
						<text className={s.section} x={X0} y={14}>
							request
						</text>
						<g className={`${s.request} ${acc ? s.requestOn : ''}`}>
							<rect x={X0} y={22} width={86} height={28} rx={6} />
							<text x={X0 + 43} y={41} textAnchor="middle">
								{acc ? `block ${acc.label ?? Math.floor(acc.addr / blockSize)}` : '·'}
							</text>
						</g>
					</g>
				)}

				{/* ---- index arrow ---- */}
				{sel >= 0 && (showBits || S > 1) && <path className={s.indexArrow} d={arrowPath} markerEnd="url(#cs-arrow)" />}

				{/* ---- cache ---- */}
				<text className={s.section} x={X0} y={cacheY - 22}>
					cache
					<tspan className={s.sectionSub}>
						{'  '}
						{showBits ? `${S} set${S > 1 ? 's' : ''} × ${E} way${E > 1 ? 's' : ''} × ${blockSize} B = ${S * E * blockSize} B` : `${S * E} blocks`}
					</tspan>
				</text>
				{showBits &&
					Array.from({ length: E }, (_, w) => (
						<g key={w} className={s.colHead}>
							<text x={wayX(w) + vW / 2} y={cacheY - 6} textAnchor="middle">
								v
							</text>
							<text x={wayX(w) + vW + tagW / 2} y={cacheY - 6} textAnchor="middle">
								tag
							</text>
							<text x={dataX(w) + dataW / 2} y={cacheY - 6} textAnchor="middle">
								{E > 1 ? `way ${w} data` : 'data block'}
							</text>
						</g>
					))}

				{rows.map((r, n) => {
					const y = rowTop[n];
					if (r.kind === 'gap')
						return (
							<text key={`g${n}`} className={s.gap} x={X0 + (X1 - X0) / 2} y={y + LH / 2 + 4} textAnchor="middle">
								· · ·
							</text>
						);
					const isSel = looking && r.set === f.set;
					const set = f.lines[r.set];
					const full = set.every((l) => l.valid);
					let lru = -1;
					if (E > 1 && full) {
						lru = 0;
						set.forEach((l, w) => {
							if (l.used < set[lru].used) lru = w;
						});
					}
					return (
						<g key={`s${r.set}`}>
							{isSel && <rect className={s.selRow} x={X0 - 6} y={y - 6} width={X1 - X0 + 12} height={LH + 12} rx={8} />}
							{(showBits || S > 1) && (
								<text className={`${s.setLabel} ${isSel ? s.setLabelOn : ''}`} x={16} y={y + LH / 2 + 4}>
									set {r.set}
								</text>
							)}
							{set.map((l, w) => {
								const comparing = isSel && f.phase === 'lookup';
								const match = comparing && l.valid && l.tag === f.tag;
								const hitHere = isSel && f.phase === 'result' && f.hitWay === w;
								const fillHere = isSel && f.phase === 'result' && f.fillWay === w;
								const cls = [s.line, !l.valid && s.invalid, hitHere && s.lineHit, fillHere && s.lineMiss].filter(Boolean).join(' ');
								const mp = fillHere ? memPos(l.block) : null;
								return (
									<g key={w} className={cls}>
										{showBits && (
											<>
												<rect className={s.vBox} x={wayX(w)} y={y} width={vW} height={LH} rx={4} />
												<text className={s.vText} x={wayX(w) + vW / 2} y={y + LH / 2 + 4} textAnchor="middle">
													{l.valid ? 1 : 0}
												</text>
												<rect
													className={`${s.tagBox} ${comparing ? s.tagCompare : ''}`}
													x={wayX(w) + vW + 2}
													y={y}
													width={tagW - 4}
													height={LH}
													rx={4}
												/>
												<text className={`${s.tagText} ${comparing ? s.tagTextOn : ''}`} x={wayX(w) + vW + tagW / 2} y={y + LH / 2 + 4} textAnchor="middle">
													{l.valid ? l.tag : '-'}
												</text>
											</>
										)}
										<rect className={s.dataBox} x={dataX(w)} y={y} width={dataW} height={LH} rx={4} />
										{showBits &&
											blockSize > 1 &&
											blockSize <= 16 &&
											Array.from({ length: blockSize - 1 }, (_, b) => (
												<line
													key={b}
													className={s.byteTick}
													x1={dataX(w) + ((b + 1) * dataW) / blockSize}
													x2={dataX(w) + ((b + 1) * dataW) / blockSize}
													y1={y + LH - 7}
													y2={y + LH}
												/>
											))}
										{l.valid && (
											<g
												key={fillHere ? `fill${stepper.step}` : 'still'}
												className={fillHere ? s.fly : undefined}
												style={
													mp
														? ({
																'--dx': `${mp.x + mp.w / 2 - (dataX(w) + dataW / 2)}px`,
																'--dy': `${mp.y + mp.h / 2 - (y + LH / 2)}px`,
															} as CSSProperties)
														: undefined
												}
											>
												{fillHere && <rect className={s.flyBox} x={dataX(w)} y={y} width={dataW} height={LH} rx={4} />}
												<text className={s.dataText} x={dataX(w) + dataW / 2} y={y + LH / 2 + 4} textAnchor="middle">
													{labelOf(l.block)}
												</text>
											</g>
										)}
										{fillHere && f.victim && (
											<text key={`v${stepper.step}`} className={s.victim} x={dataX(w) + dataW / 2} y={y + LH / 2 + 4} textAnchor="middle">
												{labelOf(f.victim.block)}
											</text>
										)}
										{comparing && (
											<g className={match ? s.badgeOk : s.badgeNo}>
												<circle cx={showBits ? wayX(w) + vW + tagW - 4 : dataX(w) + dataW - 2} cy={y + 1} r={9} />
												{match ? (
													<Check x={(showBits ? wayX(w) + vW + tagW - 4 : dataX(w) + dataW - 2) - 6} y={y - 5} width={12} height={12} strokeWidth={3} />
												) : (
													<X x={(showBits ? wayX(w) + vW + tagW - 4 : dataX(w) + dataW - 2) - 6} y={y - 5} width={12} height={12} strokeWidth={3} />
												)}
											</g>
										)}
										{lru === w && (
											<text className={s.lru} x={wayX(w) + wayW / 2} y={y + LH + 14} textAnchor="middle">
												least recently used
											</text>
										)}
									</g>
								);
							})}
						</g>
					);
				})}

				{/* ---- memory ---- */}
				<text className={s.section} x={MX} y={narrow ? memY - 10 : cacheY - 22}>
					memory
				</text>
				{memBlocks.map((b) => {
					const p = memPos(b);
					const want = acc && Math.floor(acc.addr / blockSize) === b;
					const inCache = f.lines.some((set) => set.some((l) => l.valid && l.block === b));
					const cls = [s.mem, inCache && s.memCached, want && s.memWant].filter(Boolean).join(' ');
					return (
						<g key={b} className={cls}>
							<rect x={p.x} y={p.y} width={p.w} height={p.h} rx={5} />
							{memory === 'grid' ? (
								<text x={p.x + p.w / 2} y={p.y + 18} textAnchor="middle">
									{b}
								</text>
							) : (
								<>
									<text x={p.x + 10} y={p.y + 18}>
										{labelOf(b)}
									</text>
									<text className={s.memAddr} x={p.x + p.w - 10} y={p.y + 18} textAnchor="end">
										{hex(b * blockSize)}
									</text>
								</>
							)}
						</g>
					);
				})}

				{/* ---- tally: one cell per access ---- */}
				<text className={s.section} x={12} y={tallyY}>
					accesses
					<tspan className={s.tallyCount}>
						{'  '}
						{hitCount} hit{hitCount === 1 ? '' : 's'} · {missCount} miss{missCount === 1 ? '' : 'es'}
					</tspan>
				</text>
				{accesses.map((a, n) => {
					const o = f.outcomes[n];
					const x = 12 + n * tallyCellW;
					const cur = n === f.k;
					return (
						<g key={n} className={`${s.tally} ${o ? (o === 'hit' ? s.tallyHit : s.tallyMiss) : ''} ${cur ? s.tallyCur : ''}`}>
							<rect x={x + 2} y={tallyY + 10} width={tallyCellW - 4} height={24} rx={4} />
							<text className={s.tallyLabel} x={x + tallyCellW / 2} y={tallyY + 26} textAnchor="middle">
								{a.label ?? Math.floor(a.addr / blockSize)}
							</text>
							<text className={s.tallyKind} x={x + tallyCellW / 2} y={tallyY + 48} textAnchor="middle">
								{o ?? ''}
							</text>
						</g>
					);
				})}
			</svg>

			<div className={s.legend}>
				{showBits && (
					<>
						<span className={s.lgTag}>tag</span>
						<span className={s.lgIndex}>index / set</span>
						<span className={s.lgOffset}>offset</span>
					</>
				)}
				<span className={s.lgHit}>hit</span>
				<span className={s.lgMiss}>miss</span>
				<span className={s.lgCached}>in cache</span>
			</div>
		</div>
	);
}
