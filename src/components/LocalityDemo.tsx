// Temporal vs spatial locality: an access stream over memory words grouped into blocks, and a small
// cache that holds whole blocks. A miss pulls the whole block up into the cache; later accesses hit
// either because the same word is reused (temporal) or because a neighbour came in with the block
// (spatial). Data-driven: block size, memory size, cache blocks, and the access stream of each mode.
import { useRef } from 'react';
import { StepControls, useSharedValue, useStepper } from './StepControls';
import { useWidth } from './OooTimeline';
import s from './LocalityDemo.module.css';

interface Mode {
	name: string;
	/** Word addresses accessed, in order. */
	accesses: number[];
}
interface Props {
	blockSize?: number;
	memWords?: number;
	cacheBlocks?: number;
	modes?: Mode[];
}

const MODES: Mode[] = [
	{ name: 'Temporal', accesses: [5, 13, 5, 13, 5, 13, 5] },
	{ name: 'Spatial', accesses: [0, 1, 2, 3, 4, 5, 6, 7] },
];

interface Frame {
	slots: (number | null)[]; // block number held by each cache slot
	used: number[]; // last-use time per slot, for LRU
	k: number; // index of the access just done (-1 = none yet)
	hit: boolean;
	slot: number; // slot touched
	why: 'reuse' | 'neighbour' | 'miss' | null;
	outcomes: boolean[]; // hit per access so far
}

function simulate(accesses: number[], blockSize: number, cacheBlocks: number): Frame[] {
	const frames: Frame[] = [];
	let slots: (number | null)[] = Array(cacheBlocks).fill(null);
	let used = Array(cacheBlocks).fill(-1);
	const touched = new Set<number>(); // words accessed so far
	const outcomes: boolean[] = [];
	frames.push({ slots, used, k: -1, hit: false, slot: -1, why: null, outcomes: [] });
	accesses.forEach((addr, k) => {
		const block = Math.floor(addr / blockSize);
		let slot = slots.indexOf(block);
		const hit = slot >= 0;
		slots = [...slots];
		used = [...used];
		if (!hit) {
			const empty = slots.indexOf(null);
			slot = empty >= 0 ? empty : used.indexOf(Math.min(...used));
			slots[slot] = block;
		}
		used[slot] = k;
		const why = !hit ? 'miss' : touched.has(addr) ? 'reuse' : 'neighbour';
		touched.add(addr);
		outcomes.push(hit);
		frames.push({ slots, used, k, hit, slot, why, outcomes: [...outcomes] });
	});
	return frames;
}

export default function LocalityDemo({ blockSize = 4, memWords = 16, cacheBlocks = 2, modes = MODES }: Props) {
	const [modeName, setModeName] = useSharedValue('locality-mode', modes[0].name);
	const mode = modes.find((m) => m.name === modeName) ?? modes[0];
	const frames = simulate(mode.accesses, blockSize, cacheBlocks);
	const stepper = useStepper(frames.length - 1, { intervalMs: 1300 });
	const fr = frames[stepper.step];
	const wrap = useRef<HTMLDivElement>(null);
	const [width] = useWidth(wrap);
	const narrow = width < 520;

	// ---- Layout (px; the SVG is drawn at its real width) ----
	const W = width;
	const blocks = memWords / blockSize;
	const BGAP = narrow ? 6 : 12;
	const LBL = narrow ? 0 : 100;
	const memCell = Math.min(40, (W - LBL - (blocks - 1) * BGAP - 4) / memWords);
	const memW = memCell * memWords + (blocks - 1) * BGAP;
	const memX0 = LBL + (W - LBL - memW) / 2;
	const blockX = (b: number) => memX0 + b * (blockSize * memCell + BGAP);
	const wordX = (a: number) => blockX(Math.floor(a / blockSize)) + (a % blockSize) * memCell;
	const cacheCell = Math.min(44, memCell * 1.15);
	const slotW = cacheCell * blockSize;
	const SGAP = narrow ? 16 : 28;
	const cacheW = cacheBlocks * slotW + (cacheBlocks - 1) * SGAP;
	const cacheX0 = LBL + (W - LBL - cacheW) / 2;
	const slotX = (i: number) => cacheX0 + i * (slotW + SGAP);
	const CH = 32;
	const chipW = Math.min(34, (W - LBL - 8) / mode.accesses.length - 6);
	const streamX0 = LBL + (W - LBL - mode.accesses.length * (chipW + 6)) / 2;

	const yStream = narrow ? 22 : 8;
	const yCache = yStream + 70 + (narrow ? 16 : 0);
	const yMem = yCache + CH + 74;
	const H = yMem + CH + 30;

	const cur = fr.k >= 0 ? mode.accesses[fr.k] : -1;
	const curBlock = cur >= 0 ? Math.floor(cur / blockSize) : -1;
	const cachedBlocks = new Set(fr.slots.filter((b): b is number => b !== null));
	const hits = fr.outcomes.filter(Boolean).length;
	const misses = fr.outcomes.length - hits;

	let msg = `The cache starts empty. Step through the accesses.`;
	if (fr.k >= 0) {
		const lo = curBlock * blockSize;
		if (fr.why === 'miss') msg = `Miss on word ${cur}: fetch its whole block (words ${lo} to ${lo + blockSize - 1}).`;
		else if (fr.why === 'reuse') msg = `Hit: word ${cur} was used recently (temporal).`;
		else msg = `Hit: word ${cur} came in with block ${curBlock} (spatial).`;
	}

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`access ${Math.max(0, fr.k + 1)} / ${mode.accesses.length}`}>
				<div className={s.seg} role="group" aria-label="Locality">
					{modes.map((m) => (
						<button
							key={m.name}
							className={`viz-btn ${m.name === mode.name ? s.on : ''}`}
							aria-pressed={m.name === mode.name}
							onClick={() => {
								setModeName(m.name);
								stepper.reset();
							}}
						>
							{m.name}
						</button>
					))}
				</div>
			</StepControls>
			<p className={s.message} aria-live="polite">
				{msg}
			</p>
			<div ref={wrap} className={s.wrap}>
				<svg className={s.svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={msg}>
					{/* Access stream */}
					{narrow ? (
						<text className={s.rowLblTop} x={4} y={12}>
							Accesses <tspan className={s.tally}>{hits} hit, {misses} miss</tspan>
						</text>
					) : (
						<>
							<text className={s.rowLbl} x={LBL - 8} y={yStream + 22} textAnchor="end">
								Accesses
							</text>
							<text className={s.tally} x={LBL - 8} y={yStream + 38} textAnchor="end">
								{hits} hit, {misses} miss
							</text>
						</>
					)}
					{mode.accesses.map((a, i) => {
						const done = i < fr.outcomes.length;
						const cls = i === fr.k ? (fr.hit ? s.chipHitNow : s.chipMissNow) : done ? (fr.outcomes[i] ? s.chipHit : s.chipMiss) : s.chipTodo;
						const cx = streamX0 + i * (chipW + 6);
						return (
							<g key={i} className={cls}>
								<rect x={cx} y={yStream + 8} width={chipW} height={24} rx={5} />
								<text x={cx + chipW / 2} y={yStream + 24} textAnchor="middle">
									{a}
								</text>
								<text className={s.chipOut} x={cx + chipW / 2} y={yStream + 46} textAnchor="middle">
									{done ? (fr.outcomes[i] ? 'hit' : 'miss') : ''}
								</text>
							</g>
						);
					})}

					{/* Cache */}
					{narrow ? (
						<text className={s.rowLblTop} x={4} y={yCache - 22}>
							Cache ({cacheBlocks} blocks)
						</text>
					) : (
						<>
							<text className={s.rowLbl} x={LBL - 8} y={yCache + 20} textAnchor="end">
								Cache
							</text>
							<text className={s.sub} x={LBL - 8} y={yCache + 35} textAnchor="end">
								{cacheBlocks} blocks
							</text>
						</>
					)}
					{fr.slots.map((b, i) => {
						const x0 = slotX(i);
						const fresh = fr.slot === i && !fr.hit;
						return (
							<g key={i}>
								<rect className={s.slot} x={x0 - 3} y={yCache - 3} width={slotW + 6} height={CH + 6} rx={6} />
								{b === null ? (
									<text className={s.empty} x={x0 + slotW / 2} y={yCache + CH / 2 + 4} textAnchor="middle">
										empty
									</text>
								) : (
									<g
										key={`${b}-${fresh ? fr.k : 'stay'}`}
										className={fresh ? s.fly : undefined}
										style={{
											['--dx' as string]: `${blockX(b) - x0}px`,
											['--dy' as string]: `${yMem - yCache}px`,
											['--sx' as string]: String(memCell / cacheCell),
										}}
									>
										{Array.from({ length: blockSize }, (_, w) => {
											const addr = b * blockSize + w;
											const now = addr === cur;
											const cls = now ? (fr.hit ? s.cellHit : s.cellMiss) : fresh ? s.cellNeighbour : s.cell;
											return (
												<g key={w} className={cls}>
													<rect x={x0 + w * cacheCell} y={yCache} width={cacheCell} height={CH} />
													<text x={x0 + w * cacheCell + cacheCell / 2} y={yCache + CH / 2 + 4} textAnchor="middle">
														{addr}
													</text>
												</g>
											);
										})}
									</g>
								)}
								{b !== null && (
									<text className={s.blockTag} x={x0 + slotW / 2} y={yCache + CH + 16} textAnchor="middle">
										block {b}
									</text>
								)}
							</g>
						);
					})}

					{/* Memory */}
					{narrow ? (
						<text className={s.rowLblTop} x={4} y={yMem - 24}>
							Memory
						</text>
					) : (
						<text className={s.rowLbl} x={LBL - 8} y={yMem + 20} textAnchor="end">
							Memory
						</text>
					)}
					{Array.from({ length: blocks }, (_, b) => (
						<g key={b}>
							<text className={b === curBlock ? s.blockTagNow : s.blockTag} x={blockX(b) + (blockSize * memCell) / 2} y={yMem - 8} textAnchor="middle">
								block {b}
							</text>
							<rect
								className={cachedBlocks.has(b) ? s.memBlockCached : s.memBlock}
								x={blockX(b) - 2}
								y={yMem - 2}
								width={blockSize * memCell + 4}
								height={CH + 4}
								rx={5}
							/>
						</g>
					))}
					{Array.from({ length: memWords }, (_, a) => (
						<g key={a} className={a === cur ? s.memNow : s.mem}>
							<rect x={wordX(a)} y={yMem} width={memCell} height={CH} />
							<text x={wordX(a) + memCell / 2} y={yMem + CH / 2 + 4} textAnchor="middle">
								{a}
							</text>
						</g>
					))}
				</svg>
			</div>
			<div className={s.legend}>
				<span className={s.lg}>
					<span className={s.swNow} /> accessed now
				</span>
				<span className={s.lg}>
					<span className={s.swHit} /> hit
				</span>
				<span className={s.lg}>
					<span className={s.swMiss} /> miss
				</span>
				<span className={s.lg}>
					<span className={s.swNeighbour} /> neighbour pulled in
				</span>
				<span className={s.lg}>
					<span className={s.swCached} /> block in the cache
				</span>
			</div>
		</div>
	);
}
