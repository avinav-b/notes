// Next-PC prediction in the fetch stage: the PC is split into tag / index bits, the index picks a BTB
// row, the stored partial tag is compared with the PC's, and the next PC is chosen from PC+4, the BTB
// target (when the direction predictor says taken) or the return address stack.
import { useMemo } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './BtbLookup.module.css';

type Kind = 'alu' | 'cond' | 'call' | 'ret';

interface Fetch {
	pc: number;
	insn: string;
	kind: Kind;
	/** Direction prediction for a conditional branch. */
	dirp?: 'T' | 'N';
}

interface Props {
	fetches?: Fetch[];
	/** BTB contents: the branch PC (gives index and tag) and its last target. */
	btb?: { pc: number; target: number }[];
	/** Return address stack, bottom first. */
	ras?: number[];
	/** Also draw the return address stack and the pre-decode bits (the full fetch-stage picture). */
	withRas?: boolean;
}

const DEFAULT_FETCHES: Fetch[] = [
	{ pc: 0x00401a20, insn: 'ADD r1, r2 → r3', kind: 'alu' },
	{ pc: 0x00401a24, insn: 'BNEZ r3, loop', kind: 'cond', dirp: 'T' },
	{ pc: 0x00401a00, insn: 'CALL f', kind: 'call' },
	{ pc: 0x00402c5c, insn: 'RET', kind: 'ret' },
];
const DEFAULT_BTB = [
	{ pc: 0x00401a24, target: 0x00401a00 },
	{ pc: 0x00401a00, target: 0x00402c40 },
	{ pc: 0x00402c5c, target: 0x00401e10 },
];

const index = (pc: number) => (pc >>> 2) & 0xff;
const tag = (pc: number) => (pc >>> 10) & 0x3ff;
const tgt = (target: number) => (target >>> 2) & 0xfff;
const hex = (v: number, digits: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(digits, '0');
const addr = (v: number) => hex(v, 8);

// PC bar geometry: 32 bits across [PC_X0, PC_X1].
const PC_X0 = 60;
const PC_X1 = 420;
const bitX = (bit: number) => PC_X0 + ((31 - bit) * (PC_X1 - PC_X0)) / 32; // left edge of a bit
const PC_Y = 36;
const PC_H = 30;

const TB_X = 250;
const TB_Y = 112;
const TB_ROW = 22;
const COLS = { idx: 46, tag: 78, target: 86 };
const TB_W = COLS.idx + COLS.tag + COLS.target;

export default function BtbLookup({ fetches = DEFAULT_FETCHES, btb = DEFAULT_BTB, ras = [0x00400f08], withRas = true }: Props) {
	const stepper = useStepper(fetches.length * 3, { intervalMs: 1500 });
	const st = stepper.step;
	const fi = st === 0 ? 0 : Math.ceil(st / 3) - 1;
	const phase = st === 0 ? 0 : ((st - 1) % 3) + 1; // 1 index, 2 compare, 3 next PC
	const f = fetches[fi];

	// BTB rows: every entry plus the rows the fetches look at, sorted by index.
	const rows = useMemo(() => {
		const map = new Map<number, { tag: number; target: number } | null>();
		for (const e of btb) map.set(index(e.pc), { tag: tag(e.pc), target: tgt(e.target) });
		for (const x of fetches) if (!map.has(index(x.pc))) map.set(index(x.pc), null);
		return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([i, e]) => ({ i, e }));
	}, [btb, fetches]);

	// Replay the RAS up to the current fetch.
	const rasBefore = useMemo(() => {
		const stack = [...ras];
		for (let k = 0; k < fi; k++) {
			if (fetches[k].kind === 'call') stack.push(fetches[k].pc + 4);
			if (fetches[k].kind === 'ret') stack.pop();
		}
		return stack;
	}, [fi, ras, fetches]);

	const row = rows.findIndex((r) => r.i === index(f.pc));
	const entry = rows[row].e;
	const hit = !!entry && entry.tag === tag(f.pc);
	const btbTarget = hit ? ((f.pc & ~0x3fff) | (entry!.target << 2)) >>> 0 : null;
	const choice: 'plus4' | 'btb' | 'ras' = f.kind === 'ret' ? 'ras' : hit && (f.kind === 'call' || (f.kind === 'cond' && f.dirp === 'T')) ? 'btb' : 'plus4';
	const rasTop = rasBefore[rasBefore.length - 1];
	const nextPc = choice === 'ras' ? rasTop : choice === 'btb' ? btbTarget! : f.pc + 4;
	const rasNow = phase === 3 && st > 0 ? (f.kind === 'call' ? [...rasBefore, f.pc + 4] : f.kind === 'ret' ? rasBefore.slice(0, -1) : rasBefore) : rasBefore;

	const name = f.insn.split(' ')[0];
	const messages: Record<number, string> = {
		0: 'The fetch stage must pick the next PC before it decodes anything.',
		1: `${name}: index bits ${hex(index(f.pc), 2)} pick one BTB row.`,
		2: entry ? (hit ? (f.kind === 'ret' ? 'Tags match, but this target is from an older call.' : `Tags match: a hit. ${name} is a known control instruction.`) : 'Tags differ: a miss.') : 'That row is empty: a miss. Not a known branch.',
		3:
			choice === 'ras'
				? `Pre-decode says return: pop the RAS, ${addr(rasTop)}.`
				: choice === 'btb'
					? f.kind === 'call'
						? 'Unconditional: go to the BTB target; push PC + 4 on the RAS.'
						: 'Direction predictor says taken: go to the BTB target.'
					: hit
						? 'Predicted not taken: next PC = PC + 4.'
						: 'Next PC = PC + 4.',
	};

	const rowY = (k: number) => TB_Y + k * TB_ROW;
	const lit = st > 0;
	const candidates = [
		{ id: 'plus4', label: 'PC + 4', value: addr(f.pc + 4), x: 20 },
		{ id: 'btb', label: 'BTB target', value: btbTarget !== null && phase >= 2 ? addr(btbTarget) : '–', x: 235 },
		{ id: 'ras', label: 'RAS top', value: rasTop !== undefined ? addr(rasTop) : '–', x: 450 },
	].filter((c) => withRas || c.id !== 'ras');

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={st === 0 ? 'start' : `fetch ${fi + 1} / ${fetches.length}`} />
			<p className={s.message}>{messages[phase]}</p>

			<div className={s.scroll}>
				<svg className={s.svg} viewBox="0 0 640 404" role="img" aria-label="BTB lookup in the fetch stage">
					<defs>
						<marker id="btb-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
							<path d="M0,0 L10,5 L0,10 z" className={s.headOn} />
						</marker>
					</defs>

					{/* PC, split into fields */}
					<text className={s.title} x={20} y={PC_Y + 20}>
						PC
					</text>
					<text className={s.pcValue} x={PC_X0} y={18}>
						{lit ? addr(f.pc) : ''}
					</text>
					{[
						{ hi: 31, lo: 10, v: lit ? hex(f.pc >>> 10, 4) : '', on: false },
						{ hi: 9, lo: 2, v: lit ? hex(index(f.pc), 2) : '', on: phase === 1 },
						{ hi: 1, lo: 0, v: '00', on: false },
					].map((fl) => (
						<g key={fl.hi} className={fl.on ? s.fieldOn : s.field}>
							<rect x={bitX(fl.hi)} y={PC_Y} width={bitX(fl.lo - 1) - bitX(fl.hi)} height={PC_H} />
							<text className={s.fieldBits} x={(bitX(fl.hi) + bitX(fl.lo - 1)) / 2} y={PC_Y - 4} textAnchor="middle">
								[{fl.hi}:{fl.lo}]
							</text>
							<text className={s.fieldVal} x={(bitX(fl.hi) + bitX(fl.lo - 1)) / 2} y={PC_Y + 20} textAnchor="middle">
								{fl.hi === 1 ? '' : fl.v}
							</text>
						</g>
					))}
					{/* Partial tag bits [19:10] */}
					<rect className={phase === 2 ? s.subOn : s.sub} x={bitX(19)} y={PC_Y + PC_H - 6} width={bitX(9) - bitX(19)} height={6} />

					{/* Instruction from the I$ and its pre-decode bits */}
					<text className={s.small} x={445} y={PC_Y - 4}>
						I$ instruction
					</text>
					<rect className={s.box} x={445} y={PC_Y} width={180} height={PC_H} rx={5} />
					<text className={s.insn} x={455} y={PC_Y + 20}>
						{lit ? f.insn : ''}
					</text>
					{withRas && (['ret', 'cond'] as const).map((b, k) => {
						const on = lit && ((b === 'ret' && f.kind === 'ret') || (b === 'cond' && f.kind === 'cond'));
						return (
							<g key={b} className={on ? s.pillOn : s.pill}>
								<rect x={445 + k * 64} y={PC_Y + PC_H + 6} width={58} height={18} rx={9} />
								<text x={445 + k * 64 + 29} y={PC_Y + PC_H + 19} textAnchor="middle">
									{b}? {on ? 1 : 0}
								</text>
							</g>
						);
					})}
					{withRas && (
						<text className={s.small} x={445 + 2 * 64 + 2} y={PC_Y + PC_H + 19}>
							pre-decode
						</text>
					)}

					{/* BTB */}
					<text className={s.title} x={TB_X} y={TB_Y - 12}>
						BTB
					</text>
					<text className={s.colHead} x={TB_X + COLS.idx / 2} y={TB_Y - 2} textAnchor="middle">
						index
					</text>
					<text className={s.colHead} x={TB_X + COLS.idx + COLS.tag / 2} y={TB_Y - 2} textAnchor="middle">
						tag [19:10]
					</text>
					<text className={s.colHead} x={TB_X + COLS.idx + COLS.tag + COLS.target / 2} y={TB_Y - 2} textAnchor="middle">
						target [13:2]
					</text>
					{rows.map((r, k) => {
						const sel = lit && k === row;
						const y = rowY(k);
						return (
							<g key={r.i} className={sel ? s.rowOn : s.row}>
								<rect className={s.rowBg} x={TB_X} y={y + 2} width={TB_W} height={TB_ROW} />
								<text className={s.cellIdx} x={TB_X + COLS.idx / 2} y={y + 17} textAnchor="middle">
									{hex(r.i, 2)}
								</text>
								<rect className={sel && phase === 2 ? (hit ? s.cmpHit : s.cmpMiss) : s.cellPlain} x={TB_X + COLS.idx + 3} y={y + 4} width={COLS.tag - 6} height={TB_ROW - 4} rx={3} />
								<text className={s.cell} x={TB_X + COLS.idx + COLS.tag / 2} y={y + 17} textAnchor="middle">
									{r.e ? hex(r.e.tag, 3) : '—'}
								</text>
								<rect className={sel && phase >= 2 && hit ? s.cellTarget : s.cellPlain} x={TB_X + COLS.idx + COLS.tag + 3} y={y + 4} width={COLS.target - 6} height={TB_ROW - 4} rx={3} />
								<text className={s.cell} x={TB_X + COLS.idx + COLS.tag + COLS.target / 2} y={y + 17} textAnchor="middle">
									{r.e ? hex(r.e.target, 3) : '—'}
								</text>
							</g>
						);
					})}
					<rect className={s.tableBorder} x={TB_X} y={TB_Y + 2} width={TB_W} height={rows.length * TB_ROW} rx={4} />

					{/* Index wire: PC [9:2] to the row */}
					{lit && (
						<path
							className={phase === 1 ? s.wireOn : s.wire}
							d={`M${(bitX(9) + bitX(1)) / 2},${PC_Y + PC_H} V${PC_Y + PC_H + 14} H${TB_X - 14} V${rowY(row) + 13} H${TB_X - 2}`}
							markerEnd={phase === 1 ? 'url(#btb-head)' : undefined}
						/>
					)}

					{/* Tag compare */}
					{(() => {
						const cx = TB_X + COLS.idx + COLS.tag / 2;
						const cy = TB_Y + rows.length * TB_ROW + 30;
						const on = phase === 2 && lit;
						const tx = bitX(19) + 8;
						return (
							<g>
								<path className={on ? s.wireOn : s.wire} d={`M${tx},${PC_Y + PC_H} V${cy} H${cx - 14}`} />
								<path className={on ? s.wireOn : s.wire} d={`M${cx},${TB_Y + rows.length * TB_ROW + 2} V${cy - 14}`} />
								<circle className={on ? (hit ? s.eqHit : s.eqMiss) : s.eq} cx={cx} cy={cy} r={14} />
								<text className={s.eqText} x={cx} y={cy + 5} textAnchor="middle">
									=
								</text>
								{lit && phase >= 2 && (
									<text className={hit ? s.hitText : s.missText} x={cx + 22} y={cy + 5}>
										{hit ? 'hit' : 'miss'}
									</text>
								)}
							</g>
						);
					})()}

					{/* Direction predictor */}
					<text className={s.title} x={490} y={TB_Y - 12}>
						DIRP
					</text>
					<rect className={lit && f.kind === 'cond' ? s.boxOn : s.box} x={490} y={TB_Y + 2} width={135} height={30} rx={5} />
					<text className={s.insn} x={557} y={TB_Y + 22} textAnchor="middle">
						{lit ? (f.kind === 'cond' ? `predict ${f.dirp}` : 'not conditional') : ''}
					</text>

					{/* Return address stack */}
					{withRas && (
						<text className={s.title} x={490} y={TB_Y + 58}>
							RAS
						</text>
					)}
					{withRas && Array.from({ length: 4 }, (_, k) => {
						const v = rasNow[k];
						const top = k === rasNow.length - 1;
						const y = TB_Y + 140 - k * 22;
						const pushed = phase === 3 && f.kind === 'call' && top;
						return (
							<g key={k} className={pushed ? s.rasPush : s.ras}>
								<rect x={490} y={y} width={135} height={22} />
								<text x={557} y={y + 15} textAnchor="middle">
									{v !== undefined ? addr(v) : ''}
								</text>
							</g>
						);
					})}
					{/* The popped return address stays visible while it is used */}
					{phase === 3 && f.kind === 'ret' && (
						<g className={s.rasOn}>
							<rect x={490} y={TB_Y + 140 - rasNow.length * 22} width={135} height={22} />
							<text x={557} y={TB_Y + 140 - rasNow.length * 22 + 15} textAnchor="middle">
								{addr(rasTop)}
							</text>
						</g>
					)}

					{/* Candidates and the chosen next PC */}
					{candidates.map((c) => {
						const on = lit && phase === 3 && c.id === choice;
						return (
							<g key={c.id} className={on ? s.candOn : s.cand}>
								<rect x={c.x} y={306} width={170} height={40} rx={6} />
								<text className={s.candLabel} x={c.x + 85} y={322} textAnchor="middle">
									{c.label}
								</text>
								<text className={s.candVal} x={c.x + 85} y={339} textAnchor="middle">
									{lit ? c.value : ''}
								</text>
							</g>
						);
					})}
					{lit && phase === 3 && (
						<path className={s.wireOn} d={`M${candidates.find((c) => c.id === choice)!.x + 85},346 L320,368`} markerEnd="url(#btb-head)" />
					)}
					<rect className={lit && phase === 3 ? s.nextOn : s.next} x={235} y={370} width={170} height={30} rx={6} />
					<text className={s.candVal} x={320} y={390} textAnchor="middle">
						{lit && phase === 3 ? `next PC ${addr(nextPc)}` : 'next PC'}
					</text>
				</svg>
			</div>

			<div className={s.legend}>
				<span>
					<i className={s.lgOn} /> being used now
				</span>
				<span>
					<i className={s.lgHit} /> tag match (hit)
				</span>
				<span>
					<i className={s.lgMiss} /> no match (miss)
				</span>
			</div>
		</div>
	);
}
