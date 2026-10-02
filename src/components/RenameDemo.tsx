import { useEffect, useMemo, useRef, useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import { findDeps, isReg, parseInsn, type Dep, type Insn } from './isa';
import s from './RenameDemo.module.css';

interface Props {
	/** Instructions in "op src,src -> dest" form. */
	program?: string[];
	/** Architectural registers r1..rN. */
	archRegs?: number;
	/** Physical registers p1..pM (p1..pN start mapped, the rest start free). */
	physRegs?: number;
}

type Phase = 'init' | 'lookup' | 'alloc';

interface Snapshot {
	phase: Phase;
	cur: number; // instruction being renamed (-1 before start)
	map: Record<string, string>; // arch -> phys
	free: string[]; // head first
	holder: Record<string, string>; // phys -> whose value it holds
	renamed: (Insn | null)[];
	lookedUp: string[]; // arch regs read this step
	changed: string | null; // arch reg remapped this step
	message: string;
}

function buildSnapshots(prog: Insn[], archRegs: number, physRegs: number): Snapshot[] {
	const arch = Array.from({ length: archRegs }, (_, i) => `r${i + 1}`);
	let map: Record<string, string> = Object.fromEntries(arch.map((r, i) => [r, `p${i + 1}`]));
	let free = Array.from({ length: physRegs - archRegs }, (_, i) => `p${archRegs + i + 1}`);
	let holder: Record<string, string> = Object.fromEntries(arch.map((r, i) => [`p${i + 1}`, `initial ${r}`]));
	const renamed: (Insn | null)[] = prog.map(() => null);

	const snaps: Snapshot[] = [
		{
			phase: 'init',
			cur: -1,
			map,
			free,
			holder,
			renamed: [...renamed],
			lookedUp: [],
			changed: null,
			message: `Each name starts out pointing at its own physical register. ${free.join(', ')} are free.`,
		},
	];

	prog.forEach((insn, i) => {
		// 1. Sources: follow the arrows (read the map table) before touching the destination.
		const srcRegs = insn.srcs.filter(isReg);
		const srcs = insn.srcs.map((x) => (isReg(x) ? map[x] : x));
		renamed[i] = { ...insn, srcs, dest: '?' };
		const reads = srcRegs.map((r) => `${r} → ${map[r]}`).join(' and ');
		snaps.push({
			phase: 'lookup',
			cur: i,
			map,
			free,
			holder,
			renamed: [...renamed],
			lookedUp: srcRegs,
			changed: null,
			message: `I${i + 1} reads ${srcRegs.join(' and ') || 'no registers'}. Follow the arrows: ${reads || 'nothing to look up'}.`,
		});

		// 2. Destination: take the next free register and point the name at it.
		const [fresh, ...rest] = free;
		const old = map[insn.dest];
		free = rest;
		map = { ...map, [insn.dest]: fresh };
		holder = { ...holder, [fresh]: `I${i + 1} result` };
		renamed[i] = { ...insn, srcs, dest: fresh };
		snaps.push({
			phase: 'alloc',
			cur: i,
			map,
			free,
			holder,
			renamed: [...renamed],
			lookedUp: [],
			changed: insn.dest,
			message:
				`I${i + 1} writes ${insn.dest}. Take ${fresh} from the free list and swing ${insn.dest}'s arrow to it. ` +
				`${old} is left untouched, so anything that already read ${insn.dest} as ${old} is unaffected.`,
		});
	});

	return snaps;
}

// ---- SVG layout ----
const W = 680;
const PX0 = 60; // first physical register centre
const PDX = 80;
const NAME_Y = 40; // top of name tags
const NAME_H = 30;
const PHYS_Y = 172; // top of physical registers
const PHYS_H = 34;
const BOX_W = 62;
const LIST_Y = 312; // first program row baseline
const ROW_H = 32;
const ORIG_X = 108; // text start, original column
const REN_X = 448; // text start, renamed column
const COL_W = 210;

const physX = (p: string) => PX0 + (Number(p.slice(1)) - 1) * PDX;
const nameX = (r: string) => PX0 + (Number(r.slice(1)) - 1) * PDX;
const rowY = (i: number) => LIST_Y + i * ROW_H;

/** Tween a number toward its target so arrows swing instead of jumping. */
function useTween(target: number, ms = 650) {
	const [v, setV] = useState(target);
	const fromRef = useRef(target);
	useEffect(() => {
		const from = fromRef.current;
		if (from === target) return;
		const start = performance.now();
		let raf = 0;
		const tick = (now: number) => {
			const k = Math.min(1, (now - start) / ms);
			const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
			const x = from + (target - from) * e;
			fromRef.current = x;
			setV(x);
			if (k < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [target, ms]);
	return v;
}

function MapArrow({ from, to, cls }: { from: number; to: number; cls: string }) {
	const x = useTween(to);
	const y0 = NAME_Y + NAME_H + 2;
	const y1 = PHYS_Y - 3;
	const mid = (y0 + y1) / 2;
	return <path className={cls} d={`M${from},${y0} C${from},${mid} ${x},${mid} ${x},${y1}`} markerEnd="url(#rn-arrow)" />;
}

/** Give each arc a nesting level so arcs whose spans overlap don't draw on top of each other. */
function arcLevels(deps: Dep[]): number[] {
	const order = deps.map((_, k) => k).sort((a, b) => deps[a].to - deps[a].from - (deps[b].to - deps[b].from));
	const levels: number[] = new Array(deps.length).fill(0);
	const placed: number[] = [];
	for (const k of order) {
		let lvl = 0;
		while (placed.some((p) => levels[p] === lvl && deps[p].from <= deps[k].to && deps[k].from <= deps[p].to)) lvl++;
		levels[k] = lvl;
		placed.push(k);
	}
	return levels;
}

const KIND_NAME: Record<Dep['kind'], string> = { RAW: 'true dependence', WAR: 'anti-dependence', WAW: 'output dependence' };

export default function RenameDemo({
	program = ['div r2,r3 -> r1', 'add r2,r1 -> r3', 'subi r4,4 -> r2', 'add r4,r2 -> r1'],
	archRegs = 4,
	physRegs = 8,
}: Props) {
	const prog = useMemo(() => program.map(parseInsn), [program.join('|')]);
	const snaps = useMemo(() => buildSnapshots(prog, archRegs, physRegs), [prog, archRegs, physRegs]);
	const origDeps = useMemo(() => findDeps(prog), [prog]);
	const origLevels = useMemo(() => arcLevels(origDeps), [origDeps]);
	const [focus, setFocus] = useState<number | null>(null); // index into origDeps
	const last = snaps.length - 1;
	const stepper = useStepper(last, { intervalMs: 1800 });
	const step = Math.min(stepper.step, last);
	const snap = snaps[step];
	const arch = Object.keys(snaps[0].map);
	const phys = Array.from({ length: physRegs }, (_, i) => `p${i + 1}`);
	const finalRenamed = snaps[last].renamed as Insn[];

	// Dependences among the instructions fully renamed so far, in the renamed code.
	const doneCount = snap.renamed.filter((r) => r && r.dest !== '?').length;
	const renDeps = useMemo(() => findDeps(snap.renamed.slice(0, doneCount) as Insn[]), [snap, doneCount]);
	const renLevels = useMemo(() => arcLevels(renDeps), [renDeps]);

	const focused = focus !== null ? origDeps[focus] : null;
	const isResolved = (d: Dep) => snap.cur > d.to || (snap.cur === d.to && snap.phase === 'alloc');

	// Is operand k (or the destination, k = -1) of instruction i an end of the focused dependence?
	const roleHit = (i: number, k: number) => {
		if (!focused) return false;
		const roles = focused.kind === 'RAW' ? ['dest', 'src'] : focused.kind === 'WAR' ? ['src', 'dest'] : ['dest', 'dest'];
		const role = i === focused.from ? roles[0] : i === focused.to ? roles[1] : null;
		if (!role) return false;
		return role === 'dest' ? k === -1 && prog[i].dest === focused.reg : k >= 0 && prog[i].srcs[k] === focused.reg;
	};

	const insnText = (insn: Insn | null, i: number, x: number, renamedCol: boolean) => {
		const y = rowY(i);
		if (!insn)
			return (
				<text className={s.placeholder} x={x} y={y}>
					not renamed yet
				</text>
			);
		const opClass = (k: number) => {
			if (roleHit(i, k)) return s[`hl${focused!.kind}`];
			if (renamedCol && i === snap.cur) {
				if (k >= 0 && isReg(prog[i].srcs[k])) return s.hlLookup;
				if (k === -1 && snap.phase === 'alloc') return s.hlAlloc;
			}
			return undefined;
		};
		return (
			<text className={s.code} x={x} y={y}>
				<tspan className={s.op}>{insn.op}</tspan>{' '}
				{insn.srcs.map((v, k) => (
					<tspan key={k}>
						<tspan className={opClass(k)}>{v}</tspan>
						{k < insn.srcs.length - 1 ? ',' : ''}
					</tspan>
				))}
				<tspan className={s.arrowGlyph}> → </tspan>
				<tspan className={insn.dest === '?' ? s.placeholder : opClass(-1)}>{insn.dest}</tspan>
			</text>
		);
	};

	const arc = (d: Dep, level: number, x: number, key: string, onPick?: () => void, dim = false) => {
		const y0 = rowY(d.from) - 4;
		const y1 = rowY(d.to) - 4;
		const dx = 14 + level * 9;
		const path = `M${x},${y0} C${x - dx},${y0} ${x - dx},${y1} ${x - 2},${y1}`;
		return (
			<g
				key={key}
				className={`${s.arc} ${s[`arc${d.kind}`]} ${dim ? s.arcDim : ''} ${onPick ? s.arcPick : ''}`}
				onMouseEnter={onPick}
				onClick={onPick}
			>
				<path className={s.arcHit} d={path} />
				<path className={s.arcLine} d={path} markerEnd={`url(#rn-${d.kind})`} />
			</g>
		);
	};

	const explain = (d: Dep) => {
		const a = prog[d.from];
		const what =
			d.kind === 'RAW'
				? `I${d.to + 1} reads ${d.reg}, which I${d.from + 1} writes`
				: d.kind === 'WAR'
					? `I${d.from + 1} reads ${d.reg}, then I${d.to + 1} overwrites it`
					: `I${d.from + 1} and I${d.to + 1} both write ${d.reg}`;
		if (!isResolved(d)) return `${d.kind} on ${d.reg} (${KIND_NAME[d.kind]}): ${what}. Step forward until I${d.to + 1} is renamed.`;
		const ra = finalRenamed[d.from];
		const rb = finalRenamed[d.to];
		if (d.kind === 'RAW')
			return `${d.kind} on ${d.reg}: ${what}. Still there after renaming: I${d.to + 1} reads ${ra.dest}, the register I${d.from + 1} writes. A real value passes between them, so it can't be renamed away.`;
		if (d.kind === 'WAR') {
			const read = ra.srcs[a.srcs.indexOf(d.reg)];
			return `${d.kind} on ${d.reg}: ${what}. After renaming, I${d.from + 1} reads ${read} but I${d.to + 1} writes ${rb.dest}, a different register. Gone.`;
		}
		return `${d.kind} on ${d.reg}: ${what}. After renaming, I${d.from + 1} writes ${ra.dest} and I${d.to + 1} writes ${rb.dest}, different registers. Gone.`;
	};

	const counts = (deps: Dep[]) =>
		(['RAW', 'WAR', 'WAW'] as const)
			.map((k) => [k, deps.filter((d) => d.kind === k).length] as const)
			.filter(([, n]) => n > 0)
			.map(([k, n]) => `${n} ${k}`)
			.join(' · ') || 'none yet';

	const stale = (p: string) => Boolean(snap.holder[p]) && !Object.values(snap.map).includes(p);

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`step ${step} / ${last}`} />

			<p className={s.message}>
				{snap.phase !== 'init' && (
					<span className={`${s.phaseTag} ${snap.phase === 'lookup' ? s.tagLookup : s.tagAlloc}`}>
						{snap.phase === 'lookup' ? 'read sources' : 'allocate dest'}
					</span>
				)}
				{snap.message}
			</p>

			<svg
				className={s.svg}
				viewBox={`0 0 ${W} ${LIST_Y + (prog.length - 1) * ROW_H + 14}`}
				role="img"
				aria-label="Register renaming: names point into physical registers"
			>
				<defs>
					<marker id="rn-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
						<path d="M0,0 L10,5 L0,10 z" className={s.headDefault} />
					</marker>
					{(['RAW', 'WAR', 'WAW'] as const).map((k) => (
						<marker key={k} id={`rn-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
							<path d="M0,0 L10,5 L0,10 z" className={s[`head${k}`]} />
						</marker>
					))}
				</defs>

				{/* Section labels */}
				<text className={s.section} x={PX0 - BOX_W / 2} y={NAME_Y - 12}>
					names <tspan className={s.sectionSub}>· the arrows are the map table</tspan>
				</text>
				<text className={s.section} x={PX0 - BOX_W / 2} y={PHYS_Y + PHYS_H + 40}>
					physical registers <tspan className={s.sectionSub}>· where values actually live</tspan>
				</text>

				{/* Map table arrows */}
				{arch.map((r) => (
					<MapArrow
						key={r}
						from={nameX(r)}
						to={physX(snap.map[r])}
						cls={[s.mapArrow, snap.lookedUp.includes(r) && s.mapLookup, snap.changed === r && s.mapAlloc].filter(Boolean).join(' ')}
					/>
				))}

				{/* Name tags */}
				{arch.map((r) => (
					<g key={r} className={[s.name, snap.lookedUp.includes(r) && s.nameLookup, snap.changed === r && s.nameAlloc].filter(Boolean).join(' ')}>
						<rect x={nameX(r) - BOX_W / 2} y={NAME_Y} width={BOX_W} height={NAME_H} rx={15} />
						<text x={nameX(r)} y={NAME_Y + 20} textAnchor="middle">
							{r}
						</text>
					</g>
				))}

				{/* Physical registers */}
				{phys.map((p) => {
					const isFree = snap.free.includes(p);
					const isNext = snap.free[0] === p;
					const lookup = snap.lookedUp.some((r) => snap.map[r] === p);
					const alloc = snap.changed !== null && snap.map[snap.changed] === p;
					const cls = [s.phys, isFree && s.physFree, isNext && s.physNext, lookup && s.physLookup, alloc && s.physAlloc, stale(p) && s.physStale]
						.filter(Boolean)
						.join(' ');
					return (
						<g key={p} className={cls}>
							<rect x={physX(p) - BOX_W / 2} y={PHYS_Y} width={BOX_W} height={PHYS_H} rx={6} />
							<text className={s.physName} x={physX(p)} y={PHYS_Y + 22} textAnchor="middle">
								{p}
							</text>
							<text className={s.physHolder} x={physX(p)} y={PHYS_Y + PHYS_H + 14} textAnchor="middle">
								{isNext ? 'next free' : isFree ? 'free' : snap.holder[p]}
							</text>
						</g>
					);
				})}

				{/* Program listings with dependence arcs */}
				<text className={s.section} x={ORIG_X - 80} y={LIST_Y - 36}>
					original <tspan className={s.sectionSub}>· {counts(origDeps)}</tspan>
				</text>
				<text className={s.section} x={REN_X - 80} y={LIST_Y - 36}>
					renamed <tspan className={s.sectionSub}>· {counts(renDeps)}</tspan>
				</text>

				{snap.cur >= 0 && (
					<>
						<rect className={s.curRow} x={ORIG_X - 6} y={rowY(snap.cur) - 18} width={COL_W} height={25} rx={5} />
						<rect className={s.curRow} x={REN_X - 6} y={rowY(snap.cur) - 18} width={COL_W} height={25} rx={5} />
					</>
				)}

				{prog.map((insn, i) => (
					<g key={i}>
						<text className={s.idx} x={ORIG_X + COL_W - 12} y={rowY(i)} textAnchor="end">
							I{i + 1}
						</text>
						{insnText(insn, i, ORIG_X, false)}
						<text className={s.idx} x={REN_X + COL_W - 12} y={rowY(i)} textAnchor="end">
							I{i + 1}
						</text>
						{insnText(snap.renamed[i], i, REN_X, true)}
					</g>
				))}

				{origDeps.map((d, k) => arc(d, origLevels[k], ORIG_X - 8, `o${k}`, () => setFocus(k), focus !== null && focus !== k))}
				{renDeps.map((d, k) => arc(d, renLevels[k], REN_X - 8, `r${k}`))}
			</svg>

			<div className={s.legend}>
				<span className={s.lgRAW}>RAW · true</span>
				<span className={s.lgWAR}>WAR · anti</span>
				<span className={s.lgWAW}>WAW · output</span>
			</div>
			<p className={s.detail}>
				{focused ? explain(focused) : 'Hover or tap an arc on the original code to see what renaming does to that dependence.'}
			</p>
		</div>
	);
}
