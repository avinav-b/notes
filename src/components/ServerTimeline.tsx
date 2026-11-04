// Latency vs throughput for a server handling the same requests on three machines:
// one core, a faster core, and several cores serving requests in parallel (each one slowed by
// sharing the machine). Bars are requests on a time axis (bar length = latency); a playhead sweeps
// time and each machine's finished-request dots fill in, so throughput is how soon all are done.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { StepControls, useStepper } from './StepControls';
import { useWidth } from './OooTimeline';
import s from './ServerTimeline.module.css';

interface Props {
	/** Requests waiting at time 0. */
	requests?: number;
	/** Time one request takes on one core. */
	work?: number;
	/** How much faster the faster CPU is. */
	speedup?: number;
	cores?: number;
	/** Extra time each request takes when the cores run in parallel (sharing, coordination). */
	slowdown?: number;
	/** Unit of time, for labels. */
	unit?: string;
}

interface Job {
	req: number;
	start: number;
	work: number;
	extra: number;
}
interface Machine {
	label: string;
	lanes: Job[][];
}

const LANE = 28;
const PANEL_GAP = 16;
const HEAD = 26;

export default function ServerTimeline({ requests = 3, work = 4, speedup = 2, cores = 3, slowdown = 3, unit = 'ms' }: Props) {
	const seq = (w: number): Job[] => Array.from({ length: requests }, (_, k) => ({ req: k + 1, start: k * w, work: w, extra: 0 }));
	const par: Job[][] = Array.from({ length: cores }, () => []);
	for (let k = 0; k < requests; k++) {
		const lane = par[k % cores];
		const start = lane.reduce((t, j) => t + j.work + j.extra, 0);
		lane.push({ req: k + 1, start, work, extra: slowdown });
	}
	const machines: Machine[] = [
		{ label: '1 core', lanes: [seq(work)] },
		{ label: 'Faster CPU', lanes: [seq(work / speedup)] },
		{ label: `${cores} cores`, lanes: par },
	];
	const end = (j: Job) => j.start + j.work + j.extra;
	const done = machines.map((m) => Math.max(...m.lanes.flat().map(end)));
	const latency = machines.map((m) => m.lanes[0][0].work + m.lanes[0][0].extra);
	const T = Math.max(...done);

	const stepper = useStepper(T, { intervalMs: 450 });
	const pid = useId().replace(/:/g, '');
	// Open on the finished picture (also before hydration); Reset or Play replays it.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		stepper.finish();
		setMounted(true);
	}, []);
	const t = mounted ? stepper.step : T;

	const wrap = useRef<HTMLDivElement>(null);
	const [width, ready] = useWidth(wrap);
	const narrow = width < 480;
	const LW = narrow ? 84 : 96;
	const RW = narrow ? 50 : 64;
	const unitW = (width - LW - RW) / T;
	const x = (time: number) => LW + time * unitW;

	let y = HEAD;
	const panels = machines.map((m) => {
		const top = y;
		y += m.lanes.length * LANE + PANEL_GAP;
		return top;
	});
	const H = y - PANEL_GAP + 8;
	const tickStep = unitW >= 26 ? 1 : 2;

	const maxLat = Math.max(...latency);
	const thr = machines.map((m, i) => requests / done[i]);
	const maxThr = Math.max(...thr);
	const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

	return (
		<figure className={`not-content ${s.root} ${ready ? s.ready : ''}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} speed={false} counter={`t = ${t} ${unit}`} />

			<div ref={wrap} className={s.wrap}>
				<svg className={s.svg} width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Requests over time on three machines">
					<defs>
						<pattern id={`${pid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<rect width="6" height="6" className={s.hatchBg} />
							<line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
						</pattern>
					</defs>

					{/* Time axis */}
					{Array.from({ length: T + 1 }, (_, k) =>
						k % tickStep === 0 ? (
							<g key={k}>
								<line x1={x(k)} x2={x(k)} y1={HEAD - 4} y2={H - 8} className={s.grid} />
								<text x={x(k)} y={14} className={s.axis} textAnchor="middle">
									{k}
								</text>
							</g>
						) : null,
					)}
					<text x={LW - 8} y={14} className={s.axis} textAnchor="end">
						time ({unit})
					</text>
					<text x={width - RW / 2} y={14} className={s.axis} textAnchor="middle">
						done
					</text>

					{machines.map((m, mi) => {
						const top = panels[mi];
						const ph = m.lanes.length * LANE;
						const jobs = m.lanes.flat();
						return (
							<g key={m.label}>
								<rect x={2} y={top - 2} width={width - 4} height={ph + 4} rx={6} className={s.panel} />
								<text x={8} y={top + ph / 2 + (m.lanes.length > 1 && !narrow ? -2 : 4)} className={`${s.machine} ${narrow ? s.machineSm : ''}`}>
									{m.label}
								</text>
								{m.lanes.length > 1 && !narrow && (
									<text x={8} y={top + ph / 2 + 14} className={s.sub}>
										1 request each
									</text>
								)}

								{m.lanes.map((lane, li) =>
									lane.map((j) => {
										const by = top + li * LANE + 4;
										const bh = LANE - 8;
										const total = j.work + j.extra;
										const frac = Math.max(0, Math.min(1, (t - j.start) / total));
										const bw = total * unitW - 2;
										const ww = j.work * unitW - 2;
										return (
											<g key={j.req} className={s.job} style={{ transform: `translate(${x(j.start) + 1}px, ${by}px)` }}>
												{/* Outline of the whole request, then its progress so far */}
												<rect width={bw} height={bh} rx={4} className={s.ghost} />
												<clipPath id={`${pid}-c${mi}-${j.req}`}>
													<rect width={bw} height={bh} className={s.progress} style={{ transform: `scaleX(${frac})` }} />
												</clipPath>
												<g clipPath={`url(#${pid}-c${mi}-${j.req})`}>
													{j.extra > 0 ? (
														// The slowdown is spread through the request: work, held up, work, held up, ...
														<>
															<rect width={bw} height={bh} rx={4} className={s.extra} fill={`url(#${pid}-hatch)`} />
															{chunks(j).map(([a, b]) => (
																<rect key={a} x={a * unitW} width={(b - a) * unitW} height={bh} rx={3} className={s.work} />
															))}
														</>
													) : (
														<rect width={ww} height={bh} rx={4} className={s.work} />
													)}
												</g>
												<text x={bw / 2} y={bh / 2 + 4} textAnchor="middle" className={s.reqLabel}>
													{bw > 52 ? `req ${j.req}` : `r${j.req}`}
												</text>
											</g>
										);
									}),
								)}

								{/* Finished requests */}
								{jobs.map((j, k) => {
									const n = jobs.length;
									const gap = Math.min(15, (RW - 12) / Math.max(1, n - 1));
									const cx = width - RW / 2 - ((n - 1) * gap) / 2 + k * gap;
									const isDone = end(j) <= t;
									return <circle key={j.req} cx={cx} cy={top + ph / 2} r={5.5} className={isDone ? s.dotDone : s.dot} />;
								})}
							</g>
						);
					})}

					{/* Playhead */}
					<g className={s.playhead} style={{ transform: `translate(${x(t)}px, 0px)` }}>
						<line x1={0} x2={0} y1={HEAD - 6} y2={H - 4} />
					</g>
				</svg>
			</div>

			<div className={s.legend}>
				<span className={s.lg}>
					<span className={s.swWork} /> Doing the request
				</span>
				<span className={s.lg}>
					<span className={s.swExtra} /> Slowed by sharing the machine
				</span>
				<span className={s.lg}>
					<span className={s.swDone} /> Request finished
				</span>
			</div>

			<div className={s.metrics}>
				<Meter title="Latency" hint="per request, lower is better">
					{machines.map((m, i) => (
						<Row key={m.label} label={m.label} frac={latency[i] / maxLat} base={latency[0] / maxLat} value={`${fmt(latency[i])} ${unit}`} />
					))}
				</Meter>
				<Meter title="Throughput" hint="requests per time, higher is better">
					{machines.map((m, i) => (
						<Row key={m.label} label={m.label} frac={thr[i] / maxThr} base={thr[0] / maxThr} value={`${requests} / ${fmt(done[i])} ${unit}`} />
					))}
				</Meter>
			</div>
		</figure>
	);
}

/** Work pieces of a slowed-down request, as [from, to] offsets from its start. */
function chunks(j: Job): [number, number][] {
	const n = Math.max(1, Math.round(j.work));
	const piece = j.work / n;
	const gap = j.extra / n;
	return Array.from({ length: n }, (_, k) => [k * (piece + gap), k * (piece + gap) + piece]);
}

function Meter({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
	return (
		<div className={s.meter}>
			<div className={s.meterHead}>
				<b>{title}</b> <span>{hint}</span>
			</div>
			{children}
		</div>
	);
}

/** One machine's bar; the dashed tick marks the 1-core value, for comparison. */
function Row({ label, frac, value, base }: { label: string; frac: number; value: string; base: number }) {
	return (
		<div className={s.row}>
			<span className={s.rowLabel}>{label}</span>
			<span className={s.track}>
				<span className={s.fill} style={{ width: `${frac * 100}%` }} />
				<span className={s.baseTick} style={{ left: `${base * 100}%` }} />
			</span>
			<span className={s.rowValue}>{value}</span>
		</div>
	);
}
