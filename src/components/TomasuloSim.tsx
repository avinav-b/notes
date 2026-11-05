import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronsRight } from 'lucide-react';
import { StepControls, useStepper } from './StepControls';
import { simulate, type Entry, type Frame, type Parsed, type SimConfig, type StationGroup } from './tomasulo';
import t from './OooTables.module.css';
import s from './TomasuloSim.module.css';

interface Props extends SimConfig {
	/** Map-table rows to show (default: every register the program names). */
	regs?: string[];
	/** Show the register file's value next to each map-table tag. */
	showRegfile?: boolean;
	/** One-line explanations for particular cycles (replace the automatic summary). */
	notes?: Record<number, string>;
	/** Message before cycle 1. */
	intro?: string;
	/** Draw a rule above these instruction rows (e.g. the start of each loop iteration). */
	breaks?: number[];
}

interface Line {
	key: string;
	d: string;
	src?: boolean;
	delay: number;
}

const names = (idx: number[], insns: Parsed[]) => idx.map((i) => insns[i].name).join(', ');
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

function describe(f: Frame, insns: Parsed[]): string {
	const ev = f.events;
	const parts: string[] = [];
	if (f.cdb) parts.push(`${f.cdb.tag} broadcasts ${f.cdb.value}`);
	const quiet = ev.written.filter((i) => !f.cdb || f.cdb.insn !== i);
	if (quiet.length) parts.push(`${names(quiet, insns)} complete${quiet.length === 1 ? 's' : ''}`);
	if (ev.issued.length) parts.push(`${names(ev.issued, insns)} issue${ev.issued.length === 1 ? 's' : ''}`);
	if (ev.dispatched !== null) parts.push(`${insns[ev.dispatched].name} dispatches to ${f.rows[ev.dispatched].rs}`);
	if (ev.stalled !== null) parts.push(`${insns[ev.stalled].name} stalls in D: no free RS`);
	if (ev.lostCdb.length) parts.push(`${names(ev.lostCdb, insns)} waits for the CDB`);
	if (!parts.length && ev.finished.length) parts.push(`${names(ev.finished, insns)} finishes executing`);
	if (!parts.length) {
		const busy = f.rows.map((r, i) => (r.state.k === 'exec' ? i : -1)).filter((i) => i >= 0);
		parts.push(busy.length ? `no change: ${names(busy, insns)} still executing` : 'no change');
	}
	return cap(parts.join('; ')) + '.';
}

/** Cycles where anything visible happens (for "Next event"). */
const eventful = (f: Frame) => {
	const ev = f.events;
	return Boolean(f.cdb || ev.dispatched !== null || ev.issued.length || ev.finished.length || ev.written.length || ev.lostCdb.length || (ev.stalled !== null && f.changed.size));
};

export default function TomasuloSim(props: Props) {
	const { notes = {}, intro = 'Nothing has dispatched yet. Step to start cycle 1.', breaks = [], showRegfile = false } = props;
	const sim = useMemo(() => simulate(props), [JSON.stringify(props)]);
	const regs = props.regs ?? sim.regs;
	const last = sim.frames.length - 1;
	const stepper = useStepper(last, { intervalMs: 1500 });
	const step = Math.min(stepper.step, last);
	const f = sim.frames[step];
	const insns = sim.insns;

	const message = step === 0 ? intro : (notes[step] ?? describe(f, insns));

	const nextEvent = () => {
		for (let c = step + 1; c <= last; c++) if (eventful(sim.frames[c])) return stepper.setStep(c);
		stepper.setStep(last);
	};

	// Targets of this cycle's broadcast; with the register file shown, map hits land on the value cell.
	const targets = f.targets.map((id) => (showRegfile && id.startsWith('map-') ? id.replace(/-t$/, '-v') : id));
	const hit = new Set(targets);
	const cellCls = (id: string, extra?: string) => [extra, hit.has(id) ? t.hit : f.changed.has(id) ? t.chg : undefined].filter(Boolean).join(' ') || undefined;

	// ---------- Broadcast lines: measured from the rendered tables ----------
	const boardRef = useRef<HTMLDivElement>(null);
	const [geo, setGeo] = useState<{ w: number; h: number; lines: Line[] }>({ w: 0, h: 0, lines: [] });
	useLayoutEffect(() => {
		const board = boardRef.current;
		if (!board) return;
		const measure = () => {
			const b = board.getBoundingClientRect();
			const bus = board.querySelector('[data-bus]')?.getBoundingClientRect();
			const lines: Line[] = [];
			if (bus && f.cdb) {
				const busY = bus.top + bus.height / 2 - b.top;
				const route = (id: string, key: string, src: boolean, delay: number) => {
					const el = board.querySelector(`[data-cell="${id}"]`) as HTMLElement | null;
					if (!el) return;
					const r = el.getBoundingClientRect();
					const cx = r.left + r.width / 2 - b.left;
					const top = r.top - b.top;
					if (src) {
						// From the producer's row, out to the gutter left of its panel, then to the bus.
						const panel = (el.closest('[data-panel]') as HTMLElement | null)?.getBoundingClientRect() ?? r;
						const gx = Math.max(3, panel.left - b.left - 6);
						const y = r.top + r.height / 2 - b.top;
						lines.push({ key, src, delay, d: `M${r.left - b.left},${y} L${gx},${y} L${gx},${busY}` });
					} else if (top > busY) {
						lines.push({ key, src, delay, d: `M${cx},${busY} L${cx},${top}` });
					} else {
						// Above the bus: come up the gutter left of the panel, then turn into the cell.
						const panel = (el.closest('[data-panel]') as HTMLElement | null)?.getBoundingClientRect() ?? r;
						const gx = Math.max(3, panel.left - b.left - 6);
						const y = r.top + r.height / 2 - b.top;
						lines.push({ key, src, delay, d: `M${gx},${busY} L${gx},${y} L${r.left - b.left},${y}` });
					}
				};
				route(`rs-${f.cdb.tag}-name`, 'src', true, 0);
				targets.forEach((id, k) => route(id, id, false, 350 + k * 60));
			}
			setGeo({ w: b.width, h: b.height, lines });
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(board);
		return () => ro.disconnect();
	}, [step, showRegfile]);

	// ---------- Tables ----------
	const rsGroups = props.stations.map((g, gi) => ({ g, gi })).filter(({ g }) => g.layout === 'rs');
	const lsGroups = props.stations.map((g, gi) => ({ g, gi })).filter(({ g }) => g.layout !== 'rs');
	const hasStore = lsGroups.some(({ g }) => g.layout === 'store');
	const showT = f.entries.some((e) => e.fu);
	const entriesOf = (groups: { gi: number }[]) => f.entries.filter((e) => groups.some((x) => x.gi === e.group));

	const opCell = (e: Entry, k: number, kind: 'q' | 'v') => {
		const qid = `rs-${e.tag}-q${k}`;
		const vid = `rs-${e.tag}-v${k}`;
		const o = e.ops[k];
		if (kind === 'q') {
			const ghost = f.ghosts[qid];
			return (
				<td data-cell={qid} className={cellCls(qid)}>
					{o?.tag ? <span className={t.tag}>{o.tag}</span> : ghost ? <span className={t.ghost}>{ghost}</span> : null}
				</td>
			);
		}
		return (
			<td data-cell={vid} className={cellCls(vid)}>
				{o && !o.tag ? o.value : null}
			</td>
		);
	};

	const nameCell = (e: Entry, label: string) => (
		<td data-cell={`rs-${e.tag}-name`} className={cellCls(`rs-${e.tag}-name`, t.strong)}>
			{label}
		</td>
	);

	const rowCls = (e: Entry) => (f.changed.has(`rs-${e.tag}-row`) ? s.rowChg : undefined);

	const insnPanel = (
		<Panel area="insn" title="Instruction status">
			<table className={t.table}>
				<thead>
					<tr>
						<th>Insn</th>
						{['D', 'S', 'X', 'W'].map((h) => (
							<th key={h} className={t.num}>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{insns.map((p, i) => {
						const r = f.rows[i];
						const st = r.state;
						const cell = (col: 'd' | 's' | 'x' | 'w', content: ReactNode) => {
							const id = `ins-${i}-${col}`;
							return (
								<td key={col} data-cell={id} className={cellCls(id, t.num)}>
									{content}
								</td>
							);
						};
						const num = (v?: number) => (v !== undefined ? `c${v}` : null);
						const active = f.events.dispatched === i || f.events.issued.includes(i) || f.events.written.includes(i) || f.events.finished.includes(i);
						return (
							<tr key={i} className={breaks.includes(i) ? t.groupStart : undefined}>
								<td className={[s.insn, active ? s.insnActive : r.d === undefined ? t.dim : undefined].filter(Boolean).join(' ')}>{p.text}</td>
								{cell('d', st.k === 'stall' ? <span className={t.blocked}>RS full</span> : num(r.d))}
								{cell('s', r.s !== undefined ? num(r.s) : st.k === 'raw' && r.d !== undefined && r.d < f.cycle ? <span className={t.waiting}>wait</span> : st.k === 'branch' ? <span className={t.blocked}>branch</span> : null)}
								{cell(
									'x',
									r.x !== undefined ? (
										num(r.x)
									) : st.k === 'exec' ? (
										<span className={t.progress} title={`executing: ${st.done} of ${st.lat} cycles`}>
											<span className={t.progressFill} style={{ width: `${(100 * st.done) / st.lat}%` }} />
											<span className={t.progressText}>
												{st.done}/{st.lat}
											</span>
										</span>
									) : st.k === 'mem' ? (
										<span className={t.blocked}>mem</span>
									) : null,
								)}
								{cell('w', r.w !== undefined ? num(r.w) : st.k === 'cdb' ? <span className={t.blocked}>CDB</span> : null)}
							</tr>
						);
					})}
				</tbody>
			</table>
		</Panel>
	);

	const mapPanel = (
		<Panel area="map" title="Map table">
			<table className={t.table}>
				<thead>
					<tr>
						<th>Reg</th>
						<th>T</th>
						{showRegfile && <th>Reg file</th>}
					</tr>
				</thead>
				<tbody>
					{regs.map((r) => {
						const tid = `map-${r}-t`;
						const vid = `map-${r}-v`;
						const tag = f.map[r];
						const ghost = f.ghosts[tid];
						return (
							<tr key={r}>
								<td className={t.strong}>{r}</td>
								<td data-cell={tid} className={cellCls(tid)}>
									{tag ? <span className={t.tag}>{tag}</span> : ghost ? <span className={t.ghost}>{ghost}</span> : null}
									{f.stale?.reg === r && (
										<span className={s.stale} title={`${f.stale.tag} broadcast, but ${r} now maps to ${tag ?? 'the register file'}: not written`}>
											≠ {f.stale.tag}
										</span>
									)}
								</td>
								{showRegfile && (
									<td data-cell={vid} className={cellCls(vid)}>
										{f.regfile[r]}
									</td>
								)}
							</tr>
						);
					})}
				</tbody>
			</table>
		</Panel>
	);

	const rsEntries = entriesOf(rsGroups);
	const rsPanel = rsEntries.length > 0 && (
		<Panel area="rs" title={rsGroups[0].g.title ?? 'Reservation stations'}>
			<table className={t.table}>
				<thead>
					<tr>
						{showT && <th>T</th>}
						<th>FU</th>
						<th>busy</th>
						<th>op</th>
						<th>Qj</th>
						<th>Qk</th>
						<th>Vj</th>
						<th>Vk</th>
					</tr>
				</thead>
				<tbody>
					{rsEntries.map((e) => (
						<tr key={e.tag} className={rowCls(e)}>
							{showT ? (
								<>
									{nameCell(e, e.tag)}
									<td>{e.fu}</td>
								</>
							) : (
								nameCell(e, e.tag)
							)}
							<td className={e.busy ? undefined : t.dim}>{e.busy ? 'yes' : 'no'}</td>
							<td>{e.op}</td>
							{opCell(e, 0, 'q')}
							{opCell(e, 1, 'q')}
							{opCell(e, 0, 'v')}
							{opCell(e, 1, 'v')}
						</tr>
					))}
				</tbody>
			</table>
		</Panel>
	);

	const addr = (e: Entry) => {
		const [imm, base] = e.ops;
		if (!base || base.tag) return null;
		const n = Number(base.value);
		return Number.isFinite(n) ? String(n + Number(imm.value)) : `${imm.value}+${base.value}`;
	};
	const lsEntries = entriesOf(lsGroups);
	const lsPanel = lsEntries.length > 0 && (
		<Panel area="ls" title={lsGroups[0].g.title ?? (hasStore ? 'Load / store buffers' : 'Load buffers')}>
			<table className={t.table}>
				<thead>
					<tr>
						<th></th>
						<th>busy</th>
						<th>Addr</th>
						{hasStore && <th>Data</th>}
					</tr>
				</thead>
				<tbody>
					{lsEntries.map((e) => {
						const isStore = props.stations[e.group].layout === 'store';
						// The address comes from operand 1 (the base register); a store's data is operand 0.
						const aid = `rs-${e.tag}-v1`;
						const did = `rs-${e.tag}-v0`;
						const base = e.ops[1];
						const data = e.ops[0];
						const ghostA = f.ghosts[`rs-${e.tag}-q1`];
						const ghostD = f.ghosts[`rs-${e.tag}-q0`];
						return (
							<tr key={e.tag} className={rowCls(e)}>
								{nameCell(e, e.tag)}
								<td className={e.busy ? undefined : t.dim}>{e.busy ? 'yes' : 'no'}</td>
								<td data-cell={aid} className={cellCls(aid)}>
									{e.busy && base?.tag ? (
										<span className={t.tag}>{base.tag}</span>
									) : (
										<>
											{ghostA && <span className={`${t.ghost} ${s.ghostGap}`}>{ghostA}</span>}
											{e.busy ? addr(e) : null}
										</>
									)}
								</td>
								{hasStore && (
									<td data-cell={did} className={cellCls(did)}>
										{isStore && e.busy ? (
											data?.tag ? (
												<span className={t.tag}>{data.tag}</span>
											) : (
												<>
													{ghostD && <span className={`${t.ghost} ${s.ghostGap}`}>{ghostD}</span>}
													{data?.value}
												</>
											)
										) : null}
									</td>
								)}
							</tr>
						);
					})}
				</tbody>
			</table>
		</Panel>
	);

	const cdbPanel = (
		<div className={s.cdbRow} style={{ gridArea: 'cdb' }}>
			<div className={`${s.cdbBox} ${f.cdb ? s.cdbOn : ''}`} data-cell="cdb">
				<span className={s.cdbLabel}>CDB</span>
				<span className={s.cdbField}>
					<span className={s.cdbKey}>T</span>
					{f.cdb ? f.cdb.tag : ''}
				</span>
				<span className={s.cdbField}>
					<span className={s.cdbKey}>V</span>
					{f.cdb ? f.cdb.value : ''}
				</span>
			</div>
			<div className={`${s.bus} ${f.cdb ? s.busOn : ''}`} data-bus key={f.cdb ? `on${step}` : 'off'} />
		</div>
	);

	return (
		<div className={`not-content ${s.root}`} {...stepper.keyProps}>
			<StepControls stepper={stepper} counter={`cycle ${f.cycle}`}>
				<button className="viz-btn" onClick={nextEvent} disabled={step >= last} title="Jump to the next cycle where something happens">
					<ChevronsRight size={15} />
					Next event
				</button>
				<label className={s.scrub}>
					<span>cycle</span>
					<input type="range" min={0} max={last} value={step} onChange={(e) => stepper.setStep(Number(e.target.value))} aria-label="Cycle" />
				</label>
			</StepControls>

			<p className={s.message}>{message}</p>

			<div className={s.scroll}>
				<div className={`${s.board} ${lsPanel ? s.withLs : s.noLs}`} ref={boardRef}>
					{insnPanel}
					{mapPanel}
					{cdbPanel}
					{rsPanel}
					{lsPanel}
					<svg className={s.overlay} width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w || 1} ${geo.h || 1}`} aria-hidden="true">
						<defs>
							<marker id="tm-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
								<path d="M0,0 L10,5 L0,10 z" className={s.head} />
							</marker>
						</defs>
						{geo.lines.map((l) => (
							<path
								key={`${step}-${l.key}`}
								d={l.d}
								pathLength={1}
								className={l.src ? s.lineSrc : s.line}
								style={{ animationDelay: `${l.delay}ms` }}
								markerEnd={l.src ? undefined : 'url(#tm-head)'}
							/>
						))}
					</svg>
				</div>
			</div>

			<div className={t.legend}>
				<span>
					<span className={t.tag}>Add1</span> tag: waiting for that RS's result
				</span>
				<span>
					<span className={t.swatchLine} /> CDB broadcast
				</span>
				<span>
					<span className={`${t.swatch} ${t.swatchChg}`} /> changed this cycle
				</span>
				<span>
					<span className={t.blocked}>RS full</span> stalled or blocked
				</span>
				{sim.frames.some((x) => x.stale) && (
					<span>
						<span className={s.stale}>≠ tag</span> renamed since: broadcast not written
					</span>
				)}
			</div>
		</div>
	);
}

function Panel({ area, title, children }: { area: string; title: string; children: ReactNode }) {
	return (
		<div className={t.panel} style={{ gridArea: area }} data-panel={area}>
			<div className={t.panelTitle}>{title}</div>
			{children}
		</div>
	);
}

export type { StationGroup };
