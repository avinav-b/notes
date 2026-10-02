// The pipelined datapath with its three bypass paths. Pick one to see where it carries data from and to.
import { useState } from 'react';
import PipelineDrawing, { BYPASS_INFO } from './PipelineDrawing';
import type { Bypass } from './pipeline5';
import s from './BypassPaths.module.css';

const ALL: Bypass[] = ['MX', 'WX', 'WM'];

export default function BypassPaths() {
	const [focus, setFocus] = useState<Bypass | null>(null);
	const pick = (b: Bypass) => setFocus((f) => (f === b ? null : b));

	return (
		<div className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.buttons}`} role="group" aria-label="Bypass paths">
				{ALL.map((b) => (
					<button key={b} className={focus === b ? s.on : undefined} aria-pressed={focus === b} onClick={() => pick(b)}>
						<i className={s[`dot${b}`]} />
						{b} bypass
					</button>
				))}
			</div>
			<p className={s.info}>
				{focus ? (
					<>
						<b className={s[`text${focus}`]}>{focus}</b>: from {BYPASS_INFO[focus].from} to {BYPASS_INFO[focus].to}.
					</>
				) : (
					'Pick a bypass (or click a coloured path) to see the data it carries flow from one end to the other.'
				)}
			</p>
			<div className={s.scroll}>
				<PipelineDrawing frame={{ focus, flows: focus ? [focus] : [] }} bypass={ALL} onPickBypass={pick} />
			</div>
		</div>
	);
}
