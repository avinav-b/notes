// C += A x B for n x n matrices of doubles, 8 doubles per cache block, cache much smaller than a row.
// view "grid": step through the untiled loop (one element of C per step) or the tiled loop (one T x T
// mini-multiplication per step); misses are marked on the cells and counted on a shared-scale bar.
// view "totals": total misses 9n^3/8 vs n^3/(4T) as bars, with sliders for n and T.
import { useState } from 'react';
import { StepControls, useStepper } from './StepControls';
import s from './TilingViz.module.css';

type Mode = 'untiled' | 'tiled';
type Mark = 0 | 1 | 2 | 3 | 4; // 0 none, 1 used (hit), 2 miss, 3 loaded but unused, 4 tile in cache

interface GridProps {
	n?: number;
	T?: number;
	/** Doubles per cache block. */
	block?: number;
}

const fmtInt = (x: number) => Math.round(x).toLocaleString('en-US');

function Matrix({ n, marks, label, cur, done, tileOutline, T }: { n: number; marks: (r: number, c: number) => Mark; label: string; cur?: [number, number] | null; done?: (r: number, c: number) => boolean; tileOutline?: [number, number] | null; T: number }) {
	const CELL = 10;
	const size = n * CELL;
	const cls = [s.empty, s.used, s.miss, s.loaded, s.inCache];
	return (
		<div className={s.matrix}>
			<div className={s.mLabel}>{label}</div>
			<svg className={s.mSvg} viewBox={`-1 -1 ${size + 2} ${size + 2}`} role="img" aria-label={`matrix ${label}`}>
				<rect className={s.frame} x={0} y={0} width={size} height={size} />
				{Array.from({ length: n * n }, (_, k) => {
					const r = Math.floor(k / n);
					const c = k % n;
					const m = marks(r, c);
					const d = done?.(r, c);
					if (!m && !d) return null;
					return <rect key={k} className={m ? cls[m] : s.done} x={c * CELL + 0.5} y={r * CELL + 0.5} width={CELL - 1} height={CELL - 1} />;
				})}
				{/* tile grid */}
				{Array.from({ length: n / T - 1 }, (_, i) => (
					<g key={i}>
						<line className={s.tileLine} x1={(i + 1) * T * CELL} x2={(i + 1) * T * CELL} y1={0} y2={size} />
						<line className={s.tileLine} y1={(i + 1) * T * CELL} y2={(i + 1) * T * CELL} x1={0} x2={size} />
					</g>
				))}
				{tileOutline && (
					<rect className={s.tileCur} x={tileOutline[1] * T * CELL} y={tileOutline[0] * T * CELL} width={T * CELL} height={T * CELL} />
				)}
				{cur && <rect className={s.cur} x={cur[1] * CELL} y={cur[0] * CELL} width={CELL} height={CELL} />}
			</svg>
		</div>
	);
}

function Grid({ n = 24, T = 8, block = 8 }: GridProps) {
	const [mode, setMode] = useState<Mode>('untiled');
	const nt = n / T;
	const untiledTotal = (n * n * (n / block + n)) | 0;
	const perTile = (2 * T * T) / block;
	const tiledTotal = nt * nt * nt * perTile;
	const last = mode === 'untiled' ? n * n : nt * nt * nt;
	const stepper = useStepper(last, { intervalMs: mode === 'untiled' ? 450 : 1000 });
	const step = Math.min(stepper.step, last);
	const k = step - 1; // index of the current unit of work (-1 = nothing yet)

	let A: (r: number, c: number) => Mark = () => 0;
	let B: (r: number, c: number) => Mark = () => 0;
	let Cm: (r: number, c: number) => Mark = () => 0;
	let done: (r: number, c: number) => boolean = () => false;
	let cur: [number, number] | null = null;
	let tA: [number, number] | null = null;
	let tB: [number, number] | null = null;
	let tC: [number, number] | null = null;
	let misses = 0;
	let message = mode === 'untiled' ? 'Each step computes one element of C.' : 'Each step is one T x T mini-multiplication.';

	if (mode === 'untiled' && k >= 0) {
		const i = Math.floor(k / n);
		const j = k % n;
		cur = [i, j];
		const jb = Math.floor(j / block) * block;
		A = (r, c) => (r === i ? (c % block === 0 ? 2 : 1) : 0);
		B = (r, c) => (c === j ? 2 : c >= jb && c < jb + block ? 3 : 0);
		done = (r, c) => r * n + c < k;
		misses = (k + 1) * (n / block + n);
		message = `C[${i}][${j}]: row ${i} of A (${n / block} misses) times column ${j} of B (${n} misses).`;
	}
	if (mode === 'tiled' && k >= 0) {
		const I = Math.floor(k / (nt * nt));
		const J = Math.floor(k / nt) % nt;
		const K = k % nt;
		tA = [I, K];
		tB = [K, J];
		tC = [I, J];
		const inTile = (t: [number, number], r: number, c: number) => Math.floor(r / T) === t[0] && Math.floor(c / T) === t[1];
		A = (r, c) => (inTile([I, K], r, c) ? (c % block === 0 ? 2 : 4) : 0);
		B = (r, c) => (inTile([K, J], r, c) ? (c % block === 0 ? 2 : 4) : 0);
		Cm = (r, c) => (inTile([I, J], r, c) ? 4 : 0);
		done = (r, c) => {
			const t = Math.floor(r / T) * nt + Math.floor(c / T);
			return t < I * nt + J;
		};
		misses = (k + 1) * perTile;
		message = `TC${I}${J} += TA${I}${K} × TB${K}${J}: load 2 tiles, ${perTile} misses.`;
	}

	const total = mode === 'untiled' ? untiledTotal : tiledTotal;
	const perElem = total / (n * n);
	const pct = (x: number) => `${(x / untiledTotal) * 100}%`;

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={mode === 'untiled' ? `C element ${Math.max(k + 1, 0)} / ${n * n}` : `tile step ${Math.max(k + 1, 0)} / ${last}`}>
				{(['untiled', 'tiled'] as const).map((m) => (
					<button
						key={m}
						className={`viz-btn ${m === mode ? s.modeOn : ''}`}
						aria-pressed={m === mode}
						onClick={() => {
							setMode(m);
							stepper.reset();
						}}
					>
						{m === 'untiled' ? 'Untiled' : `Tiled (T = ${T})`}
					</button>
				))}
			</StepControls>
			<p className={s.message}>{message}</p>

			<div className={s.eq}>
				<Matrix n={n} T={T} label="C" marks={Cm} cur={cur} done={done} tileOutline={tC} />
				<span className={s.op}>+=</span>
				<Matrix n={n} T={T} label="A" marks={A} tileOutline={tA} />
				<span className={s.op}>×</span>
				<Matrix n={n} T={T} label="B" marks={B} tileOutline={tB} />
			</div>

			<div className={s.bars}>
				<div className={s.barRow}>
					<span className={s.barName}>per element</span>
					<div className={s.track}>
						<div className={s.fillNow} style={{ width: `${(perElem / (n / block + n)) * 100}%` }} />
					</div>
					<span className={s.barVal}>{mode === 'untiled' ? `9n/8 = ${perElem}` : `n/(4T) = ${perElem}`}</span>
				</div>
				<div className={s.barRow}>
					<span className={s.barName}>so far</span>
					<div className={s.track}>
						<div className={s.ghost} style={{ width: pct(total) }} />
						<div className={s.fill} style={{ width: pct(misses) }} />
					</div>
					<span className={s.barVal}>
						{fmtInt(misses)} / {fmtInt(total)}
					</span>
				</div>
			</div>

			<p className={s.scaleNote}>Both modes use the same scale: full width is the untiled total.</p>
			<div className={s.legend}>
				<span className={s.lgMiss}>miss (new block)</span>
				{mode === 'untiled' ? (
					<>
						<span className={s.lgUsed}>hit</span>
						<span className={s.lgLoaded}>rest of the block: loaded, evicted unused</span>
					</>
				) : (
					<span className={s.lgCache}>tile in cache (hits)</span>
				)}
				<span className={s.lgDone}>C done</span>
				<span className={s.lgCur}>current</span>
			</div>
		</div>
	);
}

interface TotalsProps {
	/** Cache capacity in bytes that the three tiles must fit in. */
	cacheBytes?: number;
	cacheName?: string;
}

function Totals({ cacheBytes = 32 * 1024, cacheName = 'L1' }: TotalsProps) {
	const NS = [64, 128, 256, 512, 1024, 2048, 4096];
	const [ni, setNi] = useState(4);
	const [T, setT] = useState(8);
	const n = NS[ni];
	const untiled = (9 / 8) * n ** 3;
	const tiled = n ** 3 / (4 * T);
	const tileBytes = 3 * T * T * 8;
	const fits = tileBytes <= cacheBytes;
	const sci = (x: number) => {
		if (x < 1e6) return fmtInt(x);
		const e = Math.floor(Math.log10(x));
		const sup = String(e).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
		return `${(x / 10 ** e).toFixed(2)} × 10${sup}`;
	};
	const kb = (b: number) => `${(b / 1024).toFixed(b % 1024 ? 1 : 0)} KB`;

	return (
		<div className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.sliders}`}>
				<label>
					<span>n</span>
					<input type="range" min={0} max={NS.length - 1} step={1} value={ni} onChange={(e) => setNi(Number(e.target.value))} aria-label="Matrix size n" />
					<span className={s.sliderVal}>{n}</span>
				</label>
				<label>
					<span>T</span>
					<input type="range" min={8} max={64} step={8} value={T} onChange={(e) => setT(Number(e.target.value))} aria-label="Tile size T" />
					<span className={s.sliderVal}>{T}</span>
				</label>
			</div>
			<div className={s.bars}>
				<div className={s.barRow}>
					<span className={s.barName}>untiled</span>
					<div className={s.track}>
						<div className={s.fill} style={{ width: '100%' }} />
					</div>
					<span className={s.barVal}>9n³/8 = {sci(untiled)}</span>
				</div>
				<div className={s.barRow}>
					<span className={s.barName}>tiled</span>
					<div className={s.track}>
						<div className={s.fillOk} style={{ width: `${(tiled / untiled) * 100}%` }} />
					</div>
					<span className={s.barVal}>n³/(4T) = {sci(tiled)}</span>
				</div>
			</div>
			<p className={s.ratio}>
				Tiled has <b>{(untiled / tiled).toFixed(0)}x</b> fewer misses (4.5T, whatever n is).
			</p>
			<div className={s.barRow}>
				<span className={s.barName}>3 tiles</span>
				<div className={s.track}>
					<div className={fits ? s.fillCache : s.fill} style={{ width: `${Math.min(100, (tileBytes / cacheBytes) * 100)}%` }} />
				</div>
				<span className={`${s.barVal} ${fits ? '' : s.bad}`}>
					3T² × 8 B = {kb(tileBytes)} of {kb(cacheBytes)} {cacheName}
				</span>
			</div>
			{!fits && <p className={s.warn}>The three tiles no longer fit in the cache, so the analysis no longer holds.</p>}
		</div>
	);
}

export default function TilingViz({ view = 'grid', ...rest }: { view?: 'grid' | 'totals' } & GridProps & TotalsProps) {
	return view === 'totals' ? <Totals {...rest} /> : <Grid {...rest} />;
}
