// Two-bit saturating counter: the 4-state machine from lecture (11 TT, 10 TN on top predict taken;
// 01 NT, 00 NN on the bottom predict not taken). `FsmDiagram` is the drawing on its own (also used by
// BranchPredictorSim); the default export lets you feed T / N outcomes and watch the state move.
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import s from './CounterFsm.module.css';

/** Counter value 0..3 = NN, NT, TN, TT (strongly not taken .. strongly taken). */
export type CounterState = 0 | 1 | 2 | 3;
export type Outcome = 'T' | 'N';

export const nextState = (v: CounterState, o: Outcome): CounterState => (o === 'T' ? Math.min(3, v + 1) : Math.max(0, v - 1)) as CounterState;

const STATES: { v: CounterState; bits: string; name: string; x: number; y: number }[] = [
	{ v: 3, bits: '11', name: 'TT', x: 130, y: 62 },
	{ v: 2, bits: '10', name: 'TN', x: 370, y: 62 },
	{ v: 0, bits: '00', name: 'NN', x: 130, y: 192 },
	{ v: 1, bits: '01', name: 'NT', x: 370, y: 192 },
];
const RX = 78;
const RY = 32;

// Every transition: from state, outcome, path, label position.
const EDGES: { from: CounterState; o: Outcome; d: string; lx: number; ly: number }[] = [
	{ from: 3, o: 'T', d: 'M58,48 C10,20 10,104 58,76', lx: 16, ly: 66 },
	{ from: 3, o: 'N', d: 'M200,76 L298,76', lx: 249, ly: 92 },
	{ from: 2, o: 'T', d: 'M298,48 L200,48', lx: 249, ly: 40 },
	{ from: 2, o: 'N', d: 'M342,93 L342,161', lx: 330, ly: 131 },
	{ from: 1, o: 'T', d: 'M398,161 L398,93', lx: 410, ly: 131 },
	{ from: 1, o: 'N', d: 'M298,178 L200,178', lx: 249, ly: 170 },
	{ from: 0, o: 'T', d: 'M200,206 L298,206', lx: 249, ly: 223 },
	{ from: 0, o: 'N', d: 'M58,178 C10,150 10,234 58,206', lx: 16, ly: 196 },
];

interface DiagramProps {
	state: CounterState;
	/** The transition just taken, highlighted; `tick` restarts its animation. */
	edge?: { from: CounterState; o: Outcome } | null;
	tick?: number;
}

export function FsmDiagram({ state, edge, tick = 0 }: DiagramProps) {
	return (
		<svg className={s.svg} viewBox="0 0 540 245" role="img" aria-label={`Two-bit counter in state ${STATES.find((x) => x.v === state)!.bits}`}>
			<defs>
				<marker id="fsm-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
					<path d="M0,0 L10,5 L0,10 z" className={s.headPlain} />
				</marker>
				<marker id="fsm-head-on" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
					<path d="M0,0 L10,5 L0,10 z" className={s.headOn} />
				</marker>
			</defs>

			{/* Prediction bands */}
			<rect className={s.bandT} x={40} y={22} width={490} height={82} rx={10} />
			<rect className={s.bandN} x={40} y={152} width={490} height={82} rx={10} />
			<text className={s.band} x={492} y={60} textAnchor="middle">predict</text>
			<text className={`${s.band} ${s.bandBig}`} x={492} y={80} textAnchor="middle">T</text>
			<text className={s.band} x={492} y={190} textAnchor="middle">predict</text>
			<text className={`${s.band} ${s.bandBig}`} x={492} y={210} textAnchor="middle">N</text>

			{EDGES.map((e) => {
				const on = edge && edge.from === e.from && edge.o === e.o;
				return (
					<g key={`${e.from}${e.o}`} className={on ? s.edgeOn : s.edge}>
						<path d={e.d} markerEnd={`url(#${on ? 'fsm-head-on' : 'fsm-head'})`} />
						<text x={e.lx} y={e.ly} textAnchor="middle">
							{e.o}
						</text>
					</g>
				);
			})}

			{STATES.map((st) => {
				const cur = st.v === state;
				return (
					<g key={st.v} className={cur ? s.stateOn : s.state}>
						<ellipse cx={st.x} cy={st.y} rx={RX} ry={RY} />
						<text className={s.bits} x={st.x} y={st.y + 2} textAnchor="middle">
							{st.bits}
						</text>
						<text className={s.name} x={st.x} y={st.y + 21} textAnchor="middle">
							{st.v === 3 ? 'strong T' : st.v === 2 ? 'weak T' : st.v === 1 ? 'weak N' : 'strong N'}
						</text>
					</g>
				);
			})}

			{/* A dot that travels along the transition just taken. */}
			{edge && (
				<circle key={tick} className={s.token} r={6}>
					<animateMotion dur="0.6s" fill="freeze" path={EDGES.find((e) => e.from === edge.from && e.o === edge.o)!.d} calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1" />
				</circle>
			)}
		</svg>
	);
}

interface Props {
	/** Starting state (0 = NN .. 3 = TT). */
	initial?: CounterState;
}

export default function CounterFsm({ initial = 0 }: Props) {
	const [hist, setHist] = useState<{ o: Outcome; pred: Outcome; from: CounterState }[]>([]);
	const state = hist.reduce<CounterState>((v, h) => nextState(v, h.o), initial);
	const last = hist[hist.length - 1];
	const pred: Outcome = state >= 2 ? 'T' : 'N';
	const misses = hist.filter((h) => h.o !== h.pred).length;

	const feed = (o: Outcome) => setHist((h) => [...h, { o, pred, from: state }].slice(-40));

	return (
		<div className={`not-content ${s.root}`}>
			<div className={`viz-controls ${s.bar}`}>
				<span className={s.feedLabel}>Outcome</span>
				<button className="viz-primary" onClick={() => feed('T')}>
					Taken
				</button>
				<button className="viz-primary" onClick={() => feed('N')}>
					Not taken
				</button>
				<button onClick={() => setHist([])} disabled={!hist.length} aria-label="Reset">
					<RotateCcw size={15} /> Reset
				</button>
			</div>

			<div className={s.predLine}>
				Next prediction <b className={pred === 'T' ? s.predT : s.predN}>{pred}</b>
			</div>

			<FsmDiagram state={state} edge={last ? { from: last.from, o: last.o } : null} tick={hist.length} />

			<div className={s.strip} aria-label="Outcomes so far">
				<span className={s.stripLabel}>predicted</span>
				<span className={s.cells}>
					{hist.map((h, k) => (
						<i key={k} className={h.o === h.pred ? s.hit : s.miss}>
							{h.pred}
						</i>
					))}
				</span>
				<span className={s.stripLabel}>outcome</span>
				<span className={s.cells}>
					{hist.map((h, k) => (
						<i key={k} className={s.out}>
							{h.o}
						</i>
					))}
				</span>
			</div>
			<div className={s.legend}>
				<span>
					<i className={s.lgHit} /> correct
				</span>
				<span>
					<i className={s.lgMiss} /> mispredicted
				</span>
				<span>
					{misses} / {hist.length} mispredicted
				</span>
			</div>
		</div>
	);
}
