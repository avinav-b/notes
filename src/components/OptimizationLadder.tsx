// Step through successive versions of a function: the code (with the lines each step removed and
// added) next to a cycles-per-element bar chart, where the new version's bar slides down from the
// previous one's height. Used for the vsum journey in ECE454 program optimizations.
import { StepControls, useStepper } from './StepControls';
import s from './OptimizationLadder.module.css';

export interface LadderVersion {
	/** Function name, e.g. "vsum2". */
	name: string;
	/** Short chip under the bar, e.g. "LICM". */
	tag: string;
	/** One short line describing the change. */
	title: string;
	cpe: number;
	/**
	 * Code lines. The first two characters are a marker column: "+ " for lines this version adds,
	 * "- " for lines it removes; otherwise they are part of the line (unchanged).
	 */
	code: string[];
}

interface Props {
	versions: LadderVersion[];
	/** Metric shown on the bars. */
	metric?: string;
}

function parseLine(line: string): { kind: 'add' | 'del' | 'same'; text: string } {
	if (line.startsWith('+ ')) return { kind: 'add', text: `  ${line.slice(2)}` };
	if (line.startsWith('- ')) return { kind: 'del', text: `  ${line.slice(2)}` };
	return { kind: 'same', text: line };
}

export default function OptimizationLadder({ versions, metric = 'CPE' }: Props) {
	const last = versions.length - 1;
	const stepper = useStepper(last, { intervalMs: 2200 });
	const step = Math.min(stepper.step, last);
	const cur = versions[step];
	const max = Math.max(...versions.map((v) => v.cpe));
	const lines = cur.code.map(parseLine);
	const unchanged = step > 0 && lines.every((l) => l.kind === 'same');
	const speedup = versions[0].cpe / cur.cpe;
	const prev = step > 0 ? versions[step - 1] : null;

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`${step + 1} / ${versions.length}`} />
			<p className={s.message}>
				<span className={s.tagChip}>{cur.tag}</span>
				{cur.title}
			</p>

			<div className={s.body}>
				<div className={s.codePanel}>
					<div className={s.codeHead}>
						<span className={s.fileName}>{cur.name}</span>
						{unchanged && <span className={s.same}>same C code</span>}
					</div>
					<pre className={s.code}>
						{lines.map((l, i) => (
							<div key={`${step}-${i}`} className={`${s.line} ${l.kind === 'add' ? s.add : l.kind === 'del' ? s.del : ''}`}>
								<span className={s.gutter} aria-hidden="true">
									{l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ''}
								</span>
								<span className={s.text}>{l.text || ' '}</span>
							</div>
						))}
					</pre>
				</div>

				<div className={s.chartPanel}>
					<div className={s.readout}>
						<span className={s.rLabel}>{metric}</span>
						<span className={s.rValue}>{cur.cpe.toFixed(2)}</span>
						<span className={s.rSub}>
							{step === 0 ? 'baseline' : `${speedup.toFixed(1)}× faster than ${versions[0].name}`}
							{prev && <span className={s.was}>was {prev.cpe.toFixed(2)}</span>}
						</span>
					</div>
					<div className={s.chart} role="img" aria-label={`${metric} by version: ${versions.slice(0, step + 1).map((v) => `${v.name} ${v.cpe}`).join(', ')}`}>
						{versions.map((v, i) => {
							const shown = i <= step;
							// Bars not reached yet wait, hidden, at the current height, so the next one slides down from it.
							const h = ((shown ? v.cpe : cur.cpe) / max) * 100;
							return (
								<div key={v.name} className={`${s.col} ${shown ? s.colOn : ''} ${i === step ? s.colCur : ''}`}>
									<div className={s.barArea}>
										<div className={s.bar} style={{ height: `${h}%` }}>
											<span className={s.value}>{v.cpe.toFixed(2)}</span>
										</div>
									</div>
									<span className={s.name}>{v.name}</span>
								</div>
							);
						})}
					</div>
				</div>
			</div>
			<div className={s.legend}>
				<span className={s.lgDel}>removed</span>
				<span className={s.lgAdd}>added</span>
				<span className={s.lgCur}>current version</span>
			</div>
		</div>
	);
}
