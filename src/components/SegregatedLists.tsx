// Segregated free lists: one list per size class. A request goes straight to its class's list.
// 'simple': every block in a list has the class's size (no split, no coalesce, grow the heap when empty).
// 'fit': blocks in a list vary within the class; search it, split off the rest, try bigger classes,
// and coalesce on free.
import { useMemo, useState } from "react";
import { StepControls, useStepper } from "./StepControls";
import s from "./SegregatedLists.module.css";

interface ClassSpec {
  label: string;
  /** Sizes in (min, max]. */
  min: number;
  max: number;
}
interface Scenario {
  label: string;
  kind: "simple" | "fit";
  /** Initial free block sizes per class. */
  lists: number[][];
  ops: string[];
}
interface Props {
  classes: ClassSpec[];
  scenarios: Scenario[];
}

interface B {
  id: number;
  size: number;
  used?: number;
  owner?: string;
  row: number; // class index, or -1 = in use
  idx: number;
  fresh?: boolean;
  pair?: number; // id of the block it was split from / into (physically adjacent)
}
interface Frame {
  blocks: B[];
  row: number | null;
  check: { id: number; ok: boolean } | null;
  op: number;
  msg: string;
}

function simulate(classes: ClassSpec[], sc: Scenario): Frame[] {
  let nextId = 0;
  let blocks: B[] = sc.lists.flatMap((l, row) =>
    l.map((size, idx) => ({ id: nextId++, size, row, idx })),
  );
  const frames: Frame[] = [];
  let op = -1;
  const push = (f: Partial<Frame> & { msg: string }) =>
    frames.push({
      blocks: blocks.map((b) => ({ ...b })),
      row: null,
      check: null,
      op,
      ...f,
    });
  const clsOf = (n: number) =>
    classes.findIndex((c) => n > c.min && n <= c.max);
  const reindex = () => {
    const rows = new Map<number, B[]>();
    for (const b of blocks) rows.set(b.row, [...(rows.get(b.row) ?? []), b]);
    for (const [, l] of rows)
      l.sort((a, b) => a.idx - b.idx).forEach((b, i) => (b.idx = i));
  };
  const pushHead = (b: B, row: number) => {
    for (const o of blocks) if (o.row === row && o !== b) o.idx++;
    b.row = row;
    b.idx = 0;
  };
  const toUse = (b: B) => {
    b.row = -1;
    b.idx = blocks.filter((o) => o.row === -1 && o !== b).length;
  };
  const clearFresh = () => blocks.forEach((b) => (b.fresh = false));

  push({ msg: "One free list per size class" });
  sc.ops.forEach((t, oi) => {
    op = oi;
    clearFresh();
    const m = t.match(/^\s*(\w+)\s*=\s*malloc\((\d+)\)/);
    if (m) {
      const n = Number(m[2]);
      let c = clsOf(n);
      push({ row: c, msg: `${n} words: size class ${classes[c].label}` });
      if (sc.kind === "simple") {
        let head = blocks.find((b) => b.row === c && b.idx === 0);
        if (!head) {
          const N = classes[c].max;
          for (let k = 0; k < 2; k++)
            blocks.push({ id: nextId++, size: N, row: c, idx: k, fresh: true });
          push({
            row: c,
            msg: `List empty: grow the heap, carve new ${N}-word blocks`,
          });
          clearFresh();
          head = blocks.find((b) => b.row === c && b.idx === 0)!;
        }
        head.used = n;
        head.owner = m[1];
        head.fresh = true;
        toUse(head);
        reindex();
        push({
          msg:
            head.size > n
              ? `Take the first block: ${head.size - n} words of padding`
              : "Take the first block: no search, no split",
        });
        return;
      }
      // segregated fit
      for (;;) {
        const list = blocks
          .filter((b) => b.row === c)
          .sort((a, b) => a.idx - b.idx);
        let found: B | null = null;
        for (const b of list) {
          const ok = b.size >= n;
          push({
            row: c,
            check: { id: b.id, ok },
            msg: ok ? `${b.size} ≥ ${n}: fits` : `${b.size} < ${n}: too small`,
          });
          if (ok) {
            found = b;
            break;
          }
        }
        if (found) {
          const b = found;
          if (b.size > n) {
            const frag: B = {
              id: nextId++,
              size: b.size - n,
              row: b.row,
              idx: b.idx + 0.5,
              pair: b.id,
            };
            b.size = n;
            b.pair = frag.id;
            blocks.push(frag);
            push({ row: c, msg: `Split: ${n} + ${frag.size}` });
            b.owner = m[1];
            b.used = n;
            b.fresh = true;
            toUse(b);
            pushHead(frag, clsOf(frag.size));
            reindex();
            push({
              row: frag.row,
              msg: `Use ${n}; the ${frag.size} goes on list ${classes[frag.row].label}`,
            });
          } else {
            b.owner = m[1];
            b.used = n;
            b.fresh = true;
            toUse(b);
            reindex();
            push({ msg: "Exact fit" });
          }
          return;
        }
        if (c + 1 >= classes.length) {
          push({ msg: "Nothing fits: grow the heap" });
          return;
        }
        c++;
        push({
          row: c,
          msg: `Nothing fits: try the next class, ${classes[c].label}`,
        });
      }
    }
    const f = t.match(/^\s*free\((\w+)\)/);
    const b = blocks.find((x) => x.owner === f?.[1]);
    if (!b) return;
    b.owner = undefined;
    b.used = undefined;
    if (sc.kind === "simple") {
      pushHead(b, clsOf(b.size));
      reindex();
      push({ row: b.row, msg: `Push it back on list ${classes[b.row].label}` });
      return;
    }
    const nb = blocks.find((x) => x.id === b.pair && x.row >= 0 && !x.owner);
    if (nb) {
      // the neighbour leaves its list and joins the freed block
      nb.row = -1;
      nb.idx = b.idx + 0.5;
      reindex();
      push({
        check: { id: nb.id, ok: true },
        msg: `Its neighbour (${nb.size}) is free: coalesce`,
      });
      blocks = blocks.filter((x) => x !== nb);
      b.size += nb.size;
      b.pair = undefined;
    }
    pushHead(b, clsOf(b.size));
    reindex();
    push({
      row: b.row,
      msg: `Place the ${b.size} on list ${classes[b.row].label}`,
    });
  });
  return frames;
}

const W = 680;
const LX = 78;
const U = 17; // px per word
const ROW0 = 14;
const ROWH = 40;
const BH = 24;
const GAP = 22;

export default function SegregatedLists({ classes, scenarios }: Props) {
  const [si, setSi] = useState(0);
  const sc = scenarios[si];
  const frames = useMemo(
    () => simulate(classes, sc),
    [JSON.stringify(classes), JSON.stringify(sc)],
  );
  const last = frames.length - 1;
  const stepper = useStepper(last, { intervalMs: 1400 });
  const f = frames[Math.min(stepper.step, last)];
  const TRAY_Y = ROW0 + classes.length * ROWH + 18;
  const H = TRAY_Y + ROWH + 6;

  const rowY = (r: number) => (r < 0 ? TRAY_Y : ROW0 + r * ROWH);
  const pos = (b: B) => {
    const before = f.blocks.filter((o) => o.row === b.row && o.idx < b.idx);
    const gap = b.row < 0 ? 10 : GAP;
    return {
      x: LX + before.reduce((a, o) => a + o.size * U + gap, 0),
      y: rowY(b.row) + (ROWH - BH) / 2,
    };
  };
  const freeWords = f.blocks
    .filter((b) => b.row >= 0)
    .reduce((a, b) => a + b.size, 0);

  return (
    <div className={`not-content ${s.root}`} {...stepper.keyProps}>
      <StepControls
        stepper={stepper}
        counter={`step ${stepper.step} / ${last}`}
      >
        {scenarios.length > 1 && (
          <div className={s.seg} role="group" aria-label="Scheme">
            {scenarios.map((x, i) => (
              <button
                key={x.label}
                className={`viz-btn ${i === si ? s.on : ""}`}
                aria-pressed={i === si}
                onClick={() => {
                  setSi(i);
                  stepper.reset();
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
        )}
      </StepControls>
      <div className={s.ops}>
        {sc.ops.map((o, i) => (
          <code
            key={i}
            className={`${s.op} ${i === f.op ? s.opNow : i < f.op ? s.opDone : ""}`}
          >
            {o}
          </code>
        ))}
        <span className={s.free}>
          free words <b>{freeWords}</b>
        </span>
      </div>
      <p className={s.msg}>{f.msg}</p>

      <div className={s.scroll}>
        <svg
          className={s.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Segregated free lists"
        >
          <defs>
            <pattern
              id="sg-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" className={s.hatchBg} />
              <line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
            </pattern>
            <marker
              id="sg-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={s.arrowHead} />
            </marker>
          </defs>

          {classes.map((c, r) => {
            const list = f.blocks
              .filter((b) => b.row === r)
              .sort((a, b) => a.idx - b.idx);
            return (
              <g
                key={c.label}
                className={`${s.row} ${f.row === r ? s.rowNow : ""}`}
              >
                <rect
                  className={s.rowBg}
                  x={4}
                  y={rowY(r) + 3}
                  width={W - 8}
                  height={ROWH - 6}
                  rx={6}
                />
                <text
                  className={s.cls}
                  x={LX - 30}
                  y={rowY(r) + ROWH / 2 + 4.5}
                  textAnchor="end"
                >
                  {c.label}
                </text>
                <line
                  className={s.link}
                  x1={LX - 24}
                  x2={LX - 3}
                  y1={rowY(r) + ROWH / 2}
                  y2={rowY(r) + ROWH / 2}
                  markerEnd="url(#sg-arrow)"
                />
                {list.slice(0, -1).map((b) => {
                  const p = pos(b);
                  return (
                    <line
                      key={`l${b.id}`}
                      className={s.link}
                      x1={p.x + b.size * U + 2}
                      x2={p.x + b.size * U + GAP - 3}
                      y1={rowY(r) + ROWH / 2}
                      y2={rowY(r) + ROWH / 2}
                      markerEnd="url(#sg-arrow)"
                    />
                  );
                })}
                {list.length === 0 && (
                  <text
                    className={s.empty}
                    x={LX + 4}
                    y={rowY(r) + ROWH / 2 + 4}
                  >
                    empty
                  </text>
                )}
              </g>
            );
          })}
          <text
            className={s.cls}
            x={LX - 12}
            y={TRAY_Y + ROWH / 2 + 4.5}
            textAnchor="end"
          >
            in use
          </text>
          <line
            className={s.trayLine}
            x1={4}
            x2={W - 4}
            y1={TRAY_Y - 6}
            y2={TRAY_Y - 6}
          />

          {f.blocks.map((b) => {
            const p = pos(b);
            const chk =
              f.check?.id === b.id ? (f.check.ok ? s.chkOk : s.chkNo) : "";
            return (
              <g
                key={b.id}
                className={`${s.blk} ${b.owner ? s.inUse : ""} ${b.fresh ? s.fresh : ""} ${chk}`}
                style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
              >
                <rect
                  className={s.body}
                  x={0}
                  y={0}
                  width={b.size * U}
                  height={BH}
                  rx={3}
                />
                {b.owner && b.used! < b.size && (
                  <rect
                    x={b.used! * U}
                    y={0}
                    width={(b.size - b.used!) * U}
                    height={BH}
                    fill="url(#sg-hatch)"
                    className={s.pad}
                  />
                )}
                {Array.from({ length: b.size - 1 }, (_, k) => (
                  <line
                    key={k}
                    className={s.wordLine}
                    x1={(k + 1) * U}
                    x2={(k + 1) * U}
                    y1={0}
                    y2={BH}
                  />
                ))}
                <rect
                  className={s.outline}
                  x={0}
                  y={0}
                  width={b.size * U}
                  height={BH}
                  rx={3}
                />
                <text
                  className={s.label}
                  x={b.owner ? 4 : (b.size * U) / 2}
                  y={BH / 2 + 4}
                  textAnchor={b.owner ? "start" : "middle"}
                >
                  {b.owner ? `${b.owner}` : b.size}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className={s.legend}>
        <span>
          <i className={s.swFree} /> free block
        </span>
        <span>
          <i className={s.swUse} /> in use
        </span>
        <span>
          <i className={s.swFresh} /> new
        </span>
        <span>
          <i className={s.swPad} /> padding
        </span>
        <span>
          <i className={s.swNow} /> list being searched
        </span>
        <span className={s.unit}>1 cell = 1 word, headers not shown</span>
      </div>
    </div>
  );
}
