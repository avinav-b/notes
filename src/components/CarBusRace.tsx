// Latency vs throughput: vehicles shuttle people from A to B and back over an hour. The first arrival
// is the latency; the pile of people at B (and the people-per-hour bar) is the throughput.
// Data-driven: distance, duration, step size and the vehicles (capacity, speed).
import { useRef } from 'react';
import { Bus, Car, User } from 'lucide-react';
import { StepControls, useStepper } from './StepControls';
import { useWidth } from './OooTimeline';
import s from './CarBusRace.module.css';

interface Vehicle {
	name: string;
	icon?: 'car' | 'bus';
	capacity: number;
	/** Miles per hour. */
	speed: number;
}

interface Props {
	/** Miles from A to B. */
	distance?: number;
	/** Minutes simulated. */
	duration?: number;
	/** Minutes per step. */
	step?: number;
	vehicles?: Vehicle[];
}

const VEHICLES: Vehicle[] = [
	{ name: 'Car', icon: 'car', capacity: 5, speed: 60 },
	{ name: 'Bus', icon: 'bus', capacity: 60, speed: 20 },
];

const COLORS = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)', 'var(--viz-series-4)'];

interface VState {
	pos: number; // 0 = A, 1 = B
	loaded: boolean;
	returning: boolean;
	delivered: number;
	oneWay: number; // minutes
	arrived: boolean;
	justArrived: boolean;
}

function vehicleAt(v: Vehicle, distance: number, t: number, dt: number): VState {
	const oneWay = (distance / v.speed) * 60;
	const round = 2 * oneWay;
	const trips = (time: number) => (time < oneWay ? 0 : Math.floor((time - oneWay) / round) + 1);
	const phase = t % round;
	const pos = phase <= oneWay ? phase / oneWay : 1 - (phase - oneWay) / oneWay;
	const delivered = trips(t) * v.capacity;
	return {
		pos,
		loaded: phase < oneWay,
		returning: phase > oneWay || (phase === oneWay && t > 0),
		delivered,
		oneWay,
		arrived: t >= oneWay,
		justArrived: t > 0 && trips(t) > trips(t - dt),
	};
}

export default function CarBusRace({ distance = 10, duration = 60, step = 5, vehicles = VEHICLES }: Props) {
	const last = Math.round(duration / step);
	const stepper = useStepper(last, { intervalMs: 900 });
	const t = stepper.step * step;
	const wrap = useRef<HTMLDivElement>(null);
	const [width] = useWidth(wrap);
	const narrow = width < 520;

	const states = vehicles.map((v) => vehicleAt(v, distance, t, step));
	const perHour = vehicles.map((v) => {
		const oneWay = (distance / v.speed) * 60;
		return (v.capacity * 60) / (2 * oneWay);
	});
	const maxPerHour = Math.max(...perHour);
	const maxCap = Math.max(...vehicles.map((v) => v.capacity));
	const maxDelivered = Math.max(...vehicles.map((v, i) => Math.round((perHour[i] * duration) / 60)), maxCap);

	// Layout
	// Narrow: drawn at the real width, names go under the road instead of in a left column.
	const W = narrow ? Math.max(300, width) : 700;
	const LABEL = narrow ? 0 : 110;
	const xA = narrow ? 22 : LABEL + 34;
	const pileX = narrow ? W - 8 - 15 * 8 : 510;
	const xB = pileX - (narrow ? 22 : 40);
	const pileW = W - pileX - 8;
	const dotGap = narrow ? 8 : 10;
	const pileCols = Math.max(1, Math.floor(pileW / dotGap));
	const pileRows = Math.ceil(maxDelivered / pileCols);
	const LANE_H = Math.max(narrow ? 84 : 78, 44 + pileRows * dotGap);
	const TOP = 30;
	const lanesH = vehicles.length * LANE_H;
	const BARS_Y = TOP + lanesH + 22;
	const BAR_H = 16;
	const barX = narrow ? 34 : LABEL + 16;
	const barW = W - barX - (narrow ? 78 : 110);
	const groupH = vehicles.length * (BAR_H + 6) + 24;
	const H = BARS_Y + 2 * groupH + 4;

	// Message: the most important event this step.
	let msg = `Both leave A with a full load.`;
	if (t > 0) {
		const arrivals = states.map((st, i) => (st.justArrived ? i : -1)).filter((i) => i >= 0);
		const firsts = arrivals.filter((i) => Math.abs(states[i].oneWay - t) < 1e-9);
		if (firsts.length) msg = `${vehicles[firsts[0]].name} reaches B: latency ${fmt(states[firsts[0]].oneWay)} min.`;
		else if (arrivals.length) msg = `${vehicles[arrivals[0]].name} delivers ${vehicles[arrivals[0]].capacity} more people.`;
		else msg = `Vehicles shuttle between A and B.`;
		if (stepper.step === last) msg = `After ${duration} min: ${vehicles.map((v, i) => `${v.name.toLowerCase()} ${fmt(perHour[i])}`).join(', ')} people/hour.`;
	}

	const latencies = states.map((st) => st.oneWay);
	const maxLat = Math.max(...latencies);
	const latScale = (m: number) => (Math.min(m, maxLat) / maxLat) * barW;
	const pphScale = (p: number) => (p / maxPerHour) * barW;

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`t = ${t} min`} />
			<p className={s.message} aria-live="polite">
				{msg}
			</p>
			<div ref={wrap} className={s.wrap}>
				<svg className={s.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Minute ${t}: ${msg}`}>
					{/* Header: distance */}
					<text className={s.endpoint} x={xA} y={16} textAnchor="middle">
						A
					</text>
					<text className={s.endpoint} x={xB} y={16} textAnchor="middle">
						B
					</text>
					<line className={s.dist} x1={xA + 12} x2={xB - 12} y1={12} y2={12} />
					<text className={s.distText} x={(xA + xB) / 2} y={8} textAnchor="middle">
						{distance} miles
					</text>
					<text className={s.pileHead} x={pileX} y={16}>
						{narrow ? 'at B' : 'people at B'}
					</text>

					{vehicles.map((v, i) => {
						const st = states[i];
						const y = TOP + i * LANE_H;
						const roadY = y + 36;
						const x = xA + st.pos * (xB - xA);
						const color = COLORS[i % COLORS.length];
						const Icon = v.icon === 'bus' ? Bus : Car;
						const people = Math.round(st.delivered);
						return (
							<g key={v.name} style={{ ['--c' as string]: color }}>
								{narrow ? (
									<text className={s.vName} x={xA - 6} y={roadY + 38}>
										{v.name}
										<tspan className={s.vSpec} dx={6}>
											{v.capacity} seats, {v.speed} mph
										</tspan>
									</text>
								) : (
									<>
										<text className={s.vName} x={LABEL - 4} y={roadY - 4} textAnchor="end">
											{v.name}
										</text>
										<text className={s.vSpec} x={LABEL - 4} y={roadY + 12} textAnchor="end">
											{v.capacity} seats
										</text>
										<text className={s.vSpec} x={LABEL - 4} y={roadY + 26} textAnchor="end">
											{v.speed} mph
										</text>
									</>
								)}
								{/* Road */}
								<line className={s.road} x1={xA} x2={xB} y1={roadY + 16} y2={roadY + 16} />
								<circle className={s.stop} cx={xA} cy={roadY + 16} r={4} />
								<circle className={s.stop} cx={xB} cy={roadY + 16} r={4} />
								{/* Vehicle */}
								<g className={s.vehicle} style={{ transform: `translateX(${x}px)` }}>
									<g style={{ transform: `scaleX(${st.returning ? -1 : 1})` }} className={s.flip}>
										<rect className={st.loaded ? s.bodyFull : s.bodyEmpty} x={-17} y={roadY - 6} width={34} height={22} rx={6} />
										<Icon x={-10} y={roadY - 5} size={20} className={st.loaded ? s.iconFull : s.iconEmpty} />
									</g>
									<g className={st.loaded ? s.badge : s.badgeHidden}>
										<rect x={-17} y={roadY - 26} width={34} height={16} rx={8} />
										<text x={0} y={roadY - 14} textAnchor="middle">
											{v.capacity}
										</text>
									</g>
								</g>
								{/* People delivered */}
								{Array.from({ length: Math.round(perHour[i] * (duration / 60)) }, (_, k) => {
									const col = k % pileCols;
									const row = Math.floor(k / pileCols);
									return (
										<circle
											key={k}
											className={k < people ? (st.justArrived && k >= people - v.capacity ? s.dotNew : s.dot) : s.dotEmpty}
											cx={pileX + 4 + col * dotGap}
											cy={y + 20 + row * dotGap}
											r={narrow ? 3 : 3.6}
										/>
									);
								})}
								<text className={`${s.pileCount} ${st.justArrived ? s.flash : ''}`} x={pileX} y={y + 20 + pileRows * dotGap + 14}>
									{people}
								</text>
							</g>
						);
					})}

					{/* Comparison bars */}
					{[
						{ title: 'Latency: time for one trip A to B', unit: 'min', val: (i: number) => (states[i].arrived ? latencies[i] : t), done: (i: number) => states[i].arrived, scale: latScale },
						{
							title: 'Throughput: people delivered per hour',
							unit: '',
							val: (i: number) => Math.min(perHour[i], (states[i].delivered * 60) / duration),
							done: () => stepper.step === last,
							scale: pphScale,
						},
					].map((g, gi) => {
						const gy = BARS_Y + gi * groupH;
						return (
							<g key={g.title}>
								<text className={s.groupTitle} x={barX} y={gy + 10}>
									{g.title}
								</text>
								{vehicles.map((v, i) => {
									const by = gy + 18 + i * (BAR_H + 6);
									const val = g.val(i);
									const done = g.done(i);
									return (
										<g key={v.name} style={{ ['--c' as string]: COLORS[i % COLORS.length] }}>
											<text className={s.barName} x={barX - 6} y={by + 12} textAnchor="end">
												{v.name}
											</text>
											<rect className={s.barTrack} x={barX} y={by} width={barW} height={BAR_H} rx={3} />
											<rect className={done ? s.barDone : s.barGrow} x={barX} y={by} width={Math.max(0, g.scale(val))} height={BAR_H} rx={3} />
											<text className={done ? s.barVal : s.barValDim} x={barX + g.scale(val) + 6} y={by + 12}>
												{done ? `${fmt(val)}${g.unit ? ` ${g.unit}` : ''}` : val > 0 ? `${fmt(val)}${g.unit ? ` ${g.unit}` : ''}...` : ''}
											</text>
										</g>
									);
								})}
							</g>
						);
					})}
				</svg>
			</div>
			<div className={s.legend}>
				<span className={s.lg}>
					<span className={s.swFull} /> carrying people
				</span>
				<span className={s.lg}>
					<span className={s.swEmpty} /> driving back empty
				</span>
				<span className={s.lg}>
					<User size={13} aria-hidden="true" /> one dot = one person delivered
				</span>
			</div>
		</div>
	);
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
