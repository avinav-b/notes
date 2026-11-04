// Binary buddy allocator: a heap of 2^n units. Requests round up to a power of two; bigger blocks split
// in half until one fits; a freed block merges with its buddy (address XOR size) while the buddy is free.
import { useMemo } from "react";
import { StepControls, useStepper } from "./StepControls";
import s from "./BuddyAllocator.module.css";

interface Props {
  /** Heap size in units (a power of two). */
  units?: number;
  /** Unit size in K. */
  unitK?: number;
  /** e.g. 'a = allocate(34K)', 'free(b)'. */
  ops?: string[];
  /** Show the history of every step below, like the lecture's table. */
  history?: boolean;
}

interface Blk {
  start: number; // units
  k: number; // size = 2^k units
  owner?: string;
  req?: number; // K requested
}
interface Check {
  who: string;
  start: number;
  k: number;
  buddy: number;
  free: boolean;
}
interface Frame {
  label: string;
  op: number;
  blocks: Blk[];
  msg: string;
  fresh: number | null;
  split: { start: number; k: number } | null; // a block just split in half
  check: Check | null;
  round: { req: number; k: number } | null;
}

function simulate(units: number, unitK: number, opText: string[]): Frame[] {
  const top = Math.log2(units);
  let blocks: Blk[] = [{ start: 0, k: top }];
  const frames: Frame[] = [
    {
      label: "1",
      op: -1,
      blocks,
      msg: `One free block of ${units * unitK}K`,
      fresh: null,
      split: null,
      check: null,
      round: null,
    },
  ];
  const sorted = (b: Blk[]) => [...b].sort((x, y) => x.start - y.start);

  opText.forEach((t, oi) => {
    const n = oi + 2;
    const sub: Omit<Frame, "label" | "op">[] = [];
    const add = (f: Partial<Frame> & { msg: string }) =>
      sub.push({
        blocks,
        fresh: null,
        split: null,
        check: null,
        round: null,
        ...f,
      });
    const m = t.match(/^\s*(\w+)\s*=\s*allocate\((\d+)K\)/);
    if (m) {
      const req = Number(m[2]);
      const k = Math.max(0, Math.ceil(Math.log2(req / unitK)));
      const round = { req, k };
      for (;;) {
        const fit = sorted(blocks.filter((b) => !b.owner && b.k === k))[0];
        if (fit) {
          blocks = blocks.map((b) =>
            b === fit ? { ...b, owner: m[1], req } : b,
          );
          add({
            msg: `${m[1]} gets the ${(1 << k) * unitK}K block at ${fit.start * unitK}K`,
            fresh: fit.start,
            round,
          });
          break;
        }
        const bigger = sorted(blocks.filter((b) => !b.owner && b.k > k)).sort(
          (x, y) => x.k - y.k,
        )[0];
        if (!bigger) {
          add({ msg: "Out of memory", round });
          break;
        }
        const h = bigger.k - 1;
        blocks = sorted([
          ...blocks.filter((b) => b !== bigger),
          { start: bigger.start, k: h },
          { start: bigger.start + (1 << h), k: h },
        ]);
        add({
          msg: `No free ${(1 << k) * unitK}K block: split ${(1 << bigger.k) * unitK}K in half`,
          split: { start: bigger.start, k: bigger.k },
          round,
        });
      }
    } else {
      const f = t.match(/^\s*free\((\w+)\)/);
      const who = f ? f[1] : "";
      const blk = blocks.find((b) => b.owner === who);
      if (blk) {
        let cur: Blk = { start: blk.start, k: blk.k };
        blocks = blocks.map((b) => (b === blk ? cur : b));
        let name = who;
        for (;;) {
          if (cur.k === top) {
            add({ msg: "Back to one free block", fresh: null });
            break;
          }
          const buddy = cur.start ^ (1 << cur.k);
          const bb = blocks.find(
            (b) => b.start === buddy && b.k === cur.k && !b.owner,
          );
          const check = {
            who: name,
            start: cur.start,
            k: cur.k,
            buddy,
            free: !!bb,
          };
          add({
            msg: bb
              ? `Buddy at ${buddy * unitK}K is free: merge`
              : `Buddy at ${buddy * unitK}K is not a free ${(1 << cur.k) * unitK}K block: stop`,
            check,
          });
          if (!bb) break;
          const merged: Blk = {
            start: Math.min(cur.start, buddy),
            k: cur.k + 1,
          };
          blocks = sorted([
            ...blocks.filter((b) => b !== cur && b !== bb),
            merged,
          ]);
          cur = merged;
          name = "block";
        }
      }
    }
    sub.forEach((fr, j) =>
      frames.push({
        ...fr,
        op: oi,
        label: sub.length > 1 ? `${n}.${j + 1}` : `${n}`,
      }),
    );
  });
  return frames;
}

const W = 680;
const X0 = 46;
const ROW_Y = 50;
const ROW_H = 44;

function Bits({
  value,
  bits,
  mark,
  y,
  x0,
  cls,
}: {
  value: number;
  bits: number;
  mark: number;
  y: number;
  x0: number;
  cls?: string;
}) {
  const str = value.toString(2).padStart(bits, "0");
  return (
    <g className={cls}>
      {[...str].map((c, i) => {
        const bit = bits - 1 - i;
        return (
          <text
            key={i}
            x={x0 + i * 10.5 + Math.floor(i / 4) * 7}
            y={y}
            className={bit === mark ? s.bitMark : bit < 16 ? s.bitLow : s.bit}
          >
            {c}
          </text>
        );
      })}
    </g>
  );
}

export default function BuddyAllocator({
  units = 16,
  unitK = 64,
  ops = [
    "a = allocate(34K)",
    "b = allocate(66K)",
    "c = allocate(35K)",
    "d = allocate(67K)",
    "free(b)",
    "free(d)",
    "free(a)",
    "free(c)",
  ],
  history = true,
}: Props) {
  const frames = useMemo(
    () => simulate(units, unitK, ops),
    [units, unitK, ops.join("|")],
  );
  const last = frames.length - 1;
  const stepper = useStepper(last, { intervalMs: 1400 });
  const f = frames[Math.min(stepper.step, last)];
  const uw = (W - X0 - 12) / units;
  const x = (u: number) => X0 + u * uw;
  const addrBits = Math.log2(units * unitK * 1024);

  const bounds = useMemo(() => {
    const set = new Set<number>();
    for (const fr of frames)
      for (const b of fr.blocks) if (b.start > 0) set.add(b.start);
    return [...set];
  }, [frames]);
  const now = new Set(f.blocks.map((b) => b.start));

  const PANEL_Y = ROW_Y + ROW_H + 58;
  const HIST_Y = PANEL_Y + 74;
  const HR = 13;
  const H = history ? HIST_Y + frames.length * HR + 8 : PANEL_Y + 66;
  const bitsX = 300;
  const c = f.check;

  return (
    <div className={`not-content ${s.root}`} {...stepper.keyProps}>
      <StepControls stepper={stepper} counter={`step ${f.label}`} />
      <div className={s.ops}>
        {ops.map((o, i) => (
          <code
            key={i}
            className={`${s.op} ${i === f.op ? s.opNow : i < f.op ? s.opDone : ""}`}
          >
            {o}
          </code>
        ))}
      </div>
      <p className={s.msg}>{f.msg}</p>

      <div className={s.scroll}>
        <svg
          className={s.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Buddy allocator"
        >
          <defs>
            <pattern
              id="ba-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" className={s.hatchBg} />
              <line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
            </pattern>
            <marker
              id="ba-ok"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={s.headOk} />
            </marker>
            <marker
              id="ba-no"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={s.headNo} />
            </marker>
          </defs>

          {/* unit ruler */}
          {Array.from({ length: units + 1 }, (_, u) =>
            u % 2 === 0 ? (
              <text
                key={u}
                className={s.ruler}
                x={x(u)}
                y={ROW_Y + ROW_H + 15}
                textAnchor={u === 0 ? "start" : u === units ? "end" : "middle"}
              >
                {u * unitK}K
              </text>
            ) : null,
          )}

          {/* blocks */}
          {f.blocks.map((b) => {
            const w = (1 << b.k) * uw;
            const fresh = f.fresh === b.start && !!b.owner;
            const used = b.req ? Math.min(1, b.req / ((1 << b.k) * unitK)) : 0;
            return (
              <g
                key={`${b.start}-${b.k}-${b.owner ?? ""}`}
                className={`${s.blk} ${b.owner ? s.alloc : s.free} ${fresh ? s.fresh : ""}`}
              >
                <rect
                  className={s.body}
                  x={x(b.start)}
                  y={ROW_Y}
                  width={w}
                  height={ROW_H}
                />
                {b.owner && (
                  <>
                    <rect
                      className={s.used}
                      x={x(b.start)}
                      y={ROW_Y}
                      width={w * used}
                      height={ROW_H}
                    />
                    <rect
                      x={x(b.start) + w * used}
                      y={ROW_Y}
                      width={w * (1 - used)}
                      height={ROW_H}
                      fill="url(#ba-hatch)"
                      className={s.waste}
                    />
                  </>
                )}
                <text
                  className={s.size}
                  x={x(b.start) + w / 2}
                  y={ROW_Y + (b.owner ? 19 : 27)}
                  textAnchor="middle"
                >
                  2
                  <tspan className={s.sup} dy={-5}>
                    {b.k}
                  </tspan>
                </text>
                {b.owner && (
                  <text
                    className={s.owner}
                    x={x(b.start) + w / 2}
                    y={ROW_Y + 36}
                    textAnchor="middle"
                  >
                    {b.owner.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
          {bounds.map((u) => (
            <line
              key={u}
              className={`${s.bound} ${now.has(u) ? "" : s.gone}`}
              x1={x(u)}
              x2={x(u)}
              y1={ROW_Y - 3}
              y2={ROW_Y + ROW_H + 3}
            />
          ))}
          <rect
            className={s.frame}
            x={x(0)}
            y={ROW_Y}
            width={units * uw}
            height={ROW_H}
          />
          {f.split && (
            <rect
              className={s.splitMark}
              x={x(f.split.start)}
              y={ROW_Y - 3}
              width={(1 << f.split.k) * uw}
              height={ROW_H + 6}
              rx={4}
            />
          )}

          {/* buddy arc */}
          {c && (
            <g className={c.free ? s.arcOk : s.arcNo}>
              <path
                d={(() => {
                  const a = x(c.start + (1 << c.k) / 2);
                  const b = x(c.buddy + (1 << c.k) / 2);
                  return `M${a},${ROW_Y - 4} C${a},${ROW_Y - 34} ${b},${ROW_Y - 34} ${b},${ROW_Y - 5}`;
                })()}
                markerEnd={`url(#${c.free ? "ba-ok" : "ba-no"})`}
              />
              <rect
                className={s.buddyBox}
                x={x(c.buddy) + 1}
                y={ROW_Y + 1}
                width={(1 << c.k) * uw - 2}
                height={ROW_H - 2}
              />
              <text
                x={x(c.buddy + (1 << c.k) / 2)}
                y={ROW_Y - 30}
                textAnchor="middle"
                className={s.arcLabel}
              >
                buddy
              </text>
            </g>
          )}

          {/* XOR panel / request rounding */}
          <g className={s.panel}>
            {c ? (
              <>
                <rect
                  className={s.colMark}
                  x={
                    bitsX +
                    (addrBits - 1 - (c.k + 16)) * 10.5 +
                    Math.floor((addrBits - 1 - (c.k + 16)) / 4) * 7 -
                    2
                  }
                  y={PANEL_Y - 13}
                  width={11}
                  height={58}
                  rx={3}
                />
                <text className={s.pl} x={X0} y={PANEL_Y}>
                  addr({c.who})
                </text>
                <text className={s.pv} x={250} y={PANEL_Y} textAnchor="end">
                  {c.start * unitK}K
                </text>
                <Bits
                  value={c.start * unitK * 1024}
                  bits={addrBits}
                  mark={c.k + 16}
                  y={PANEL_Y}
                  x0={bitsX}
                />
                <text className={s.pl} x={X0} y={PANEL_Y + 19}>
                  size({c.who})
                </text>
                <text
                  className={s.pv}
                  x={250}
                  y={PANEL_Y + 19}
                  textAnchor="end"
                >
                  {(1 << c.k) * unitK}K
                </text>
                <Bits
                  value={(1 << c.k) * unitK * 1024}
                  bits={addrBits}
                  mark={c.k + 16}
                  y={PANEL_Y + 19}
                  x0={bitsX}
                />
                <line
                  className={s.sum}
                  x1={X0}
                  x2={bitsX + addrBits * 10.5 + 30}
                  y1={PANEL_Y + 26}
                  y2={PANEL_Y + 26}
                />
                <text className={s.pl} x={X0} y={PANEL_Y + 42}>
                  buddy = addr ⊕ size
                </text>
                <text
                  className={`${s.pv} ${c.free ? s.pvOk : s.pvNo}`}
                  x={250}
                  y={PANEL_Y + 42}
                  textAnchor="end"
                >
                  {c.buddy * unitK}K
                </text>
                <Bits
                  value={c.buddy * unitK * 1024}
                  bits={addrBits}
                  mark={c.k + 16}
                  y={PANEL_Y + 42}
                  x0={bitsX}
                />
              </>
            ) : f.round ? (
              <>
                <text className={s.pl} x={X0} y={PANEL_Y + 8}>
                  request {f.round.req}K, rounded up to{" "}
                  <tspan className={s.pv}>
                    {(1 << f.round.k) * unitK}K = 2
                    <tspan className={s.sup} dy={-5}>
                      {f.round.k}
                    </tspan>
                    <tspan dy={5}> units</tspan>
                  </tspan>
                </text>
                <rect
                  className={s.reqBar}
                  x={X0}
                  y={PANEL_Y + 20}
                  width={(f.round.req / unitK) * uw}
                  height={12}
                  rx={2}
                />
                <rect
                  className={s.roundBar}
                  x={X0}
                  y={PANEL_Y + 20}
                  width={(1 << f.round.k) * uw}
                  height={12}
                  rx={2}
                />
              </>
            ) : null}
          </g>

          {/* history, like the lecture's table */}
          {history &&
            frames.map((fr, i) => (
              <g
                key={i}
                className={`${s.hist} ${i > stepper.step ? s.histFuture : ""} ${i === stepper.step ? s.histNow : ""}`}
              >
                <text
                  className={s.histLabel}
                  x={X0 - 8}
                  y={HIST_Y + i * HR + 8.5}
                  textAnchor="end"
                >
                  {fr.label}
                </text>
                {fr.blocks.map((b) => (
                  <rect
                    key={b.start}
                    className={b.owner ? s.hAlloc : s.hFree}
                    x={x(b.start) + 0.5}
                    y={HIST_Y + i * HR}
                    width={(1 << b.k) * uw - 1}
                    height={HR - 2}
                    rx={1.5}
                  />
                ))}
              </g>
            ))}
        </svg>
      </div>

      <div className={s.legend}>
        <span>
          <i className={s.swUsed} /> requested
        </span>
        <span>
          <i className={s.swWaste} /> rounding waste
        </span>
        <span>
          <i className={s.swFree} /> free
        </span>
        <span>
          <i className={s.swFresh} /> just allocated
        </span>
        <span>
          <i className={s.swOk} /> buddy free
          <i className={s.swNo} /> buddy busy
        </span>
        <span className={s.unit}>
          <span>
            a block labelled 2<sup>k</sup> is 2<sup>k</sup> × {unitK}K
          </span>
        </span>
      </div>
    </div>
  );
}
