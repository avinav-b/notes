// Watch code get transformed, one optimization at a time. Each step is a small diff document:
//   {-old-}   text this optimization removes (struck out, then collapses away)
//   {+new+}   text it adds (grows in)
//   {=why=}   the text that justifies the change (highlighted in the accent colour)
// A line whose only content is removed (or added) collapses (or expands) as a whole.
// End a line with "## text" to put text in the right-hand gutter (e.g. how often the line runs);
// the gutter text may use the same markup.
// Every step gets two frames: first spot what will change, then apply it.
import { Fragment, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { StepControls, useStepper } from './StepControls';
import s from './CodeSteps.module.css';

interface Step {
	/** Optimization name, e.g. "Constant propagation". */
	label: string;
	/** Short line shown while spotting the change. */
	note?: string;
	/** Short line shown once the change is applied (defaults to note). */
	done?: string;
	code: string;
}

interface Props {
	steps: Step[];
	/** Label for the gutter column, e.g. "runs". */
	gutterLabel?: string;
}

type Kind = 'same' | 'del' | 'add' | 'focus';
interface Tok {
	kind: Kind;
	text: string;
}
interface Line {
	kind: 'same' | 'del' | 'add';
	code: Tok[];
	gutter: Tok[];
}

function parseToks(src: string): Tok[] {
	const out: Tok[] = [];
	const re = /\{([-+=])([\s\S]*?)\1\}/g;
	let at = 0;
	for (let m; (m = re.exec(src)); ) {
		if (m.index > at) out.push({ kind: 'same', text: src.slice(at, m.index) });
		out.push({ kind: m[1] === '-' ? 'del' : m[1] === '+' ? 'add' : 'focus', text: m[2] });
		at = m.index + m[0].length;
	}
	if (at < src.length) out.push({ kind: 'same', text: src.slice(at) });
	return out;
}

function parse(code: string): Line[] {
	return code
		.replace(/^\n+|\s+$/g, '')
		.split('\n')
		.map((raw) => {
			const g = raw.indexOf(' ## ');
			const codePart = g >= 0 ? raw.slice(0, g).replace(/\s+$/, '') : raw;
			const toks = parseToks(codePart);
			const gutter = g >= 0 ? parseToks(raw.slice(g + 4).trim()) : [];
			const solid = toks.filter((t) => t.text.trim() !== '');
			const kind = solid.length && solid.every((t) => t.kind === 'del') ? 'del' : solid.length && solid.every((t) => t.kind === 'add') ? 'add' : 'same';
			return { kind, code: toks, gutter };
		});
}

function Toks({ toks }: { toks: Tok[] }) {
	return (
		<>
			{toks.map((t, i) =>
				t.kind === 'same' ? (
					<Fragment key={i}>{t.text}</Fragment>
				) : (
					<span key={i} className={`${s.tok} ${s[t.kind]}`} style={{ ['--n' as string]: t.text.length }}>
						{t.text}
					</span>
				),
			)}
		</>
	);
}

export default function CodeSteps({ steps, gutterLabel }: Props) {
	const parsed = useMemo(() => steps.map((st) => parse(st.code)), [steps]);
	const last = steps.length * 2 - 1;
	const stepper = useStepper(last, { intervalMs: 1500 });
	const frame = Math.min(stepper.step, last);
	const idx = Math.floor(frame / 2);
	const applied = frame % 2 === 1;
	const step = steps[idx];
	const lines = parsed[idx];
	const hasGutter = lines.some((l) => l.gutter.length);
	const present = useMemo(() => new Set(parsed.flat().flatMap((l) => [...l.code, ...l.gutter].map((t) => t.kind))), [parsed]);
	const message = applied ? (step.done ?? step.note) : step.note;

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} speed={false} counter={`${idx + 1} / ${steps.length}`} />

			{steps.length > 1 && (
				<ol className={s.chips} aria-label="Optimizations">
					{steps.map((st, i) => (
						<li key={i} className={i === idx ? s.chipCur : i < idx ? s.chipDone : undefined}>
							{i > 0 && <ChevronRight size={13} aria-hidden="true" className={s.chev} />}
							<button className={s.chip} onClick={() => stepper.setStep(i * 2)}>
								{st.label}
							</button>
						</li>
					))}
				</ol>
			)}

			<p className={s.message}>
				{(applied || steps.length === 1) && <span className={`${s.tag} ${applied ? s.tagApply : s.tagSpot}`}>{applied ? 'applied' : step.label}</span>}
				{message}
			</p>

			<pre className={`${s.code} ${applied ? s.applied : s.spot}`} aria-label="Code">
				{hasGutter && gutterLabel && (
					<div className={`${s.line} ${s.gutterHead}`}>
						<span />
						<span className={s.gutter}>{gutterLabel}</span>
					</div>
				)}
				{lines.map((l, i) => (
					<div key={`${idx}-${i}`} className={`${s.line} ${s['line_' + l.kind] ?? ''}`}>
						<span className={s.text}>
							<Toks toks={l.code} />
							{l.code.length === 0 && ' '}
						</span>
						{hasGutter && (
							<span className={s.gutter}>
								<Toks toks={l.gutter} />
							</span>
						)}
					</div>
				))}
			</pre>

			<div className={s.legend}>
				{present.has('focus') && <span className={s.lgFocus}>why it is allowed</span>}
				{present.has('del') && <span className={s.lgDel}>removed</span>}
				{present.has('add') && <span className={s.lgAdd}>added</span>}
			</div>
		</div>
	);
}
