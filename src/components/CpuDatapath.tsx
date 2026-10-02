// One datapath drawing, three ways of running it:
// - single:    the whole instruction happens in one long clock cycle (stepped through the 5 loop steps)
// - multi:     one stage per cycle, with IR / A / B / O / D registers holding values between cycles
// - pipelined: those registers become full pipeline registers (F/D, D/X, X/M, M/W) and every stage
//              works on a different instruction
import { useMemo } from 'react';
import { StepControls, useStepper } from './StepControls';
import { occupancyTable, schedule, STAGES, type Stage } from './pipeline5';
import s from './CpuDatapath.module.css';

type Variant = 'single' | 'multi' | 'pipelined';
type Id =
	| 'pc'
	| 'add4'
	| 'ic'
	| 'rf'
	| 'immmux'
	| 'alu'
	| 'dc'
	| 'wbmux'
	| 'ctl'
	| 'IR'
	| 'A'
	| 'B'
	| 'O'
	| 'D'
	| 'pc-ic'
	| 'pc-add'
	| 'add-pc'
	| 'ic-ir'
	| 'ir-rf'
	| 'ir-imm'
	| 'ir-ctl'
	| 'rf-a'
	| 'rf-b'
	| 'a-alu'
	| 'b-mux'
	| 'mux-alu'
	| 'b-dc'
	| 'alu-o'
	| 'o-dc'
	| 'o-wb'
	| 'dc-d'
	| 'd-mux'
	| 'wb'
	| 'ctl-lines';

const REGION: Record<Stage, [number, number]> = { F: [0, 138], D: [152, 290], X: [304, 410], M: [424, 540], W: [554, 640] };
const STAGE_NAME: Record<Stage, string> = { F: 'Fetch', D: 'Decode', X: 'Execute', M: 'Memory', W: 'Writeback' };

const WIRES: Partial<Record<Id, string>> = {
	'pc-ic': 'M38,195 H56',
	'pc-add': 'M46,195 V108 H56',
	'add-pc': 'M96,108 H110 V70 H12 V170 H22',
	'ic-ir': 'M120,195 H138',
	'ir-rf': 'M152,195 H168',
	'ir-imm': 'M145,208 V264 H317 V242',
	'ir-ctl': 'M160,195 V312 H168',
	'rf-a': 'M272,172 H290',
	'rf-b': 'M272,218 H290',
	'a-alu': 'M304,172 H334',
	'b-mux': 'M304,218 H312',
	'mux-alu': 'M322,218 H334',
	'b-dc': 'M308,218 V278 H436 V230 H450',
	'alu-o': 'M384,200 H410',
	'o-dc': 'M424,200 H450',
	'o-wb': 'M432,200 V146 H572 V172',
	'dc-d': 'M520,220 H540',
	'd-mux': 'M554,220 H566',
	wb: 'M578,208 H600 V130 H220 V150',
};
// Without the IR register (single-cycle), the instruction goes straight from I$ to the register file.
const SINGLE_WIRES: Partial<Record<Id, string>> = {
	'ic-ir': 'M120,195 H168',
	'ir-imm': 'M130,195 V264 H317 V242',
	'ir-ctl': 'M158,195 V312 H168',
	'a-alu': 'M272,172 H334',
	'b-mux': 'M272,218 H312',
	'b-dc': 'M300,218 V278 H436 V230 H450',
	'alu-o': 'M384,200 H450',
	'dc-d': 'M520,220 H566',
};

// Example instruction for the single/multi-cycle walkthroughs.
const EX = { pc: 100, r3: 200, imm: 4, addr: 204, data: 42, text: 'lw #4(r3) → r1' };

interface StepInfo {
	stages: Stage[];
	lit: Id[];
	title: string;
	text: string;
	writes?: Partial<Record<'IR' | 'A' | 'B' | 'O' | 'D' | 'PC' | 'r1', string>>;
}

const SINGLE_STEPS: StepInfo[] = [
	{ stages: [], lit: [], title: 'Ready', text: `The next instruction is ${EX.text}, at PC = ${EX.pc}. All five steps below happen in one clock cycle.` },
	{ stages: ['F'], lit: ['pc', 'pc-ic', 'ic', 'ic-ir'], title: '1. Fetch', text: `Fetch the instruction at PC = ${EX.pc} from the instruction cache: ${EX.text}.` },
	{
		stages: ['D'],
		lit: ['ir-rf', 'rf', 'rf-a', 'ir-imm', 'ir-ctl', 'ctl', 'ctl-lines'],
		title: '2. Decode and read inputs',
		text: `Control decodes the opcode (a load) and sets every control signal. The register file reads r3 = ${EX.r3}; the immediate ${EX.imm} comes from the instruction.`,
	},
	{
		stages: ['X', 'M'],
		lit: ['a-alu', 'ir-imm', 'immmux', 'mux-alu', 'alu', 'alu-o', 'o-dc', 'dc'],
		title: '3. Execute',
		text: `The ALU adds r3 + ${EX.imm} = ${EX.addr}, the effective address, and the data cache reads memory there: ${EX.data}.`,
	},
	{ stages: ['W'], lit: ['dc-d', 'd-mux', 'wbmux', 'wb', 'rf'], title: '4. Write the output', text: `The loaded value ${EX.data} is written to r1 in the register file.`, writes: { r1: `${EX.data}` } },
	{
		stages: ['F'],
		lit: ['pc-add', 'add4', 'add-pc', 'pc'],
		title: '5. Increment the PC',
		text: `PC + 4 = ${EX.pc + 4} is written into the PC at the end of the cycle, ready for the next instruction.`,
		writes: { PC: `${EX.pc + 4}` },
	},
];

const MULTI_STEPS: StepInfo[] = [
	{ stages: [], lit: [], title: 'Ready', text: `The next instruction is ${EX.text}, at PC = ${EX.pc}. Each stage now takes its own clock cycle.` },
	{
		stages: ['F'],
		lit: ['pc', 'pc-ic', 'ic', 'ic-ir', 'IR', 'pc-add', 'add4', 'add-pc'],
		title: 'Cycle 1: Fetch',
		text: `IR = mem[PC]: the instruction is latched into IR. PC = PC + 4 = ${EX.pc + 4}.`,
		writes: { IR: 'lw #4(r3)→r1', PC: `${EX.pc + 4}` },
	},
	{
		stages: ['D'],
		lit: ['IR', 'ir-rf', 'rf', 'rf-a', 'rf-b', 'A', 'B', 'ir-ctl', 'ctl', 'ctl-lines'],
		title: 'Cycle 2: Decode',
		text: `A = reg[s1] = r3 = ${EX.r3}, B = reg[s2]. Control decodes the opcode from IR.`,
		writes: { A: `${EX.r3}`, B: 'reg[s2]' },
	},
	{
		stages: ['X'],
		lit: ['A', 'a-alu', 'ir-imm', 'immmux', 'mux-alu', 'alu', 'alu-o', 'O'],
		title: 'Cycle 3: Execute',
		text: `O = A + Imm = ${EX.r3} + ${EX.imm} = ${EX.addr}, the effective address.`,
		writes: { O: `${EX.addr}` },
	},
	{ stages: ['M'], lit: ['O', 'o-dc', 'dc', 'dc-d', 'D'], title: 'Cycle 4: Memory', text: `D = mem[O] = mem[${EX.addr}] = ${EX.data}.`, writes: { D: `${EX.data}` } },
	{ stages: ['W'], lit: ['D', 'd-mux', 'wbmux', 'wb', 'rf'], title: 'Cycle 5: Writeback', text: `reg[d] = D: r1 = ${EX.data}.`, writes: { r1: `${EX.data}` } },
];

const PIPE_PROGRAM = ['add r1, r2 -> r3', 'lw #0(r5) -> r4', 'sw r6 -> #4(r7)', 'sub r8, r9 -> r10', 'or r11, r12 -> r13'];
// Pipeline register fields, drawn inside each bar (y positions line up with the wires they carry).
const FIELDS: Record<'IR' | 'A' | 'O' | 'D', { label: string; x: number; fields: [string, number][] }> = {
	IR: { label: 'F/D', x: 145, fields: [['PC', 80], ['I', 280]] },
	A: { label: 'D/X', x: 297, fields: [['PC', 80], ['A', 172], ['B', 218], ['I', 280]] },
	O: { label: 'X/M', x: 417, fields: [['O', 200], ['B', 250], ['I', 280]] },
	D: { label: 'M/W', x: 547, fields: [['O', 160], ['D', 220], ['I', 280]] },
};

export default function CpuDatapath({ variant = 'single' }: { variant?: Variant }) {
	const pipe = useMemo(() => (variant === 'pipelined' ? schedule(PIPE_PROGRAM, { hazard: 'stall' }) : null), [variant]);
	const occ = useMemo(() => (pipe ? occupancyTable(pipe) : null), [pipe]);
	const steps = variant === 'single' ? SINGLE_STEPS : MULTI_STEPS;
	const last = pipe ? pipe.cycles : steps.length - 1;
	const stepper = useStepper(last, { intervalMs: variant === 'pipelined' ? 1200 : 1800 });
	const k = stepper.step;

	// What's lit and what each stage is working on.
	let lit = new Set<Id>();
	let activeStages = new Set<Stage>();
	let stageOwner: Partial<Record<Stage, string>> = {};
	let title = '';
	let text = '';
	const shown: Record<string, string> = {};
	const fresh = new Set<string>();

	if (pipe && occ) {
		title = k === 0 ? 'Ready' : `Cycle ${k}`;
		if (k > 0) {
			for (const st of STAGES) {
				const slot = occ[k][st];
				if (typeof slot === 'number') {
					activeStages.add(st);
					stageOwner[st] = pipe.program[slot].text;
				}
			}
			const n = activeStages.size;
			text = `${n} instruction${n === 1 ? ' is' : 's are'} in flight. Each pipeline register holds the PC, IR, A, B, O and D values of the instruction in the stage just after it.`;
		} else text = 'Instructions enter one per cycle. Step through to fill the pipeline.';
	} else {
		const info = steps[k];
		lit = new Set(info.lit);
		activeStages = new Set(info.stages);
		title = info.title;
		text = info.text;
		// Values held so far (multi-cycle registers; PC and r1 in both).
		for (let i = 1; i <= k; i++) Object.assign(shown, steps[i].writes ?? {});
		for (const key of Object.keys(info.writes ?? {})) fresh.add(key);
	}

	const on = (id: Id) => (lit.has(id) ? s.lit : '');
	const wire = (id: Id) => (variant === 'single' && SINGLE_WIRES[id]) || WIRES[id];
	const showLatches = variant === 'multi';
	const showBars = variant === 'pipelined';
	const pcValue = variant === 'pipelined' ? null : shown.PC ?? `${EX.pc}`;

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls
				stepper={stepper}
				counter={variant === 'single' ? (k === 0 ? 'step 0 / 5' : `step ${k} / 5 · cycle 1`) : variant === 'multi' ? `cycle ${k}` : `cycle ${k}`}
			/>
			<p className={s.message}>
				<b>{title}.</b> {text}
			</p>

			<div className={s.scroll}>
				<svg className={s.svg} viewBox="0 0 640 340" role="img" aria-label={`${variant}-cycle datapath`}>
					<defs>
						<marker id={`cd-arrow-${variant}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
							<path d="M0,0 L10,5 L0,10 z" className={s.head} />
						</marker>
					</defs>

					{/* Stage regions */}
					{STAGES.map((st) => {
						const [x0, x1] = REGION[st];
						const active = activeStages.has(st);
						return (
							<g key={st}>
								<rect className={`${s.region} ${active ? s.regionOn : ''}`} x={x0} y={22} width={x1 - x0} height={268} rx={6} />
								<text className={`${s.regionLabel} ${active ? s.regionLabelOn : ''}`} x={(x0 + x1) / 2} y={14} textAnchor="middle">
									{variant === 'single' ? STAGE_NAME[st] : `${st} · ${STAGE_NAME[st]}`}
								</text>
								{stageOwner[st] && (
									<text className={s.owner} x={(x0 + x1) / 2} y={36} textAnchor="middle">
										{stageOwner[st]!.split(' → ').map((part, i) => (
											<tspan key={i} x={(x0 + x1) / 2} dy={i === 0 ? 0 : 11}>
												{i === 0 ? part : `→ ${part}`}
											</tspan>
										))}
									</text>
								)}
							</g>
						);
					})}
					{variant === 'single' && (
						<g>
							<rect className={s.clock} x={0} y={326} width={640} height={8} rx={4} />
							<rect className={s.clockFill} x={0} y={326} width={(640 * k) / 5} height={8} rx={4} />
						</g>
					)}

					{/* Wires */}
					{(Object.keys(WIRES) as Id[])
						.filter((id) => !(variant === 'single' && id === 'ir-rf'))
						.filter((id) => !(variant === 'pipelined' && id === 'ir-ctl'))
						.map((id) => (
							<path key={id} className={`${s.wire} ${on(id)}`} d={wire(id)} markerEnd={id === 'wb' || id === 'add-pc' ? `url(#cd-arrow-${variant})` : undefined} />
						))}

					{/* Control unit (single/multi-cycle) */}
					{variant !== 'pipelined' && (
						<g>
							{[220, 317, 359, 485, 572].map((x) => (
								<line key={x} className={`${s.ctlLine} ${on('ctl-lines')}`} x1={x} y1={300} x2={x} y2={x === 317 ? 242 : x === 359 ? 238 : 244} />
							))}
							<rect className={`${s.ctl} ${on('ctl')}`} x={168} y={300} width={410} height={22} rx={4} />
							<text className={s.ctlLabel} x={373} y={315} textAnchor="middle">Control</text>
						</g>
					)}

					{/* Components */}
					<rect className={`${s.latch} ${on('pc')} ${fresh.has('PC') ? s.fresh : ''}`} x={22} y={150} width={16} height={90} rx={2} />
					<text className={s.latchLabel} x={30} y={198} textAnchor="middle">PC</text>
					{pcValue && <text className={`${s.value} ${fresh.has('PC') ? s.valueFresh : ''}`} x={30} y={256} textAnchor="middle">{pcValue}</text>}

					<rect className={`${s.part} ${on('add4')}`} x={56} y={92} width={40} height={32} rx={3} />
					<text className={s.partLabel} x={76} y={113} textAnchor="middle">+4</text>
					<rect className={`${s.part} ${on('ic')}`} x={56} y={150} width={64} height={90} rx={3} />
					<text className={s.partLabelBig} x={88} y={201} textAnchor="middle">I$</text>

					<rect className={`${s.part} ${on('rf')} ${fresh.has('r1') ? s.partFresh : ''}`} x={168} y={150} width={104} height={94} rx={3} />
					<text className={s.partLabel} x={220} y={186} textAnchor="middle">Register</text>
					<text className={s.partLabel} x={220} y={202} textAnchor="middle">File</text>
					<text className={s.port} x={220} y={236} textAnchor="middle">s1  s2  d</text>
					{shown.r1 && <text className={`${s.value} ${fresh.has('r1') ? s.valueFresh : ''}`} x={220} y={222} textAnchor="middle">r1 = {shown.r1}</text>}

					<rect className={`${s.part} ${on('immmux')}`} x={312} y={196} width={10} height={46} rx={5} />
					<polygon className={`${s.part} ${on('alu')}`} points="334,150 384,172 384,228 334,250 334,212 344,200 334,188" />
					<text className={s.partLabel} x={364} y={205} textAnchor="middle">ALU</text>

					<rect className={`${s.part} ${on('dc')}`} x={450} y={160} width={70} height={84} rx={3} />
					<text className={s.partLabelBig} x={485} y={208} textAnchor="middle">D$</text>
					<rect className={`${s.part} ${on('wbmux')}`} x={566} y={172} width={12} height={72} rx={6} />

					{/* Multi-cycle: small registers between the stages */}
					{showLatches &&
						(
							[
								['IR', 138, 172, 36],
								['A', 290, 158, 28],
								['B', 290, 204, 28],
								['O', 410, 186, 28],
								['D', 540, 206, 28],
							] as const
						).map(([name, x, y, h]) => (
							<g key={name}>
								<rect className={`${s.latch} ${on(name)} ${fresh.has(name) ? s.fresh : ''}`} x={x} y={y} width={14} height={h} rx={2} />
								<text className={s.latchLabel} x={x + 7} y={y + h / 2 + 4} textAnchor="middle">
									{name === 'IR' ? 'IR' : name}
								</text>
								{shown[name] && (
									<text
										className={`${s.value} ${fresh.has(name) ? s.valueFresh : ''}`}
										x={x + 7}
										y={name === 'B' || name === 'D' ? y + h + 13 : name === 'IR' ? y - 34 : y - 6}
										textAnchor="middle"
									>
										{shown[name]}
									</text>
								)}
							</g>
						))}

					{/* Pipelined: full pipeline registers, each holding its own copy of the values */}
					{showBars &&
						Object.values(FIELDS).map((bar, i) => {
							const next = STAGES[i + 1];
							const holder = stageOwner[next];
							return (
								<g key={bar.label}>
									<rect className={`${s.bar} ${holder ? s.barOn : ''}`} x={bar.x - 9} y={56} width={18} height={236} rx={2} />
									{bar.fields.map(([f, y]) => (
										<text key={f} className={s.field} x={bar.x} y={y + 4} textAnchor="middle">
											{f}
										</text>
									))}
									<text className={s.barLabel} x={bar.x} y={308} textAnchor="middle">
										{bar.label}
									</text>
									{holder && (
										<text className={s.barHolder} x={bar.x} y={322} textAnchor="middle">
											{pipe!.program.find((p) => p.text === holder)!.op}
										</text>
									)}
								</g>
							);
						})}
				</svg>
			</div>

			{variant === 'multi' && (
				<p className={s.legend}>
					<b>IR</b> instruction register · <b>A</b>, <b>B</b> source register values · <b>O</b> ALU output · <b>D</b> data read from memory
				</p>
			)}
		</div>
	);
}
