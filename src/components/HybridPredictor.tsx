// Hybrid (tournament) predictor: a simple PC-indexed BPB and a correlated predictor (PC xor global
// history) both predict; a PC-indexed chooser picks which one to believe for this branch.
import { useState } from 'react';
import s from './HybridPredictor.module.css';

type Pick = 'simple' | 'correlated';

const CASES: { pick: Pick; label: string; message: string }[] = [
	{ pick: 'simple', label: 'Biased branch', message: 'Goes the same way almost every time: the chooser trusts the simple BPB.' },
	{ pick: 'correlated', label: 'Correlated branch', message: 'Depends on earlier branches: the chooser trusts the correlated predictor.' },
];

export default function HybridPredictor() {
	const [k, setK] = useState(0);
	const pick = CASES[k].pick;
	const on = (p: Pick) => (p === pick ? s.on : s.off);
	return (
		<div className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.bar}`}>
				{CASES.map((c, i) => (
					<button key={c.label} className={i === k ? 'viz-primary' : undefined} aria-pressed={i === k} onClick={() => setK(i)}>
						{c.label}
					</button>
				))}
			</div>
			<p className={s.message}>{CASES[k].message}</p>
			<div className={s.scroll}>
				<svg className={s.svg} viewBox="0 0 600 250" role="img" aria-label="Hybrid predictor">
					<defs>
						{['on', 'off'].map((m) => (
							<marker key={m} id={`hy-${m}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
								<path d="M0,0 L10,5 L0,10 z" className={m === 'on' ? s.headOn : s.headOff} />
							</marker>
						))}
					</defs>

					{/* PC bus */}
					<g className={s.box}>
						<rect x={16} y={14} width={70} height={30} rx={5} />
						<text x={51} y={34} textAnchor="middle">
							PC
						</text>
					</g>
					<path className={s.bus} d="M86,29 H520" />

					{/* Correlated: GHR xor PC */}
					<g className={on('correlated')}>
						<rect className={s.boxRect} x={60} y={92} width={70} height={30} rx={5} />
						<text className={s.boxText} x={95} y={112} textAnchor="middle">
							GHR
						</text>
						<path className={s.wire} d="M130,107 H176" markerEnd={`url(#hy-${pick === 'correlated' ? 'on' : 'off'})`} />
						<path className={s.wire} d="M190,29 V91" markerEnd={`url(#hy-${pick === 'correlated' ? 'on' : 'off'})`} />
						<circle className={s.xor} cx={190} cy={107} r={13} />
						<path className={s.xorMark} d="M190,94 V120 M177,107 H203" />
						<path className={s.wire} d="M203,107 H226" markerEnd={`url(#hy-${pick === 'correlated' ? 'on' : 'off'})`} />
						<rect className={s.boxRect} x={228} y={70} width={44} height={84} rx={5} />
						<text className={s.vText} x={250} y={112} textAnchor="middle" transform="rotate(-90 250 112)">
							BPB
						</text>
						<text className={s.caption} x={280} y={116}>
							correlated
						</text>
						<path className={s.wire} d="M250,154 V196 H330" markerEnd={`url(#hy-${pick === 'correlated' ? 'on' : 'off'})`} />
					</g>

					{/* Simple BPB */}
					<g className={on('simple')}>
						<path className={s.wire} d="M370,29 V68" markerEnd={`url(#hy-${pick === 'simple' ? 'on' : 'off'})`} />
						<rect className={s.boxRect} x={348} y={70} width={44} height={84} rx={5} />
						<text className={s.vText} x={370} y={112} textAnchor="middle" transform="rotate(-90 370 112)">
							BPB
						</text>
						<text className={s.caption} x={400} y={116}>
							simple
						</text>
						<path className={s.wire} d="M370,154 V180" markerEnd={`url(#hy-${pick === 'simple' ? 'on' : 'off'})`} />
					</g>

					{/* Chooser */}
					<g className={s.chooser}>
						<path className={s.wireNeutral} d="M490,29 V68" />
						<rect className={s.boxRect} x={468} y={70} width={44} height={84} rx={5} />
						<text className={s.vText} x={490} y={112} textAnchor="middle" transform="rotate(-90 490 112)">
							chooser
						</text>
						<path className={s.wireNeutral} d="M490,154 V196 H432" markerEnd="url(#hy-on)" />
					</g>

					{/* Mux */}
					<path className={s.mux} d={`M330,182 H430 L416,210 H344 Z`} />
					<text className={s.muxText} x={380} y={201} textAnchor="middle">
						{pick === 'simple' ? 'pick simple' : 'pick correlated'}
					</text>
					<path className={s.wireOut} d="M380,210 V236" markerEnd="url(#hy-on)" />
					<text className={s.caption} x={392} y={236}>
						prediction
					</text>
				</svg>
			</div>
		</div>
	);
}
