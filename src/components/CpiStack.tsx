// CPI as a stack: each instruction class adds frequency x cycles to the average, so a bar's length is
// the CPI. Several designs side by side on one scale: the faster one is visibly shorter. If a design
// changes the clock, the "time per instruction" view adds the longer clock period as a hatched tail.
// Data-driven: instruction classes with frequencies, scenarios of designs (cycles per class, clock).
import { useState } from 'react';
import s from './CpiStack.module.css';

interface InsnClass {
	name: string;
	/** Fraction of dynamic instructions, 0..1. */
	freq: number;
}
interface Design {
	label: string;
	/** Cycles per instruction for each class, in class order. */
	cycles: number[];
	/** Clock frequency relative to the first design (0.8 = 20% slower clock). */
	clock?: number;
}
interface Scenario {
	label: string;
	designs: Design[];
}
interface Props {
	classes?: InsnClass[];
	scenarios?: Scenario[];
}

const COLORS = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)', 'var(--viz-series-4)'];

const CLASSES: InsnClass[] = [
	{ name: 'ALU', freq: 0.5 },
	{ name: 'Load', freq: 0.2 },
	{ name: 'Store', freq: 0.1 },
	{ name: 'Branch', freq: 0.2 },
];
const SCENARIOS: Scenario[] = [
	{
		label: 'Example',
		designs: [
			{ label: 'Base', cycles: [1, 5, 1, 2] },
			{ label: 'A', cycles: [1, 5, 1, 1] },
			{ label: 'B', cycles: [1, 3, 1, 2] },
		],
	},
];

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const fmt = (x: number) => String(r3(x));

export default function CpiStack({ classes = CLASSES, scenarios = SCENARIOS }: Props) {
	const [sc, setSc] = useState(0);
	const [timeMode, setTimeMode] = useState(false);
	const [hover, setHover] = useState<{ d: number; c: number } | null>(null);
	const scenario = scenarios[Math.min(sc, scenarios.length - 1)];
	const hasClock = scenarios.some((x) => x.designs.some((d) => (d.clock ?? 1) !== 1));
	const showTime = hasClock && timeMode;

	const cpi = (d: Design) => classes.reduce((sum, c, i) => sum + c.freq * d.cycles[i], 0);
	const time = (d: Design) => cpi(d) / (d.clock ?? 1);
	// One scale for every scenario and mode, so switching shows bars grow or shrink.
	const max = Math.max(...scenarios.flatMap((x) => x.designs.map((d) => Math.max(cpi(d), time(d)))));
	const axisMax = Math.ceil(max * 2) / 2;
	const pct = (v: number) => `${(v / axisMax) * 100}%`;
	const ticks = Array.from({ length: Math.round(axisMax / 0.5) + 1 }, (_, i) => i * 0.5);

	const base = scenario.designs[0];
	const value = (d: Design) => (showTime ? time(d) : cpi(d));
	const values = scenario.designs.map(value);
	const best = values.indexOf(Math.min(...values));
	const clockChanged = scenario.designs.some((d) => (d.clock ?? 1) !== (base.clock ?? 1));

	let msg: string;
	if (scenario.designs.length === 1) msg = `CPI = ${fmt(cpi(base))} cycles per instruction.`;
	else if (clockChanged && !showTime) msg = `CPI drops, but the clock got slower: check time.`;
	else {
		const others = scenario.designs.slice(1);
		const parts = others.map((d) => `${d.label} ${Math.round((100 * value(base)) / value(d)) / 100}×`);
		const speedLabel = others.length === 1 ? (value(base) / value(others[0]) < 1 ? ' (a slowdown)' : ' (a speedup)') : '';
		msg = `Speedup over ${base.label}: ${parts.join(', ')}${speedLabel}.`;
	}

	return (
		<div className={`not-content ${s.root}`}>
			{(scenarios.length > 1 || hasClock) && (
				<div className={`viz-controls ${s.controls}`}>
					{scenarios.length > 1 && (
						<div className={s.seg} role="group" aria-label="Scenario">
							{scenarios.map((x, i) => (
								<button key={x.label} className={`viz-btn ${i === sc ? s.on : ''}`} aria-pressed={i === sc} onClick={() => setSc(i)}>
									{x.label}
								</button>
							))}
						</div>
					)}
					{hasClock && (
						<div className={s.seg} role="group" aria-label="Measure">
							<button className={`viz-btn ${!timeMode ? s.on : ''}`} aria-pressed={!timeMode} onClick={() => setTimeMode(false)}>
								CPI
							</button>
							<button className={`viz-btn ${timeMode ? s.on : ''}`} aria-pressed={timeMode} onClick={() => setTimeMode(true)}>
								Time per instruction
							</button>
						</div>
					)}
				</div>
			)}
			<p className={s.message} aria-live="polite">
				{msg}
			</p>

			<div className={s.chart}>
				{scenario.designs.map((d, di) => {
					const c = cpi(d);
					const extra = showTime ? time(d) - c : 0;
					const changed = d.cycles.map((cy, i) => di > 0 && cy !== base.cycles[i]);
					return (
						<div key={d.label} className={`${s.row} ${di === best && scenario.designs.length > 1 && (showTime || !clockChanged) ? s.best : ''}`}>
							<div className={s.label}>{d.label}</div>
							<div className={s.track}>
								{ticks.slice(1).map((t) => (
									<span key={t} className={s.grid} style={{ left: pct(t) }} />
								))}
								<div className={s.bar}>
									{classes.map((cl, i) => {
										const v = cl.freq * d.cycles[i];
										const on = hover && hover.d === di && hover.c === i;
										return (
											<div
												key={cl.name}
												className={`${s.segment} ${changed[i] ? s.changed : ''} ${on ? s.hot : ''}`}
												style={{ width: pct(v), ['--c' as string]: COLORS[i % COLORS.length] }}
												onPointerEnter={() => setHover({ d: di, c: i })}
												onPointerLeave={() => setHover(null)}
												onPointerDown={() => setHover({ d: di, c: i })}
												title={`${cl.name}: ${fmt(cl.freq)} × ${d.cycles[i]} = ${fmt(v)}`}
											>
												<span className={s.segText}>{v / axisMax >= 0.09 ? fmt(v) : ''}</span>
											</div>
										);
									})}
									<div className={`${s.clockTail} ${extra > 0 ? s.tailOn : ''}`} style={{ width: pct(extra) }} title="Longer clock period">
										<span className={s.segText}>{extra / axisMax >= 0.12 ? `+${fmt(extra)}` : ''}</span>
									</div>
								</div>
							</div>
							<div className={s.total}>{fmt(value(d))}</div>
							<div className={s.formula}>
								{classes.map((cl, i) => (
									<span key={cl.name}>
										{i > 0 && ' + '}
										<span
											className={`${s.term} ${changed[i] ? s.termChanged : ''} ${hover && hover.d === di && hover.c === i ? s.termHot : ''}`}
											style={{ ['--c' as string]: COLORS[i % COLORS.length] }}
										>
											{fmt(cl.freq)}·{d.cycles[i]}
										</span>
									</span>
								))}
								{' = '}
								<b>{fmt(c)}</b>
								{showTime && (d.clock ?? 1) !== 1 && (
									<span className={s.clockTerm}>
										{' '}
										÷ {fmt(d.clock ?? 1)} clock = <b>{fmt(time(d))}</b>
									</span>
								)}
							</div>
						</div>
					);
				})}
				<div className={s.axis}>
					{ticks.map((t) => (
						<span key={t} style={{ left: pct(t) }}>
							{t}
						</span>
					))}
				</div>
				<div className={s.axisTitle}>{showTime ? 'time per instruction (old clock periods)' : 'cycles per instruction'}</div>
			</div>

			<div className={s.legend}>
				{classes.map((cl, i) => (
					<span key={cl.name} className={`${s.lg} ${hover?.c === i ? s.lgHot : ''}`} style={{ ['--c' as string]: COLORS[i % COLORS.length] }}>
						<span className={s.sw} /> {cl.name} <span className={s.freq}>{Math.round(cl.freq * 1000) / 10}%</span>
					</span>
				))}
				{scenarios.some((x) => x.designs.length > 1) && (
					<span className={s.lg}>
						<span className={s.swChanged} /> changed
					</span>
				)}
				{hasClock && (
					<span className={s.lg}>
						<span className={s.swClock} /> slower clock
					</span>
				)}
			</div>
		</div>
	);
}
