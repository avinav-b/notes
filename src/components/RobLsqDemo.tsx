// ROB + LSQ working together: instructions enter at the tail, complete out of order, and leave from
// the head in order. Stores sit in the LSQ until they retire; a younger load to the same address gets
// its value forwarded from the LSQ. An optional exception mode flushes everything from the faulting
// instruction on. The step list (dispatch / complete / retire / fault) is data, so the program and
// order can change through props.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Check, TriangleAlert } from "lucide-react";
import { StepControls, useStepper } from "./StepControls";
import s from "./RobLsqDemo.module.css";

interface DemoInsn {
  /** Short label shown in the program list, e.g. "ld r1 ← [B]". */
  text: string;
  kind: "load" | "store" | "alu";
  dest?: string;
  addr?: string;
  /** Store data, or an ALU result. */
  value?: number;
}

type Ev = { t: "D" | "C" | "R" | "X"; i: number };

interface Props {
  program?: DemoInsn[];
  mem?: Record<string, number>;
  /** Normal order of events, e.g. "D1 D2 C3 R1". X = the instruction at the head raises its exception. */
  steps?: string;
  /** Same, for the exception scenario (omit to hide the toggle). */
  faultSteps?: string;
  /** Instruction (1-based) whose completion raises the exception in the exception scenario. */
  faultInsn?: number;
  notes?: string[];
  faultNotes?: string[];
}

const DEFAULT_PROGRAM: DemoInsn[] = [
  { text: "ld  r1 ← [B]", kind: "load", dest: "r1", addr: "B" },
  { text: "st  7 → [A]", kind: "store", addr: "A", value: 7 },
  { text: "add r3 ← r4+r5", kind: "alu", dest: "r3", value: 9 },
  { text: "ld  r6 ← [A]", kind: "load", dest: "r6", addr: "A" },
];

type Status = "wait" | "flight" | "done" | "retired" | "flushed";

interface Frame {
  status: Status[];
  value: (number | undefined)[]; // result (loads, ALU) or store data once complete
  fault: boolean[];
  order: number[]; // live instruction indices, oldest first
  mem: Record<string, number>;
  regs: Record<string, number | undefined>;
  ev?: Ev;
  /** For a load completion: where its value came from. */
  from?: { kind: "lsq"; store: number } | { kind: "mem" };
}

const parse = (str: string): Ev[] =>
  str
    .trim()
    .split(/\s+/)
    .map((tok) => ({ t: tok[0] as Ev["t"], i: Number(tok.slice(1)) - 1 }));

function replay(
  program: DemoInsn[],
  mem0: Record<string, number>,
  events: Ev[],
  faultInsn?: number,
): Frame[] {
  const n = program.length;
  let f: Frame = {
    status: new Array(n).fill("wait"),
    value: new Array(n).fill(undefined),
    fault: new Array(n).fill(false),
    order: [],
    mem: { ...mem0 },
    regs: Object.fromEntries(
      program.filter((p) => p.dest).map((p) => [p.dest!, undefined]),
    ),
  };
  const frames: Frame[] = [f];
  for (const ev of events) {
    f = {
      ...f,
      status: [...f.status],
      value: [...f.value],
      fault: [...f.fault],
      order: [...f.order],
      mem: { ...f.mem },
      regs: { ...f.regs },
      ev,
      from: undefined,
    };
    const p = program[ev.i];
    if (ev.t === "D") {
      f.status[ev.i] = "flight";
      f.order.push(ev.i);
    } else if (ev.t === "C") {
      f.status[ev.i] = "done";
      if (p.kind === "load") {
        // Youngest older store to the same address that has completed, else the D$.
        const older = f.order.slice(0, f.order.indexOf(ev.i)).reverse();
        const st = older.find(
          (j) =>
            program[j].kind === "store" &&
            program[j].addr === p.addr &&
            f.status[j] === "done",
        );
        if (st !== undefined) {
          f.value[ev.i] = f.value[st];
          f.from = { kind: "lsq", store: st };
        } else {
          f.value[ev.i] = f.mem[p.addr!];
          f.from = { kind: "mem" };
        }
      } else f.value[ev.i] = p.value;
      if (faultInsn === ev.i + 1) f.fault[ev.i] = true;
    } else if (ev.t === "R") {
      f.status[ev.i] = "retired";
      f.order.shift();
      if (p.kind === "store") f.mem[p.addr!] = f.value[ev.i]!;
      if (p.dest) f.regs[p.dest] = f.value[ev.i];
    } else if (ev.t === "X") {
      const at = f.order.indexOf(ev.i);
      for (const j of f.order.slice(at)) f.status[j] = "flushed";
      f.order = f.order.slice(0, at);
    }
    frames.push(f);
  }
  return frames;
}

// ---- Layout (SVG user units) ----
const W = 720;
const H = 292;
const PROG_X = 12;
const ROB_X = 200;
const SLOT = 82;
const BOX_W = 74;
const SLOTS = 4;
const HEAD_X = ROB_X + (SLOTS - 1) * SLOT;
const ROB_Y = 58;
const ROB_H = 58;
const LSQ_Y = 190;
const LSQ_H = 50;
const STATE_X = 568;
const STATE_W = 140;
const REG_Y = 58;
const MEM_Y = 190;
const CELL_H = 25;

const DEFAULT_NOTES = [
  "Four instructions in program order, about to dispatch.",
  "i1 dispatches: an entry at the ROB tail, and one in the LSQ.",
  "i2 (a store) dispatches into the ROB and the LSQ.",
  "i3 dispatches: ROB only, it does not touch memory.",
  "i4 dispatches: a younger load from the same address A.",
  "i3 finishes first. Its result waits in the ROB.",
  "The store completes: address and data go into the LSQ, not the D$.",
  "i4 searches the LSQ and D$ together: forward 7 from the older store.",
  "i1’s cache miss finally returns 5 from the D$.",
  "i1 is done and at the head: retire, r1 = 5.",
  "The store retires: only now does A = 7 reach the D$.",
  "i3 retires: r3 = 9.",
  "i4 retires: r6 = 7. Everything left in program order.",
];
const DEFAULT_FAULT_NOTES = [
  ...DEFAULT_NOTES.slice(0, 6),
  "The store’s address page-faults: the ROB entry is flagged, nothing else happens.",
  ...DEFAULT_NOTES.slice(7, 10),
  "Exception at the head: flush i2 and everything younger. D$ and registers untouched.",
];

export default function RobLsqDemo({
  program = DEFAULT_PROGRAM,
  mem = { A: 0, B: 5 },
  steps = "D1 D2 D3 D4 C3 C2 C4 C1 R1 R2 R3 R4",
  faultSteps = "D1 D2 D3 D4 C3 C2 C4 C1 R1 X2",
  faultInsn = 2,
  notes = DEFAULT_NOTES,
  faultNotes = DEFAULT_FAULT_NOTES,
}: Props) {
  const hasFault = Boolean(faultSteps);
  const [modeIdx, setModeIdx] = useState(0);
  // On narrow screens, drop the program column (the queues show the same instructions) so text stays readable.
  const rootRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vx = narrow ? ROB_X - 12 : 0;
  const fault = hasFault && modeIdx === 1;
  const frames = useMemo(
    () =>
      replay(
        program,
        mem,
        parse(fault ? faultSteps! : steps),
        fault ? faultInsn : undefined,
      ),
    [
      fault,
      JSON.stringify(program),
      JSON.stringify(mem),
      steps,
      faultSteps,
      faultInsn,
    ],
  );
  const last = frames.length - 1;
  const stepper = useStepper(last, { intervalMs: 1700 });
  const step = Math.min(stepper.step, last);
  const f = frames[step];
  const prev = step > 0 ? frames[step - 1] : f;
  const note = (fault ? faultNotes : notes)[step] ?? "";

  const lsqOrder = f.order.filter((i) => program[i].kind !== "alu");
  const prevLsq = prev.order.filter((i) => program[i].kind !== "alu");

  /** x of an entry in a queue: oldest at the head (right), younger to the left. */
  const queueX = (i: number, order: number[], prevOrder: number[]) => {
    const k = order.indexOf(i);
    if (k >= 0) return HEAD_X - k * SLOT;
    const st = f.status[i];
    if (st === "wait") return ROB_X - SLOT; // still to come: just left of the queue
    if (st === "retired") return HEAD_X + SLOT * 1.2; // left through the head
    return prevOrder.includes(i)
      ? HEAD_X - prevOrder.indexOf(i) * SLOT
      : HEAD_X; // flushed: fade in place
  };

  const regNames = Object.keys(f.regs);
  const memNames = Object.keys(f.mem);
  const regY = (r: string) => REG_Y + regNames.indexOf(r) * (CELL_H + 4);
  const memY = (a: string) => MEM_Y + memNames.indexOf(a) * (CELL_H + 4);

  const ev = f.ev;
  const evIs = (t: Ev["t"], i: number) => ev?.t === t && ev.i === i;

  // A value flying this step (load completion), from -> to in SVG coords.
  let flight: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    label: string;
  } | null = null;
  if (ev?.t === "C" && program[ev.i].kind === "load" && f.from) {
    const toX = queueX(ev.i, lsqOrder, prevLsq) + BOX_W / 2;
    const toY = LSQ_Y + LSQ_H / 2;
    if (f.from.kind === "lsq") {
      const sx = queueX(f.from.store, lsqOrder, prevLsq) + BOX_W / 2;
      flight = {
        x0: sx,
        y0: LSQ_Y + LSQ_H / 2,
        x1: toX,
        y1: toY,
        label: String(f.value[ev.i]),
      };
    } else {
      const addr = program[ev.i].addr!;
      flight = {
        x0: STATE_X + STATE_W - 22,
        y0: memY(addr) + CELL_H / 2,
        x1: toX,
        y1: toY,
        label: String(f.value[ev.i]),
      };
    }
  }
  const forwarding =
    ev?.t === "C" && f.from?.kind === "lsq"
      ? (f.from as { store: number }).store
      : undefined;

  const statusCls: Record<Status, string> = {
    wait: s.stWait,
    flight: s.stFlight,
    done: s.stDone,
    retired: s.stRetired,
    flushed: s.stFlushed,
  };

  const resultText = (i: number) => {
    const p = program[i];
    if (f.fault[i]) return "fault";
    if (f.status[i] === "flight") return "waiting";
    if (p.kind === "store") return `[${p.addr}] = ${f.value[i]}`;
    return `${p.dest} = ${f.value[i]}`;
  };

  return (
    <div
      className={`not-content ${s.root}`}
      ref={rootRef}
      {...stepper.keyProps}
    >
      <StepControls stepper={stepper} counter={`step ${step} / ${last}`}>
        {hasFault && (
          <div className={s.seg} role="group" aria-label="Scenario">
            {["Normal", "Store faults"].map((label, k) => (
              <button
                key={label}
                className={modeIdx === k ? s.segOn : ""}
                aria-pressed={modeIdx === k}
                onClick={() => setModeIdx(k)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </StepControls>

      <p className={s.message}>{note}</p>

      <div className={s.scroll}>
        <svg
          className={`${s.svg} ${narrow ? s.svgNarrow : ""}`}
          viewBox={`${vx} 0 ${W - vx} ${H}`}
          role="img"
          aria-label="Reorder buffer and load/store queue"
        >
          <defs>
            <marker
              id="rl-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={s.headAccent} />
            </marker>
          </defs>

          {/* Program list */}
          <text className={s.section} x={PROG_X} y={28}>
            program
          </text>
          {program.map((p, i) => (
            <g
              key={i}
              className={`${s.progRow} ${statusCls[f.status[i]]} ${ev?.i === i ? s.progCur : ""}`}
            >
              <rect
                className={s.progBg}
                x={PROG_X - 4}
                y={ROB_Y - 8 + i * 34}
                width={168}
                height={28}
                rx={6}
              />
              <circle
                className={s.progDot}
                cx={PROG_X + 8}
                cy={ROB_Y + 6 + i * 34}
                r={5}
              />
              <text
                className={s.progIdx}
                x={PROG_X + 20}
                y={ROB_Y + 10 + i * 34}
              >
                i{i + 1}
              </text>
              <text
                className={s.progText}
                x={PROG_X + 42}
                y={ROB_Y + 10 + i * 34}
              >
                {p.text}
              </text>
            </g>
          ))}

          {/* Queues */}
          <text className={s.section} x={ROB_X} y={28}>
            ROB <tspan className={s.sectionSub}>· every instruction</tspan>
          </text>
          <rect
            className={s.track}
            x={ROB_X - 4}
            y={ROB_Y - 6}
            width={SLOTS * SLOT}
            height={ROB_H + 12}
            rx={8}
          />
          <text className={s.section} x={ROB_X} y={LSQ_Y - 18}>
            LSQ <tspan className={s.sectionSub}>· loads and stores</tspan>
          </text>
          <rect
            className={s.track}
            x={ROB_X - 4}
            y={LSQ_Y - 6}
            width={SLOTS * SLOT}
            height={LSQ_H + 12}
            rx={8}
          />
          {/* head marker */}
          <text
            className={s.endLabel}
            x={HEAD_X + BOX_W / 2}
            y={ROB_Y + ROB_H + 22}
            textAnchor="middle"
          >
            head
          </text>
          <text
            className={s.endLabel}
            x={HEAD_X + BOX_W / 2}
            y={LSQ_Y + LSQ_H + 22}
            textAnchor="middle"
          >
            head
          </text>
          <text
            className={s.endLabelDim}
            x={ROB_X + BOX_W / 2}
            y={ROB_Y + ROB_H + 22}
            textAnchor="middle"
          >
            tail end
          </text>

          {/* Forwarding lookup lines */}
          {forwarding !== undefined && ev && (
            <g className={s.lookup}>
              <path
                className={s.lookupMem}
                d={`M${queueX(ev.i, lsqOrder, prevLsq) + BOX_W / 2},${LSQ_Y + LSQ_H + 4} C${queueX(ev.i, lsqOrder, prevLsq) + BOX_W / 2},${LSQ_Y + LSQ_H + 40} ${STATE_X - 30},${memY(program[ev.i].addr!) + 40} ${STATE_X - 2},${memY(program[ev.i].addr!) + CELL_H / 2}`}
              />
              <path
                className={s.lookupHit}
                d={`M${queueX(forwarding, lsqOrder, prevLsq) + BOX_W / 2},${LSQ_Y - 6} C${queueX(forwarding, lsqOrder, prevLsq) + BOX_W / 2},${LSQ_Y - 30} ${queueX(ev.i, lsqOrder, prevLsq) + BOX_W / 2},${LSQ_Y - 30} ${queueX(ev.i, lsqOrder, prevLsq) + BOX_W / 2},${LSQ_Y - 8}`}
                markerEnd="url(#rl-arrow)"
              />
            </g>
          )}

          {/* ROB entries */}
          {program.map((p, i) => {
            const x = queueX(i, f.order, prev.order);
            const st = f.status[i];
            const visible =
              st === "flight" || st === "done" || st === "flushed";
            const cls = [
              s.entry,
              statusCls[st],
              f.fault[i] && s.faulted,
              (evIs("C", i) || evIs("D", i)) && s.entryCur,
              !visible && s.entryGone,
              st === "flushed" && s.entryFlushed,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <g
                key={i}
                className={cls}
                style={{ transform: `translate(${x}px, ${ROB_Y}px)` }}
              >
                <rect
                  className={s.entryBox}
                  width={BOX_W}
                  height={ROB_H}
                  rx={7}
                />
                <text className={s.entryIdx} x={8} y={17}>
                  i{i + 1}
                </text>
                <text
                  className={s.entryOp}
                  x={BOX_W - 8}
                  y={17}
                  textAnchor="end"
                >
                  {p.kind === "alu" ? "add" : p.kind === "load" ? "ld" : "st"}
                </text>
                {(st === "done" || f.fault[i]) && (
                  <g transform={`translate(8, 30)`}>
                    {f.fault[i] ? (
                      <TriangleAlert
                        x={0}
                        y={0}
                        width={13}
                        height={13}
                        className={s.iconFault}
                      />
                    ) : (
                      <Check
                        x={0}
                        y={0}
                        width={13}
                        height={13}
                        className={s.iconOk}
                      />
                    )}
                  </g>
                )}
                <text
                  className={s.entryVal}
                  x={st === "done" || f.fault[i] ? 24 : 8}
                  y={41}
                >
                  {resultText(i)}
                </text>
              </g>
            );
          })}

          {/* LSQ entries */}
          {program.map((p, i) => {
            if (p.kind === "alu") return null;
            const x = queueX(i, lsqOrder, prevLsq);
            const st = f.status[i];
            const visible =
              st === "flight" || st === "done" || st === "flushed";
            const isStore = p.kind === "store";
            const known = st === "done" && !f.fault[i];
            const retiringStore = isStore && evIs("R", i);
            const cls = [
              s.entry,
              s.lsqEntry,
              statusCls[st],
              f.fault[i] && s.faulted,
              evIs("C", i) && s.entryCur,
              !visible && s.entryGone,
              st === "flushed" && s.entryFlushed,
              retiringStore && s.toMem,
            ]
              .filter(Boolean)
              .join(" ");
            const ty = retiringStore ? memY(p.addr!) - 10 : LSQ_Y;
            const tx = retiringStore ? STATE_X : x;
            return (
              <g
                key={i}
                className={cls}
                style={{ transform: `translate(${tx}px, ${ty}px)` }}
              >
                <rect
                  className={s.entryBox}
                  width={BOX_W}
                  height={LSQ_H}
                  rx={7}
                />
                <text className={s.entryIdx} x={8} y={18}>
                  i{i + 1}
                </text>
                <text
                  className={s.entryOp}
                  x={BOX_W - 8}
                  y={18}
                  textAnchor="end"
                >
                  {isStore ? "st" : "ld"} [{p.addr}]
                </text>
                <text className={s.entryVal} x={8} y={38}>
                  {f.fault[i]
                    ? "fault"
                    : known || (st === "flushed" && f.value[i] !== undefined)
                      ? isStore
                        ? `data ${f.value[i]}`
                        : `got ${f.value[i]}`
                      : isStore
                        ? "data ?"
                        : "value ?"}
                </text>
              </g>
            );
          })}

          {/* Committed state */}
          <text className={s.section} x={STATE_X} y={28}>
            registers <tspan className={s.sectionSub}>· committed</tspan>
          </text>
          {regNames.map((r) => {
            const v = f.regs[r];
            const fresh = ev?.t === "R" && program[ev.i].dest === r;
            return (
              <g key={r} className={`${s.cell} ${fresh ? s.cellFresh : ""}`}>
                <rect
                  x={STATE_X}
                  y={regY(r)}
                  width={STATE_W}
                  height={CELL_H}
                  rx={5}
                />
                <text className={s.cellName} x={STATE_X + 10} y={regY(r) + 17}>
                  {r}
                </text>
                <text
                  key={`${r}-${v}`}
                  className={`${s.cellVal} ${v === undefined ? s.cellEmpty : ""}`}
                  x={STATE_X + STATE_W - 12}
                  y={regY(r) + 17}
                  textAnchor="end"
                >
                  {v === undefined ? "–" : v}
                </text>
              </g>
            );
          })}
          <text className={s.section} x={STATE_X} y={LSQ_Y - 18}>
            D$ <tspan className={s.sectionSub}>· memory</tspan>
          </text>
          {memNames.map((a) => {
            const fresh =
              ev?.t === "R" &&
              program[ev.i].kind === "store" &&
              program[ev.i].addr === a;
            const stale =
              forwarding !== undefined && ev && program[ev.i].addr === a;
            return (
              <g
                key={a}
                className={`${s.cell} ${fresh ? s.cellFresh : ""} ${stale ? s.cellStale : ""}`}
              >
                <rect
                  x={STATE_X}
                  y={memY(a)}
                  width={STATE_W}
                  height={CELL_H}
                  rx={5}
                />
                <text className={s.cellName} x={STATE_X + 10} y={memY(a) + 17}>
                  [{a}]
                </text>
                {stale && (
                  <text
                    className={s.staleNote}
                    x={STATE_X + 46}
                    y={memY(a) + 17}
                  >
                    not used
                  </text>
                )}
                <text
                  key={`${a}-${f.mem[a]}`}
                  className={s.cellVal}
                  x={STATE_X + STATE_W - 12}
                  y={memY(a) + 17}
                  textAnchor="end"
                >
                  {f.mem[a]}
                </text>
              </g>
            );
          })}

          {/* Flying value */}
          {flight && (
            <g
              key={`fly-${step}`}
              className={s.fly}
              style={
                {
                  "--x0": `${flight.x0}px`,
                  "--y0": `${flight.y0}px`,
                  "--x1": `${flight.x1}px`,
                  "--y1": `${flight.y1}px`,
                } as CSSProperties
              }
            >
              <circle r={13} />
              <text y={4.5} textAnchor="middle">
                {flight.label}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className={s.legend}>
        <span>
          <i className={s.lgFlight} /> in flight
        </span>
        <span>
          <i className={s.lgDone} /> completed
        </span>
        <span>
          <i className={s.lgRetired} /> retired
        </span>
        <span>
          <i className={s.lgCur} /> this step
        </span>
        {hasFault && (
          <span>
            <i className={s.lgFault} /> exception
          </span>
        )}
        {hasFault && (
          <span>
            <i className={s.lgFlushed} /> flushed
          </span>
        )}
      </div>
    </div>
  );
}
