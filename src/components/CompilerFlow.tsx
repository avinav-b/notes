// Inside a compiler: front end -> IR -> (optimizer -> improved IR) -> code generator.
// Toggle between a basic compiler and an optimizing one; the optimizer slides in between.
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import s from './CompilerFlow.module.css';

interface Props {
	/** Start in optimizing mode. */
	optimizing?: boolean;
}

function Data({ title, text }: { title: string; text: string }) {
	return (
		<div className={s.data}>
			<span className={s.dataTitle}>{title}</span>
			<span className={s.dataText}>{text}</span>
		</div>
	);
}

const Arrow = ({ label }: { label?: string }) => (
	<span className={s.arrowWrap}>
		{label && <span className={s.arrowLbl}>{label}</span>}
		<ArrowRight className={s.arrow} size={18} aria-hidden="true" />
	</span>
);

export default function CompilerFlow({ optimizing = false }: Props) {
	const [opt, setOpt] = useState(optimizing);
	return (
		<div className={`not-content ${s.root}`}>
			<div className="viz-controls" role="group" aria-label="Compiler type">
				<button className={!opt ? s.on : undefined} aria-pressed={!opt} onClick={() => setOpt(false)}>
					Basic compiler
				</button>{' '}
				<button className={opt ? s.on : undefined} aria-pressed={opt} onClick={() => setOpt(true)}>
					Optimizing compiler
				</button>
			</div>
			<div className={s.flow}>
				<Data title="HLL" text="C, C++, Java" />
				<Arrow />
				<div className={s.stage}>Front end</div>
				<Arrow label="HLL IR" />
				<div className={`${s.optWrap} ${opt ? s.optOn : ''}`} aria-hidden={!opt}>
					<div className={s.optInner}>
						<div className={`${s.stage} ${s.optimizer}`}>Optimizer</div>
						<Arrow label="better IR" />
					</div>
				</div>
				<div className={s.stage}>Code generator</div>
				<Arrow />
				<Data title="LLL" text="e.g. IA64" />
			</div>
		</div>
	);
}
