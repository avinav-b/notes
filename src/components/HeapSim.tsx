// A heap drawn as a row of words. Steps through malloc/free requests and shows where each block goes:
// the search (a cursor hopping block to block, the request overlaid on each candidate), splitting,
// freeing and coalescing. Works with no headers (just words), an implicit list (size headers, optional
// footers) or an explicit free list (succ links among free blocks, LIFO or address-ordered insertion).
import { useMemo, useState } from "react";
import { StepControls, useStepper } from "./StepControls";
import s from "./HeapSim.module.css";

type Policy = "first" | "next" | "best";
type ListKind = "none" | "implicit" | "explicit";
type Insert = "lifo" | "address";

interface BlockSpec {
  /** Total words, including header/footer. */
  size: number;
  alloc?: boolean;
  name?: string;
}
interface Settings {
  ops: string[];
  policy: Policy;
  coalesce: boolean;
  insert: Insert;
  freeOrder?: string[];
}
interface Variant extends Partial<Settings> {
  label: string;
}
interface Props extends Partial<Settings> {
  /** Initial layout, in address order. Defaults to one free block of `words` words. */
  blocks?: BlockSpec[];
  words?: number;
  /** 'none': words only, no headers. 'implicit': size header per block. 'explicit': free list of free blocks. */
  list?: ListKind;
  /** Boundary tags: a footer word repeating the header. */
  footers?: boolean;
  /** Block index where the previous search ended (next fit starts here). */
  rover?: number;
  /** Segmented buttons that switch between settings (e.g. First / Next / Best fit). */
  variants?: Variant[];
  /** Show "free in total" vs "largest free block" bars. */
  stats?: boolean;
}

interface Blk {
  start: number;
  size: number;
  alloc: boolean;
  name?: string;
}
type Op =
  | { kind: "malloc"; name: string; words: number; text: string }
  | { kind: "free"; name: string; text: string };

interface Frame {
  blocks: Blk[];
  list: string[];
  op: number;
  cursor: number | null;
  /** The request laid over a candidate block: `room` words available there. */
  ghost: { at: number; len: number; room: number } | null;
  best: number | null;
  hot: number[];
  fresh: number | null;
  fail: boolean;
  reads: number;
  rover: number | null;
  need: number | null;
  msg: string;
}

function parseOp(t: string): Op {
  const m = t.match(/^\s*(\w+)\s*=\s*malloc\((\d+)\)\s*$/);
  if (m)
    return { kind: "malloc", name: m[1], words: Number(m[2]), text: t.trim() };
  const f = t.match(/^\s*free\((\w+)\)\s*$/);
  if (f) return { kind: "free", name: f[1], text: t.trim() };
  throw new Error(`HeapSim: can't parse op "${t}"`);
}

function layout(specs: BlockSpec[]): Blk[] {
  let at = 0;
  return specs.map((b) => {
    const blk = { start: at, size: b.size, alloc: !!b.alloc, name: b.name };
    at += b.size;
    return blk;
  });
}

function simulate(
  init: Blk[],
  kind: ListKind,
  footers: boolean,
  roverIdx: number | undefined,
  cfg: Settings,
): Frame[] {
  const ops = cfg.ops.map(parseOp);
  const hdr = kind === "none" ? 0 : 1;
  const ovh = hdr + (footers ? 1 : 0);
  const minFree = ovh + (kind === "explicit" ? 2 : 1);
  const byAddr = (names: string[], bl: Blk[]) =>
    [...names].sort(
      (a, b) =>
        bl.find((x) => x.name === a)!.start -
        bl.find((x) => x.name === b)!.start,
    );

  let blocks = init;
  let list: string[] =
    kind === "explicit"
      ? (cfg.freeOrder ?? blocks.filter((b) => !b.alloc).map((b) => b.name!))
      : [];
  if (kind === "explicit" && cfg.insert === "address")
    list = byAddr(list, blocks);
  let rover: number | null =
    cfg.policy === "next" ? (blocks[roverIdx ?? 0]?.start ?? 0) : null;
  let op = -1;

  const frames: Frame[] = [];
  const push = (f: Partial<Frame>) =>
    frames.push({
      blocks,
      list,
      op,
      cursor: null,
      ghost: null,
      best: null,
      hot: [],
      fresh: null,
      fail: false,
      reads: 0,
      rover,
      need: null,
      msg: "",
      ...f,
    });

  push({
    msg:
      kind === "explicit"
        ? "Free blocks are linked into a list"
        : kind === "implicit"
          ? "Each header holds its block size"
          : `Empty heap: ${blocks.reduce((a, b) => a + b.size, 0)} free words`,
  });

  ops.forEach((o, oi) => {
    op = oi;
    if (o.kind === "malloc") {
      const need = Math.max(o.words + ovh, minFree);
      let order: Blk[] =
        kind === "explicit"
          ? list.map((n) => blocks.find((b) => !b.alloc && b.name === n)!)
          : kind === "implicit"
            ? blocks
            : blocks.filter((b) => !b.alloc);
      if (cfg.policy === "next" && rover !== null) {
        const r = rover;
        const i =
          kind === "explicit"
            ? Math.max(
                0,
                order.findIndex((b) => b.start === r),
              )
            : Math.max(
                0,
                order.findIndex((b) => b.start >= r),
              );
        order = [...order.slice(i), ...order.slice(0, i)];
      }
      let reads = 0;
      let chosen: Blk | null = null;
      let best: Blk | null = null;
      const ghost = (b: Blk) => ({ at: b.start, len: need, room: b.size });
      for (const b of order) {
        reads++;
        if (b.alloc) {
          push({
            cursor: b.start,
            reads,
            need,
            best: best?.start ?? null,
            msg: `${b.size}: allocated, skip`,
          });
          continue;
        }
        const fits = b.size >= need;
        if (cfg.policy === "best") {
          if (fits && (!best || b.size < best.size)) best = b;
          const msg = !fits
            ? `${b.size} < ${need}: too small`
            : best === b
              ? `${b.size} fits: best so far`
              : `${b.size} fits, but ${best!.size} is closer`;
          push({
            cursor: b.start,
            ghost: ghost(b),
            reads,
            need,
            best: best?.start ?? null,
            msg,
          });
        } else if (fits) {
          chosen = b;
          // Without headers there's no search to watch: go straight to the placement.
          if (kind !== "none")
            push({
              cursor: b.start,
              ghost: ghost(b),
              reads,
              need,
              msg: `${b.size} ≥ ${need}: fits`,
            });
          break;
        } else
          push({
            cursor: kind === "none" ? null : b.start,
            ghost: ghost(b),
            reads,
            need,
            msg: `${b.size} < ${need}: too small`,
          });
      }
      if (cfg.policy === "best") chosen = best;

      if (!chosen) {
        const free = blocks.filter((b) => !b.alloc);
        const total = free.reduce((a, b) => a + b.size, 0);
        // Neighbouring free blocks that together would have fitted: false fragmentation.
        let run: Blk[] = [];
        for (let i = 0; i < blocks.length; i++) {
          if (blocks[i].alloc) continue;
          const r = [blocks[i]];
          while (i + 1 < blocks.length && !blocks[i + 1].alloc)
            r.push(blocks[++i]);
          if (r.length > 1 && r.reduce((a, b) => a + b.size, 0) >= need)
            run = r;
        }
        push({
          fail: true,
          reads,
          need,
          hot: (run.length ? run : free).map((b) => b.start),
          msg: run.length
            ? `Oops: ${run.map((b) => b.size).join(" + ")} side by side, but not merged`
            : `Oops: ${total} words free, but no single block fits ${need}`,
        });
        return;
      }

      const c = chosen;
      const rem = c.size - need;
      const split = rem >= minFree;
      const allocated: Blk = {
        start: c.start,
        size: split ? need : c.size,
        alloc: true,
        name: o.name,
      };
      const pieces = split
        ? [
            allocated,
            { start: c.start + need, size: rem, alloc: false, name: c.name },
          ]
        : [allocated];
      blocks = blocks.flatMap((b) => (b === c ? pieces : [b]));
      if (kind === "explicit" && !split)
        list = list.filter((n) => n !== c.name);
      const after = blocks[blocks.indexOf(allocated) + 1];
      if (rover !== null) rover = after ? after.start : 0;
      push({
        fresh: c.start,
        reads,
        need,
        msg:
          kind === "none"
            ? `${o.name} goes in the first free block that fits`
            : split
              ? `Split ${c.size} into ${need} + ${rem}`
              : rem > 0
                ? `${rem} left over is too small to split off`
                : "Exact fit: no split",
      });
      return;
    }

    // free
    const idx = blocks.findIndex((b) => b.alloc && b.name === o.name);
    if (idx < 0) return;
    const self = blocks[idx];
    const freed: Blk = {
      ...self,
      alloc: false,
      name: kind === "explicit" ? self.name : undefined,
    };
    blocks = blocks.map((b, i) => (i === idx ? freed : b));
    const insert = (names: string[], name: string) =>
      cfg.insert === "address"
        ? byAddr([...names, name], blocks)
        : [name, ...names];

    if (!cfg.coalesce) {
      if (kind === "explicit") list = insert(list, freed.name!);
      push({
        msg:
          kind === "none"
            ? `${o.name}'s ${self.size} words are free again`
            : "Only the allocated bit is cleared",
      });
      return;
    }
    const prev = footers ? blocks[idx - 1] : undefined;
    const next = blocks[idx + 1];
    const pf = !!prev && !prev.alloc;
    const nf = !!next && !next.alloc;
    push({
      hot: [prev, next].filter((b): b is Blk => !!b).map((b) => b.start),
      msg:
        pf && nf
          ? "Both neighbours are free"
          : pf
            ? "Previous block is free"
            : nf
              ? "Next block is free"
              : footers
                ? "Both neighbours allocated"
                : "Next block is allocated",
    });
    if (!pf && !nf && kind !== "explicit") return;
    const parts = [pf ? prev! : null, freed, nf ? next : null].filter(
      (b): b is Blk => !!b,
    );
    const merged: Blk = {
      start: parts[0].start,
      size: parts.reduce((a, b) => a + b.size, 0),
      alloc: false,
      name: freed.name,
    };
    blocks = blocks
      .filter((b) => !parts.includes(b) || b === parts[0])
      .map((b) => (b === parts[0] ? merged : b));
    if (kind === "explicit") {
      const gone = parts.filter((b) => b !== freed).map((b) => b.name);
      list = insert(
        list.filter((n) => !gone.includes(n)),
        merged.name!,
      );
    }
    const where =
      cfg.insert === "address"
        ? "insert in address order"
        : "push onto list head";
    push({
      hot: [merged.start],
      msg:
        parts.length > 1
          ? `Coalesce: ${parts.map((b) => b.size).join(" + ")} = ${merged.size}${kind === "explicit" ? `, ${where}` : ""}`
          : `No merge: ${where}`,
    });
  });
  return frames;
}

// ---- geometry ----
const W = 680;
const LM = 12;
const CELL_H = 32;
const MAX_CW = 34;

export default function HeapSim({
  blocks: specs,
  words = 16,
  ops = [],
  list: kind = "none",
  footers = false,
  policy = "first",
  coalesce = false,
  insert = "lifo",
  freeOrder,
  rover: roverIdx,
  variants,
  stats = false,
}: Props) {
  const [vi, setVi] = useState(0);
  const v = variants?.[vi];
  const cfg: Settings = {
    ops: v?.ops ?? ops,
    policy: v?.policy ?? policy,
    coalesce: v?.coalesce ?? coalesce,
    insert: v?.insert ?? insert,
    freeOrder: v?.freeOrder ?? freeOrder,
  };
  const init = useMemo(
    () => layout(specs ?? [{ size: words }]),
    [JSON.stringify(specs), words],
  );
  const frames = useMemo(
    () => simulate(init, kind, footers, roverIdx, cfg),
    [
      init,
      kind,
      footers,
      roverIdx,
      cfg.ops.join("|"),
      cfg.policy,
      cfg.coalesce,
      cfg.insert,
      cfg.freeOrder?.join("|"),
    ],
  );
  const opList = useMemo(() => cfg.ops.map(parseOp), [cfg.ops.join("|")]);
  const last = frames.length - 1;
  const stepper = useStepper(last, { intervalMs: 1300 });
  const f = frames[Math.min(stepper.step, last)];

  const total = init.reduce((a, b) => a + b.size, 0);
  const hdr = kind === "none" ? 0 : 1;
  const ftr = footers ? 1 : 0;
  // Leave room on the right for a request that spills past the end of the heap.
  const spill = Math.max(
    0,
    ...frames.map((fr) => (fr.ghost ? fr.ghost.at + fr.ghost.len - total : 0)),
  );
  const cw = Math.min(MAX_CW, (W - LM - 12) / (total + spill));
  const x = (w: number) => LM + w * cw;

  const arcs = kind !== "none";
  const ROW_Y = arcs ? 62 : 22;
  const NAME_Y = ROW_Y + CELL_H + 17;
  const STATS_Y = NAME_Y + 14;
  const statsH = stats ? 62 : 0;
  const LIST_Y = STATS_Y + statsH + 6;
  const listH = kind === "explicit" ? 46 : 0;
  const H = LIST_Y + listH + 4;

  // Every block boundary that appears in any frame, so boundaries can fade in and out.
  const bounds = useMemo(() => {
    const set = new Set<number>();
    for (const fr of frames)
      for (const b of fr.blocks) if (b.start > 0) set.add(b.start);
    return [...set];
  }, [frames]);
  const startsNow = new Set(f.blocks.map((b) => b.start));

  // Role of every word in this frame.
  const cellInfo = Array.from({ length: total }, () => ({
    role: "free" as "free" | "alloc" | "hdr" | "ftr" | "link",
    blk: null as Blk | null,
    text: "",
  }));
  for (const b of f.blocks) {
    for (let w = b.start; w < b.start + b.size; w++) {
      const c = cellInfo[w];
      c.blk = b;
      const off = w - b.start;
      if (hdr && off === 0) {
        c.role = "hdr";
        c.text = String(b.size);
      } else if (ftr && off === b.size - 1) {
        c.role = "ftr";
        c.text = String(b.size);
      } else if (b.alloc) c.role = "alloc";
      else if (kind === "explicit" && off - hdr < 2) {
        c.role = "link";
        c.text = off - hdr === 0 ? "succ" : "pred";
      } else c.role = "free";
    }
  }
  const freeBlocks = f.blocks.filter((b) => !b.alloc);
  const freeTotal = freeBlocks.reduce((a, b) => a + b.size, 0);
  const largest = Math.max(0, ...freeBlocks.map((b) => b.size));
  const hdrX = (b: Blk) => x(b.start) + (hdr ? cw / 2 : 0);

  const arcPath = (x0: number, x1: number, y: number, up = true) => {
    const h =
      Math.min(ROW_Y - 14, 10 + Math.abs(x1 - x0) * 0.22) * (up ? -1 : 1);
    return `M${x0},${y} C${x0},${y + h} ${x1},${y + h} ${x1},${y}`;
  };
  const blkOf = (start: number) => f.blocks.find((b) => b.start === start);

  return (
    <div className={`not-content ${s.root}`} {...stepper.keyProps}>
      <StepControls
        stepper={stepper}
        counter={`step ${stepper.step} / ${last}`}
      >
        {variants && (
          <div className={s.seg} role="group" aria-label="Mode">
            {variants.map((vv, i) => (
              <button
                key={vv.label}
                className={`viz-btn ${i === vi ? s.on : ""}`}
                aria-pressed={i === vi}
                onClick={() => {
                  setVi(i);
                  stepper.reset();
                }}
              >
                {vv.label}
              </button>
            ))}
          </div>
        )}
      </StepControls>

      <div className={s.ops}>
        {opList.map((o, i) => (
          <code
            key={i}
            className={`${s.op} ${i === f.op ? s.opNow : i < f.op ? s.opDone : ""}`}
          >
            {o.text}
          </code>
        ))}
        {kind !== "none" && f.op >= 0 && opList[f.op]?.kind === "malloc" && (
          <span className={s.reads}>
            {f.need !== null && (
              <>
                need <b>{f.need}</b>{" "}
                <span className={s.needWhy}>
                  ({(opList[f.op] as { words: number }).words} +{" "}
                  {ftr ? "header, footer" : "header"})
                </span>
              </>
            )}
            <span className={s.readsGap} />
            blocks checked <b>{f.reads}</b>
          </span>
        )}
      </div>

      <p className={`${s.msg} ${f.fail ? s.msgFail : ""}`}>{f.msg || " "}</p>

      <div className={s.scroll}>
        <svg
          className={s.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Heap words"
        >
          <defs>
            <pattern
              id="hs-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" className={s.hatchBg} />
              <line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
            </pattern>
            <marker
              id="hs-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={s.arrowHead} />
            </marker>
            <marker
              id="hs-arrow-succ"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={s.succHead} />
            </marker>
          </defs>

          {/* implicit list: every header points at the next header */}
          {kind === "implicit" &&
            f.blocks.map((b, i) => {
              const nx = f.blocks[i + 1];
              const x1 = nx ? hdrX(nx) : x(total);
              return (
                <path
                  key={`${b.start}-${b.size}`}
                  className={s.arc}
                  d={arcPath(hdrX(b), x1, ROW_Y - 1)}
                  markerEnd="url(#hs-arrow)"
                />
              );
            })}
          {/* explicit list: succ links, only among free blocks */}
          {kind === "explicit" &&
            f.list.map((n, i) => {
              const a = f.blocks.find((b) => !b.alloc && b.name === n);
              const nb = f.blocks.find(
                (b) => !b.alloc && b.name === f.list[i + 1],
              );
              if (!a || !nb) return null;
              return (
                <path
                  key={`${n}-${a.start}-${nb.start}`}
                  className={s.succ}
                  d={arcPath(x(a.start + hdr) + cw / 2, hdrX(nb), ROW_Y - 1)}
                  markerEnd="url(#hs-arrow-succ)"
                />
              );
            })}

          {/* words */}
          {cellInfo.map((c, w) => {
            const b = c.blk!;
            const isFresh = f.fresh === b.start && b.alloc;
            const cls = [
              s.cell,
              s[c.role],
              b.alloc && (c.role === "hdr" || c.role === "ftr") && s.tagAlloc,
              isFresh && s.fresh,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <g key={w} className={cls}>
                <rect x={x(w)} y={ROW_Y} width={cw} height={CELL_H} />
                {(c.role === "hdr" || c.role === "ftr") && (
                  <text
                    x={x(w) + cw / 2}
                    y={ROW_Y + CELL_H / 2 + 4.5}
                    textAnchor="middle"
                  >
                    {c.text}
                  </text>
                )}
                {c.role === "link" && (
                  <circle
                    cx={x(w) + cw / 2}
                    cy={ROW_Y + CELL_H / 2}
                    r={3}
                    className={c.text === "succ" ? s.succDot : s.predDot}
                  />
                )}
              </g>
            );
          })}
          {/* padding inside allocated blocks that couldn't be split off */}
          {f.blocks
            .filter((b) => b.alloc)
            .map((b) => {
              const o = opList.find(
                (op) => op.kind === "malloc" && op.name === b.name,
              );
              if (!o || o.kind !== "malloc") return null;
              const used = o.words + hdr + ftr;
              if (b.size <= used) return null;
              return (
                <rect
                  key={`pad${b.start}`}
                  className={s.pad}
                  x={x(b.start + used - ftr)}
                  y={ROW_Y}
                  width={(b.size - used) * cw}
                  height={CELL_H}
                  fill="url(#hs-hatch)"
                />
              );
            })}
          {/* block boundaries: fade in on a split, out on a merge */}
          {bounds.map((w) => (
            <line
              key={w}
              className={`${s.bound} ${startsNow.has(w) ? "" : s.boundGone}`}
              x1={x(w)}
              x2={x(w)}
              y1={ROW_Y - 3}
              y2={ROW_Y + CELL_H + 3}
            />
          ))}
          <rect
            className={s.frame}
            x={x(0)}
            y={ROW_Y}
            width={total * cw}
            height={CELL_H}
          />

          {/* names */}
          {f.blocks.map(
            (b) =>
              b.name &&
              (b.alloc || kind === "explicit") && (
                <text
                  key={`n${b.start}-${b.name}`}
                  className={`${s.name} ${b.alloc ? "" : s.nameFree} ${f.fresh === b.start ? s.nameFresh : ""}`}
                  x={x(b.start + b.size / 2)}
                  y={NAME_Y}
                  textAnchor="middle"
                >
                  {b.name}
                </text>
              ),
          )}

          {/* highlights */}
          {f.best !== null && blkOf(f.best) && (
            <rect
              className={s.best}
              x={x(f.best) + 1}
              y={ROW_Y + 1}
              width={blkOf(f.best)!.size * cw - 2}
              height={CELL_H - 2}
              rx={3}
            />
          )}
          {f.hot.map((st) => {
            const b = blkOf(st);
            return b ? (
              <rect
                key={`h${st}`}
                className={s.hot}
                x={x(st)}
                y={ROW_Y - 2}
                width={b.size * cw}
                height={CELL_H + 4}
                rx={4}
              />
            ) : null;
          })}

          {/* the request, laid over the candidate: the part that doesn't fit spills over in pink */}
          {f.ghost && (
            <g
              className={s.ghostG}
              style={{ transform: `translateX(${x(f.ghost.at)}px)` }}
            >
              <rect
                className={s.ghostIn}
                x={0}
                y={ROW_Y - 5}
                width={Math.min(f.ghost.len, f.ghost.room) * cw}
                height={CELL_H + 10}
                rx={4}
              />
              {f.ghost.len > f.ghost.room && (
                <rect
                  className={s.ghostOut}
                  x={f.ghost.room * cw}
                  y={ROW_Y - 5}
                  width={(f.ghost.len - f.ghost.room) * cw}
                  height={CELL_H + 10}
                  rx={4}
                />
              )}
            </g>
          )}

          {/* search cursor and next-fit rover */}
          {f.rover !== null && (
            <path
              className={s.rover}
              style={{
                transform: `translateX(${x(f.rover) + (hdr ? cw / 2 : 0)}px)`,
              }}
              d={`M-6,${ROW_Y - 20} L6,${ROW_Y - 20} L0,${ROW_Y - 9} z`}
            />
          )}
          {f.cursor !== null && (
            <path
              className={s.cursor}
              style={{
                transform: `translateX(${x(f.cursor) + (hdr ? cw / 2 : 0)}px)`,
              }}
              d={`M-7,${ROW_Y - 22} L7,${ROW_Y - 22} L0,${ROW_Y - 8} z`}
            />
          )}

          {stats && (
            <g className={s.stats}>
              {[
                ["free in total", freeTotal],
                ["largest free block", largest],
              ].map(([label, n], i) => {
                const wide = (n as number) * cw > 170;
                const y = STATS_Y + i * 26;
                return (
                  <g key={label as string}>
                    <rect
                      className={s.statFree}
                      x={x(0)}
                      y={y}
                      width={(n as number) * cw}
                      height={18}
                      rx={3}
                    />
                    <text
                      className={s.statLabel}
                      x={wide ? x(0) + 7 : x(n as number) + 6}
                      y={y + 13}
                    >
                      {label}: <tspan className={s.statNum}>{n}</tspan>
                    </text>
                  </g>
                );
              })}
              {f.need !== null && (
                <>
                  <line
                    className={s.needLine}
                    x1={x(f.need)}
                    x2={x(f.need)}
                    y1={STATS_Y - 4}
                    y2={STATS_Y + 48}
                  />
                  <text
                    className={s.needLabel}
                    x={x(f.need)}
                    y={STATS_Y + 58}
                    textAnchor="middle"
                  >
                    need {f.need}
                  </text>
                </>
              )}
            </g>
          )}

          {kind === "explicit" && (
            <g>
              <text className={s.listHead} x={LM} y={LIST_Y + 24}>
                free_list
              </text>
              {f.list.map((n, i) => {
                const b = f.blocks.find((bb) => !bb.alloc && bb.name === n);
                const nx = 96 + i * 92;
                return (
                  <g
                    key={n}
                    className={s.node}
                    style={{ transform: `translateX(${nx}px)` }}
                  >
                    <rect x={0} y={LIST_Y + 6} width={58} height={28} rx={5} />
                    <text x={29} y={LIST_Y + 25} textAnchor="middle">
                      {n} · {b?.size}
                    </text>
                    {i > 0 && (
                      <>
                        <line
                          className={s.linkSucc}
                          x1={-32}
                          x2={-3}
                          y1={LIST_Y + 14}
                          y2={LIST_Y + 14}
                          markerEnd="url(#hs-arrow-succ)"
                        />
                        <line
                          className={s.linkPred}
                          x1={-3}
                          x2={-32}
                          y1={LIST_Y + 27}
                          y2={LIST_Y + 27}
                          markerEnd="url(#hs-arrow)"
                        />
                      </>
                    )}
                  </g>
                );
              })}
              <line
                className={s.linkSucc}
                x1={LM + 62}
                x2={93}
                y1={LIST_Y + 20}
                y2={LIST_Y + 20}
                markerEnd="url(#hs-arrow-succ)"
              />
            </g>
          )}
        </svg>
      </div>

      <div className={s.legend}>
        <span>
          <i className={s.swAlloc} /> allocated
        </span>
        <span>
          <i className={s.swFresh} /> just allocated
        </span>
        <span>
          <i className={s.swFree} /> free
        </span>
        {hdr > 0 && (
          <span>
            <i className={s.swHdr} /> {ftr ? "header / footer" : "header"}{" "}
            (block size)
          </span>
        )}
        {frames.some((fr) => fr.ghost) && (
          <span>
            <i className={s.swGhost} /> request
          </span>
        )}
        {frames.some((fr) => fr.ghost && fr.ghost.len > fr.ghost.room) && (
          <span>
            <i className={s.swSpill} /> doesn't fit
          </span>
        )}
        {frames.some((fr) => fr.cursor !== null) && (
          <span>
            <i className={s.swCursor} /> search position
          </span>
        )}
        {frames.some((fr) => fr.rover !== null) && (
          <span>
            <i className={s.swRover} /> where next fit resumes
          </span>
        )}
        {kind === "explicit" && (
          <span>
            <i className={s.swSucc} /> succ <i className={s.swPred} /> pred
          </span>
        )}
        <span className={s.unit}>1 cell = 1 word</span>
      </div>
    </div>
  );
}
