// Amdahl's law: an old-time bar split into (1-f) and f, and the new-time bar (1-f) and f/s on the
// same scale directly under it. Sliders for f and s, presets for worked examples.
import { useEffect, useRef, useState } from 'react';
import s from './AmdahlExplorer.module.css';

interface Preset {
	label: string;
	f: number;
	s: number;
}

interface Props {
	f?: number;
	s?: number;
	presets?: Preset[];
}

const S_MAX = 100;
const toPos = (x: number) => Math.log(x) / Math.log(S_MAX);
const fromPos = (p: number) => Math.pow(S_MAX, p);

// SVG layout
const OLD_Y = 34;
const NEW_Y = 148;
const BH = 46;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number, d = 2) => x.toFixed(d).replace(/\.?0+$/, '') || '0';

export default function AmdahlExplorer({
	f: f0 = 0.7,
	s: s0 = 3,
	presets = [
		{ label: 'Example 1', f: 0.7, s: 3 },
		{ label: 'Example 2', f: 2 / 3, s: 4 },
	],
}: Props) {
	const [f, setF] = useState(f0);
	const [sp, setS] = useState(s0);
	// Narrow containers (phones) get a narrower viewBox so the text stays readable.
	const ref = useRef<HTMLDivElement>(null);
	const [narrow, setNarrow] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 540));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	const W = narrow ? 400 : 700;
	const X0 = narrow ? 48 : 70;
	const BW = W - X0 - 14; // width of OldTime = 1
	const raf = useRef(0);
	useEffect(() => () => cancelAnimationFrame(raf.current), []);
	// Presets glide to their values (s in log space) so the bars visibly shrink or grow.
	const animateTo = (tf: number, ts: number) => {
		cancelAnimationFrame(raf.current);
		const [ff, fs] = [f, toPos(sp)];
		const [gf, gs] = [tf, toPos(ts)];
		const start = performance.now();
		const tick = (now: number) => {
			const k = Math.min(1, (now - start) / 600);
			const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
			setF(ff + (gf - ff) * e);
			setS(k === 1 ? ts : fromPos(fs + (gs - fs) * e));
			if (k < 1) raf.current = requestAnimationFrame(tick);
		};
		raf.current = requestAnimationFrame(tick);
	};
	const stop = () => cancelAnimationFrame(raf.current);
	const rest = 1 - f;
	const opt = f / sp;
	const newTime = rest + opt;
	const speedup = 1 / newTime;
	const limit = 1 / rest;
	const restShare = rest / newTime;
	const optShare = opt / newTime;

	const xRest = X0 + rest * BW; // where the f part starts (both bars)
	const xOldEnd = X0 + BW;
	const xNewEnd = X0 + newTime * BW;
	const oldCommonIsF = f >= rest;
	const newCommonIsF = opt >= rest;

	// Text inside a segment only if it fits; otherwise drop it below the bar.
	const segLabel = (x0: number, x1: number, y: number, top: string, bottom: string, cls: string) => {
		const w = x1 - x0;
		const cx = (x0 + x1) / 2;
		if (w >= 70)
			return (
				<g className={cls}>
					<text className={s.segTop} x={cx} y={y + 19} textAnchor="middle">
						{top}
					</text>
					<text className={s.segBottom} x={cx} y={y + 36} textAnchor="middle">
						{bottom}
					</text>
				</g>
			);
		return (
			<g className={cls}>
				<text className={s.segOutside} x={x1 + 6} y={y + 28}>
					{top} {bottom}
				</text>
			</g>
		);
	};

	return (
		<div ref={ref} className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.controls}`}>
				<label className={s.slider}>
					<span className={s.sliderName}>
						<i>f</i> <span className={s.sliderHint}>fraction sped up</span>
					</span>
					<input type="range" min={0.01} max={0.99} step="any" value={f} onChange={(e) => (stop(), setF(Number(e.target.value)))} aria-label="f, fraction of time sped up" />
					<span className={s.sliderValue}>{f.toFixed(2)}</span>
				</label>
				<label className={s.slider}>
					<span className={s.sliderName}>
						<i>s</i> <span className={s.sliderHint}>speedup of that part</span>
					</span>
					<input
						type="range"
						min={0}
						max={1}
						step="any"
						value={toPos(sp)}
						onChange={(e) => (stop(), setS(Math.max(1, fromPos(Number(e.target.value)))))}
						aria-label="s, speedup of the optimized part"
					/>
					<span className={s.sliderValue}>{sp < 10 ? num(sp, 1) : Math.round(sp)}×</span>
				</label>
				<div className={s.presets}>
					{presets.map((p) => (
						<button key={p.label} onClick={() => animateTo(p.f, p.s)} className={Math.abs(p.f - f) < 1e-3 && Math.abs(p.s - sp) < 1e-3 ? s.on : undefined}>
							{p.label}
						</button>
					))}
				</div>
			</div>

			<div className={s.readout}>
				<span className={s.big}>{speedup.toFixed(3)}×</span>
				<span className={s.formula}>
					= 1 / ({num(rest, 3)} + {num(f, 3)}/{num(sp, 2)})
				</span>
				<span className={s.limitText}>
					limit {Number.isFinite(limit) ? `${limit.toFixed(2)}×` : '∞'}
				</span>
			</div>

			<svg className={s.svg} viewBox={`0 0 ${W} 222`} role="img" aria-label={`Old time 1, new time ${newTime.toFixed(3)}, speedup ${speedup.toFixed(3)}`}>
				<defs>
					<pattern id="amdahl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<line x1="0" y1="0" x2="0" y2="6" className={s.hatch} />
					</pattern>
				</defs>

				<text className={s.rowName} x={X0 - 10} y={OLD_Y + 28} textAnchor="end">
					Old
				</text>
				<text className={s.rowName} x={X0 - 10} y={NEW_Y + 28} textAnchor="end">
					New
				</text>

				{/* Funnel showing f shrinking to f/s */}
				<polygon className={s.funnel} points={`${xRest},${OLD_Y + BH} ${xOldEnd},${OLD_Y + BH} ${xNewEnd},${NEW_Y} ${xRest},${NEW_Y}`} />
				<line className={s.guide} x1={xRest} y1={OLD_Y + BH} x2={xRest} y2={NEW_Y} />
				<line className={s.guide} x1={X0} y1={OLD_Y + BH} x2={X0} y2={NEW_Y} />

				{/* Old time */}
				<rect className={s.rest} x={X0} y={OLD_Y} width={rest * BW} height={BH} />
				<rect className={s.opt} x={xRest} y={OLD_Y} width={f * BW} height={BH} />
				{segLabel(X0, xRest, OLD_Y, '1−f', pct(rest), s.lblRest)}
				{segLabel(xRest, xOldEnd, OLD_Y, 'f', pct(f), s.lblOpt)}
				{oldCommonIsF ? <CommonTag x={(xRest + xOldEnd) / 2} y={OLD_Y - 8} /> : <CommonTag x={(X0 + xRest) / 2} y={OLD_Y - 8} />}

				{/* New time */}
				<rect className={s.rest} x={X0} y={NEW_Y} width={rest * BW} height={BH} />
				<rect className={s.opt} x={xRest} y={NEW_Y} width={opt * BW} height={BH} />
				{/* What was saved */}
				<rect className={s.saved} x={xNewEnd} y={NEW_Y} width={Math.max(0, xOldEnd - xNewEnd)} height={BH} />
				{segLabel(X0, xRest, NEW_Y, '1−f', pct(restShare), s.lblRest)}
				{opt * BW >= 70 && segLabel(xRest, xNewEnd, NEW_Y, 'f/s', pct(optShare), s.lblOpt)}
				{opt * BW < 70 && (
					<text className={`${s.segOutside} ${s.lblOpt}`} x={xRest + 4} y={NEW_Y + BH + 18}>
						f/s {pct(optShare)}
					</text>
				)}
				{xOldEnd - xNewEnd > 70 && (
					<text className={s.savedText} x={(xNewEnd + xOldEnd) / 2} y={NEW_Y + 28} textAnchor="middle">
						saved {pct(1 - newTime)}
					</text>
				)}
				{newCommonIsF ? <CommonTag x={(xRest + xNewEnd) / 2} y={NEW_Y - 8} /> : <CommonTag x={(X0 + xRest) / 2} y={NEW_Y - 8} />}

				{/* Limit: f eliminated, only 1-f remains */}
				<line className={s.limit} x1={xRest} y1={NEW_Y - 4} x2={xRest} y2={NEW_Y + BH + 26} />
				<text className={s.limitLbl} x={xRest - 6} y={NEW_Y + BH + 20} textAnchor="end">
					limit: f eliminated
				</text>
			</svg>

			<div className={s.legend}>
				<span className={s.lgRest}>1−f: not sped up</span>
				<span className={s.lgOpt}>f: sped up by s</span>
				<span className={s.lgSaved}>time saved</span>
				<span className={s.lgLimit}>limit 1/(1−f)</span>
				<span className={s.lgCommon}>common case</span>
			</div>
		</div>
	);
}

function CommonTag({ x, y }: { x: number; y: number }) {
	return (
		<g className={s.common} style={{ transform: `translateX(${x}px)` }}>
			<rect x={-34} y={y - 13} width={68} height={17} rx={4} />
			<text x={0} y={y - 1} textAnchor="middle">
				common
			</text>
		</g>
	);
}
