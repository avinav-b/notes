// The simplified 5-stage pipelined datapath from lecture (PC | F/D | D/X | X/M | M/W with I$, regfile,
// ALU, D$), drawn as SVG. Purely presentational: callers say which wires are lit and what's in each stage.
import type { Bypass, Stage } from './pipeline5';
import s from './PipelineDrawing.module.css';

export type Wire =
	| 'pc-ic'
	| 'pc-add'
	| 'add-pc'
	| 'ic-fd'
	| 'fd-dx'
	| 'rf-a'
	| 'rf-b'
	| 'dx-a'
	| 'dx-b'
	| 'alu-xm'
	| 'dx-data'
	| 'dx-xm'
	| 'xm-addr'
	| 'xm-data'
	| 'dc-mux'
	| 'xm-mux'
	| 'mux-mw'
	| 'xm-mw'
	| 'wb';
export type Part = 'ic' | 'add4' | 'rf' | 'alu' | 'dc' | 'wbmux';

export interface Chip {
	text: string;
	tone?: 'normal' | 'bubble' | 'stalled' | 'waiting' | 'empty';
}

export interface DrawFrame {
	chips?: Partial<Record<Stage, Chip | null>>;
	active?: (Wire | Part)[];
	bad?: (Wire | Part)[];
	good?: (Wire | Part)[];
	/** Bypass paths carrying a value this cycle. */
	flows?: Bypass[];
	/** Bypass paths carrying a value that would be wrong to use. */
	badFlows?: Bypass[];
	/** Small value labels drawn on bypass paths. */
	tags?: Partial<Record<Bypass, string>>;
	/** Register values shown inside the register file. */
	regs?: { name: string; value: string; tone?: 'good' | 'bad' | null }[];
	/** Bypass paths emphasised in the explainer (dims everything else). */
	focus?: Bypass | null;
}

// Pipeline register (latch) x-centres, and the centre of each stage region between them.
export const LATCH = { PC: 41, FD: 181, DX: 331, XM: 481, MW: 621 };
const STAGE_X: Record<Stage, number> = { F: 111, D: 256, X: 406, M: 551, W: 682 };
const BAND = { y0: 72, y1: 222 };

const WIRES: Record<Wire, string> = {
	'pc-ic': 'M46,107 H80',
	'pc-add': 'M60,107 V170 H80',
	'add-pc': 'M130,170 H150 V206 H20 V150 H36',
	'ic-fd': 'M130,107 H176',
	'fd-dx': 'M186,107 H198 V212 H326',
	'rf-a': 'M222,52 V120 H326',
	'rf-b': 'M246,52 V160 H326',
	'dx-a': 'M336,120 H382',
	'dx-b': 'M336,160 H382',
	'alu-xm': 'M430,140 H476',
	'dx-data': 'M336,86 H476',
	'dx-xm': 'M336,212 H476',
	'xm-addr': 'M486,140 H520',
	'xm-data': 'M486,86 H501 V104 H520',
	'dc-mux': 'M570,128 H588',
	'xm-mux': 'M494,140 V160 H588',
	'mux-mw': 'M600,144 H616',
	'xm-mw': 'M486,212 H616',
	wb: 'M626,144 H700 V29 H305',
};
// With bypass muxes in front of the ALU / D$ data input, the straight wires are split around them.
const WIRES_MUXED: Partial<Record<Wire, string>> = {
	'dx-a': 'M336,120 H352 M362,120 H382',
	'dx-b': 'M336,160 H352 M362,160 H382',
	'xm-data': 'M486,86 H501 V92 M506,104 H520',
};

export const BYPASS_PATH: Record<Bypass, string> = {
	MX: 'M490,140 V64 H346 V113 H352 M346,113 V153 H352',
	WX: 'M640,144 V236 H341 V127 H352 M341,127 V167 H352',
	WM: 'M630,144 V228 H501 V116',
};
export const BYPASS_INFO: Record<Bypass, { from: string; to: string }> = {
	MX: { from: 'the start of M (output of the X/M register)', to: 'the ALU input muxes in X' },
	WX: { from: 'the start of W (output of the M/W register)', to: 'the ALU input muxes in X' },
	WM: { from: 'the start of W (output of the M/W register)', to: 'the data input mux in M' },
};
const TAG_AT: Record<Bypass, [number, number]> = { MX: [418, 58], WX: [490, 250], WM: [566, 222] };

interface Props {
	frame: DrawFrame;
	bypass?: Bypass[];
	onPickBypass?: (b: Bypass) => void;
}

export default function PipelineDrawing({ frame, bypass = [], onPickBypass }: Props) {
	const has = (list: (Wire | Part)[] | undefined, id: Wire | Part) => list?.includes(id) ?? false;
	const tone = (id: Wire | Part) => (has(frame.bad, id) ? s.bad : has(frame.good, id) ? s.good : has(frame.active, id) ? s.active : '');
	const muxedX = bypass.includes('MX') || bypass.includes('WX');
	const muxedM = bypass.includes('WM');
	const wirePath = (w: Wire) => {
		if ((w === 'dx-a' || w === 'dx-b') && muxedX) return WIRES_MUXED[w]!;
		if (w === 'xm-data' && muxedM) return WIRES_MUXED[w]!;
		return WIRES[w];
	};
	const dim = frame.focus ? s.dimmed : '';

	return (
		<svg className={s.svg} viewBox="0 0 748 300" role="img" aria-label="Five-stage pipelined datapath">
			<defs>
				<marker id="pd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
					<path d="M0,0 L10,5 L0,10 z" className={s.head} />
				</marker>
			</defs>

			<rect className={s.band} x={28} y={BAND.y0} width={680} height={BAND.y1 - BAND.y0} rx={4} />

			<g className={dim}>
				{(Object.keys(WIRES) as Wire[]).map((w) => (
					<path key={w} className={`${s.wire} ${tone(w)}`} d={wirePath(w)} markerEnd={w === 'wb' || w === 'add-pc' ? 'url(#pd-arrow)' : undefined} />
				))}

				{/* F: instruction cache and PC + 4 */}
				<rect className={`${s.part} ${tone('ic')}`} x={80} y={88} width={50} height={38} rx={3} />
				<text className={s.partLabel} x={105} y={112} textAnchor="middle">I$</text>
				<rect className={`${s.part} ${tone('add4')}`} x={80} y={152} width={50} height={36} rx={3} />
				<text className={s.partLabel} x={105} y={175} textAnchor="middle">+4</text>

				{/* D: register file (above the band, like the slides) */}
				<rect className={`${s.part} ${tone('rf')}`} x={205} y={6} width={100} height={46} rx={3} />
				<text className={s.partLabel} x={255} y={frame.regs?.length ? 22 : 34} textAnchor="middle">regfile</text>
				{frame.regs?.map((r, i) => (
					<text
						key={r.name}
						className={`${s.regValue} ${r.tone === 'good' ? s.regGood : r.tone === 'bad' ? s.regBad : ''}`}
						x={255}
						y={40 + i * 11}
						textAnchor="middle"
					>
						{r.name} = {r.value}
					</text>
				))}

				{/* X: ALU */}
				<polygon className={`${s.part} ${tone('alu')}`} points="382,100 430,118 430,162 382,180 382,148 392,140 382,132" />

				{/* M: data cache and writeback-select mux */}
				<rect className={`${s.part} ${tone('dc')}`} x={520} y={96} width={50} height={60} rx={3} />
				<text className={s.partLabel} x={545} y={131} textAnchor="middle">D$</text>
				<rect className={`${s.part} ${tone('wbmux')}`} x={588} y={118} width={12} height={52} rx={6} />
			</g>

			{/* Bypass muxes and paths */}
			{muxedX && (
				<g className={dim}>
					<rect className={s.part} x={352} y={108} width={10} height={24} rx={5} />
					<rect className={s.part} x={352} y={148} width={10} height={24} rx={5} />
				</g>
			)}
			{muxedM && <rect className={`${s.part} ${dim}`} x={496} y={92} width={10} height={24} rx={5} />}
			{bypass.map((b) => {
				const flowing = frame.flows?.includes(b);
				const wrong = frame.badFlows?.includes(b);
				const focused = frame.focus === b;
				const cls = [s.bypass, s[`bp${b}`], (flowing || focused) && s.flow, wrong && s.bypassBad, frame.focus && !focused && s.dimmed]
					.filter(Boolean)
					.join(' ');
				return (
					<g key={b} className={onPickBypass ? s.pickable : undefined} onClick={onPickBypass ? () => onPickBypass(b) : undefined}>
						<path className={s.hit} d={BYPASS_PATH[b]} />
						<path className={cls} d={BYPASS_PATH[b]} markerEnd="url(#pd-arrow)" />
					</g>
				);
			})}
			{bypass.map((b) =>
				frame.tags?.[b] ? (
					<text key={`t${b}`} className={`${s.tag} ${frame.badFlows?.includes(b) ? s.tagBad : s[`tag${b}`]}`} x={TAG_AT[b][0]} y={TAG_AT[b][1]} textAnchor="middle">
						{frame.tags[b]}
					</text>
				) : null,
			)}

			{/* Pipeline registers */}
			{(Object.entries(LATCH) as [string, number][]).map(([name, x]) => (
				<g key={name}>
					<rect className={s.latch} x={x - 5} y={BAND.y0} width={10} height={BAND.y1 - BAND.y0} />
					<text className={s.latchLabel} x={x} y={258} textAnchor="middle">
						{name === 'PC' ? 'PC' : `${name[0]}/${name[1]}`}
					</text>
				</g>
			))}

			{/* What's in each stage */}
			{(Object.keys(STAGE_X) as Stage[]).map((st) => {
				const chip = frame.chips?.[st];
				const t = chip?.tone ?? (chip ? 'normal' : 'empty');
				return (
					<g key={st} className={`${s.chip} ${s[`chip_${t}`]}`}>
						<rect x={STAGE_X[st] - 63} y={268} width={126} height={24} rx={6} />
						<text x={STAGE_X[st] - 55} y={284} className={s.chipStage}>
							{st}
						</text>
						<text x={STAGE_X[st] + 7} y={284} textAnchor="middle" className={s.chipText}>
							{chip?.text ?? ''}
						</text>
					</g>
				);
			})}
		</svg>
	);
}
