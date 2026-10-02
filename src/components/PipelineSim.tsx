// Step-through animation of programs running on the simplified 5-stage pipeline.
// Pair it with <PipelineDiagram> using the same syncId (and the same program/config props) to keep
// both on the same cycle.
import { useMemo } from 'react';
import PipelineDrawing, { type DrawFrame, type Part, type Wire } from './PipelineDrawing';
import { StepControls, useSharedValue, useStepper } from './StepControls';
import { occupancyTable, schedule, STAGES, type Bypass, type PipeConfig, type Schedule, type Stage } from './pipeline5';
import s from './PipelineSim.module.css';

export interface PipelineNote {
	cycle: number;
	text: string;
	/** Draw this bypass path carrying a value that must not be used, with an optional value label. */
	bypass?: Bypass;
	tag?: string;
}

interface Props {
	program: string[];
	hazard?: PipeConfig['hazard'];
	bypass?: Bypass[];
	regs?: Record<string, number>;
	mem?: Record<number, number>;
	/** Registers to show inside the register file. */
	watch?: string[];
	syncId?: string;
	/** Show a toggle between no hazard detection and stalling (shared through syncId). */
	hazardToggle?: boolean;
	notes?: PipelineNote[];
}

interface Msg {
	stage: Stage;
	who: string;
	text: string;
	tone?: 'bad' | 'good' | 'muted';
}

const OP_SYMBOL: Record<string, string> = { add: '+', sub: '−', and: '&', or: '|', xor: '^', mul: '×' };

const HAZARD_LABEL = { none: 'No hazard detection', stall: 'Stall on RAW' } as const;

export function useHazard(syncId: string | undefined, initial: PipeConfig['hazard']) {
	return useSharedValue<PipeConfig['hazard']>(`${syncId ?? 'local'}:hazard`, initial);
}

export function HazardToggle({ value, onChange }: { value: PipeConfig['hazard']; onChange: (v: PipeConfig['hazard']) => void }) {
	return (
		<div className={s.toggle} role="group" aria-label="Hazard handling">
			{(['none', 'stall'] as const).map((h) => (
				<button key={h} className={value === h ? 'viz-primary' : undefined} onClick={() => onChange(h)}>
					{HAZARD_LABEL[h]}
				</button>
			))}
		</div>
	);
}

function buildFrame(sch: Schedule, cycle: number, occ: ReturnType<typeof occupancyTable>, watch: string[], notes: PipelineNote[]) {
	const { program, timings, config } = sch;
	const f: Required<Pick<DrawFrame, 'chips' | 'active' | 'bad' | 'good' | 'flows' | 'badFlows' | 'tags'>> & DrawFrame = {
		chips: {},
		active: [],
		bad: [],
		good: [],
		flows: [],
		badFlows: [],
		tags: {},
	};
	const msgs: Msg[] = [];
	const lit = (...ids: (Wire | Part)[]) => f.active.push(...ids);
	const name = (j: number) => program[j].op;

	for (const st of STAGES) {
		const slot = occ[cycle]?.[st] ?? null;
		if (slot === null) {
			msgs.push({ stage: st, who: '', text: 'empty', tone: 'muted' });
			continue;
		}
		if (slot === 'bubble') {
			f.chips[st] = { text: 'bubble', tone: 'bubble' };
			msgs.push({ stage: st, who: 'bubble', text: 'nothing to do: a bubble left behind by the stall', tone: 'muted' });
			continue;
		}
		const j = slot;
		const t = timings[j];
		const insn = program[j];
		f.chips[st] = { text: insn.text };

		if (st === 'F') {
			if (cycle < t.F) {
				f.chips[st] = { text: insn.text, tone: 'stalled' };
				msgs.push({ stage: st, who: insn.text, text: 'stuck in F (p*): the instruction ahead of it is stalled in D', tone: 'bad' });
			} else {
				lit('pc-ic', 'ic', 'ic-fd', 'pc-add', 'add4', 'add-pc');
				msgs.push({ stage: st, who: insn.text, text: 'fetch the instruction from I$ at PC, and set PC to PC + 4' });
			}
		}

		if (st === 'D') {
			lit('fd-dx');
			if (cycle < t.D) {
				f.chips[st] = { text: insn.text, tone: 'waiting' };
				const waiting = t.operands.filter((o) => o.producer !== null && timings[o.producer].W > cycle);
				const what = waiting.map((o) => `${o.reg} from ${name(o.producer!)}`).join(' and ');
				msgs.push({ stage: st, who: insn.text, text: `stalled (d*): waiting for ${what}`, tone: 'bad' });
			} else {
				const parts: string[] = [];
				const tones: Msg['tone'][] = [];
				t.operands.forEach((o, k) => {
					const wire: Wire = k === 0 ? 'rf-a' : 'rf-b';
					const from = o.producer !== null ? name(o.producer) : '';
					if (o.source === 'stale') {
						f.bad.push(wire, 'rf');
						parts.push(`reads ${o.reg} = ${o.value}, a stale value: ${from} hasn't written ${o.reg} yet (it should be ${o.correct})`);
						tones.push('bad');
					} else if (o.source === 'internal') {
						f.good.push(wire, 'rf', 'wb');
						parts.push(`reads ${o.reg} = ${o.value}: ${from} writes it this same cycle (internal forwarding)`);
						tones.push('good');
					} else if (o.source === 'regfile') {
						lit(wire, 'rf');
						parts.push(`reads ${o.reg} = ${o.value}`);
					} else {
						lit(wire, 'rf');
						parts.push(`reads ${o.reg}, but it isn't written yet; the ${o.source} bypass will supply it later`);
					}
				});
				msgs.push({
					stage: st,
					who: insn.text,
					text: parts.length ? `decode; ${parts.join('; ')}` : 'decode',
					tone: tones.includes('bad') ? 'bad' : tones.includes('good') ? 'good' : undefined,
				});
			}
		}

		if (st === 'X') {
			lit('dx-a', 'dx-b', 'alu', 'alu-xm', 'dx-xm');
			if (insn.kind === 'store') lit('dx-data');
			const viaBypass = t.operands.filter((o) => o.role === 'x' && (o.source === 'MX' || o.source === 'WX'));
			for (const o of viaBypass) {
				f.flows.push(o.source as Bypass);
				f.tags[o.source as Bypass] = `${o.reg} = ${o.value}`;
			}
			const via = viaBypass.map((o) => ` (${o.reg} arrives by the ${o.source} bypass)`).join('');
			let text: string;
			if (insn.kind === 'alu') {
				const vals = insn.operands.map((x) => {
					const o = t.operands.find((p) => p.reg === x);
					return o ? `${o.value}` : x;
				});
				text = `ALU: ${vals.join(` ${OP_SYMBOL[insn.op.replace(/i$/, '')] ?? '+'} `)} = ${t.xValue}`;
			} else {
				const b = t.operands.find((o) => o.reg === insn.base)!;
				text = `ALU computes the address: ${insn.imm} + ${insn.base} (${b.value}) = ${t.xValue}`;
			}
			const wrong = t.xValue !== t.xCorrect;
			msgs.push({ stage: st, who: insn.text, text: text + via + (wrong ? ` (wrong: should be ${t.xCorrect})` : ''), tone: wrong ? 'bad' : undefined });
			if (wrong) f.bad.push('alu');
		}

		if (st === 'M') {
			lit('xm-mw');
			if (insn.kind === 'load') {
				lit('xm-addr', 'dc', 'dc-mux', 'wbmux', 'mux-mw');
				const wrong = t.xValue !== t.xCorrect;
				msgs.push({
					stage: st,
					who: insn.text,
					text: `read D$[${t.xValue}] = ${t.result}${wrong ? ` (wrong address: should be D$[${t.xCorrect}])` : ''}`,
					tone: wrong ? 'bad' : undefined,
				});
			} else if (insn.kind === 'store') {
				lit('xm-addr', 'xm-data', 'dc');
				const d = t.operands.find((o) => o.role === 'm')!;
				if (d.source === 'WM') {
					f.flows.push('WM');
					f.tags.WM = `${d.reg} = ${d.value}`;
				}
				msgs.push({
					stage: st,
					who: insn.text,
					text: `write ${d.reg} = ${d.value} to D$[${t.xValue}]${d.source === 'WM' ? ` (${d.reg} arrives by the WM bypass)` : ''}`,
				});
			} else {
				lit('xm-mux', 'wbmux', 'mux-mw');
				msgs.push({ stage: st, who: insn.text, text: 'nothing to do in M; the ALU result just passes through' });
			}
		}

		if (st === 'W') {
			if (insn.dest) {
				const wrong = t.result !== t.resultCorrect;
				(wrong ? f.bad : f.good).push('wb', 'rf');
				msgs.push({
					stage: st,
					who: insn.text,
					text: `write ${t.result} to ${insn.dest} in the register file${wrong ? ` (wrong: should be ${t.resultCorrect})` : ''}`,
					tone: wrong ? 'bad' : 'good',
				});
			} else msgs.push({ stage: st, who: insn.text, text: 'nothing to write back', tone: 'muted' });
		}
	}

	// Register file contents during this cycle (a write in this cycle is already visible).
	f.regs = watch.map((r) => {
		let value = config.regs?.[r] ?? 0;
		let writtenNow = false;
		timings.forEach((t, j) => {
			if (program[j].dest === r && t.W <= cycle && t.result !== null) {
				value = t.result;
				writtenNow = t.W === cycle;
			}
		});
		return { name: r, value: String(value), tone: writtenNow ? 'good' : null };
	});

	const extra = notes.filter((n) => n.cycle === cycle);
	for (const n of extra) {
		if (n.bypass) {
			f.badFlows.push(n.bypass);
			if (!f.flows.includes(n.bypass)) f.flows.push(n.bypass);
			if (n.tag) f.tags[n.bypass] = n.tag;
		}
	}
	return { frame: f, msgs, extra };
}

export default function PipelineSim({
	program,
	hazard: initialHazard = 'stall',
	bypass = [],
	regs,
	mem,
	watch = [],
	syncId,
	hazardToggle = false,
	notes = [],
}: Props) {
	const [hazard, setHazard] = useHazard(syncId, initialHazard);
	const sch = useMemo(
		() => schedule(program, { hazard, bypass: Object.fromEntries(bypass.map((b) => [b, true])), regs, mem }),
		[program.join('|'), hazard, bypass.join('|'), JSON.stringify(regs), JSON.stringify(mem)],
	);
	const occ = useMemo(() => occupancyTable(sch), [sch]);
	const stepper = useStepper(sch.cycles - 1, { intervalMs: 1400, syncId });
	const cycle = stepper.step + 1;
	const { frame, msgs, extra } = buildFrame(sch, cycle, occ, watch, notes);

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`cycle ${cycle}`}>
				{hazardToggle ? (
					<HazardToggle
						value={hazard}
						onChange={(h) => {
							setHazard(h);
							stepper.reset();
						}}
					/>
				) : undefined}
			</StepControls>

			<div className={s.drawing}>
				<PipelineDrawing frame={frame} bypass={bypass} />
			</div>

			{extra.map((n) => (
				<p key={n.text} className={s.note}>
					{n.text}
				</p>
			))}

			<table className={s.msgs}>
				<tbody>
					{msgs.map((m) => (
						<tr key={m.stage} className={m.tone ? s[m.tone] : undefined}>
							<th>{m.stage}</th>
							<td className={s.who}>{m.who}</td>
							<td>{m.text}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
