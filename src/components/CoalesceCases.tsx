// The four constant-time coalescing cases with boundary tags. Block n is freed; its header and footer
// let the allocator read the previous block's footer and the next block's header, then merge.
import { useState } from "react";
import { StepControls, useStepper } from "./StepControls";
import s from "./CoalesceCases.module.css";

interface Props {
  /** Initial case, 1 to 4. */
  initial?: number;
}

// [previous allocated, next allocated] for cases 1..4
const CASES: [boolean, boolean][] = [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
];

const W = 680;
const TAG = 80;
const PAY = 22;
const NPAY = 2;
const BLK = TAG * 2 + PAY * NPAY;
const X0 = (W - BLK * 3) / 2;
const ROW_Y = 64;
const CELL_H = 36;

type Name = "m1" | "n" | "m2";
const NAMES: Name[] = ["m1", "n", "m2"];
const bx = (i: number) => X0 + i * BLK;

export default function CoalesceCases({ initial = 1 }: Props) {
  const [ci, setCi] = useState(Math.min(4, Math.max(1, initial)) - 1);
  const stepper = useStepper(2, { intervalMs: 1600 });
  const step = stepper.step;
  const [pa, na] = CASES[ci];

  const mergePrev = step === 2 && !pa;
  const mergeNext = step === 2 && !na;
  const alloc: Record<Name, boolean> = { m1: pa, n: step < 2, m2: na };
  // merged span (block indices) once freed
  const lo = mergePrev ? 0 : 1;
  const hi = mergeNext ? 2 : 1;
  const sizeExpr = ["n", !pa && "m1", !na && "m2"].filter(Boolean).join("+");

  const msg =
    step === 0
      ? "Block n is about to be freed"
      : step === 1
        ? "Read the neighbours’ tags: allocated?"
        : pa && na
          ? "Neither neighbour free: just clear n’s bit"
          : `Merge: header and footer become ${sizeExpr} | 0`;

  // Tags: header (side 0) and footer (side 1) of each block.
  const tags = NAMES.flatMap((nm, i) =>
    [0, 1].map((side) => {
      const x = side === 0 ? bx(i) : bx(i) + BLK - TAG;
      const inMerge = step === 2 && i >= lo && i <= hi;
      const isOuter =
        inMerge && ((side === 0 && i === lo) || (side === 1 && i === hi));
      const inner = inMerge && !isOuter;
      const changed = step === 2 && (isOuter || (i === 1 && pa && na));
      const label = isOuter ? sizeExpr : nm;
      const bit = alloc[nm] && !inMerge ? 1 : inMerge ? 0 : alloc[nm] ? 1 : 0;
      const checked =
        step === 1 && ((i === 0 && side === 1) || (i === 2 && side === 0));
      return {
        key: `${nm}${side}`,
        x,
        inner,
        changed,
        label,
        bit,
        checked,
        free: !alloc[nm] || inMerge,
      };
    }),
  );

  const brackets =
    step === 2
      ? [
          ...NAMES.map((nm, i) => ({ nm, i, j: i, label: nm })).filter(
            (b) => b.i < lo || b.i > hi,
          ),
          { nm: "merged", i: lo, j: hi, label: sizeExpr },
        ]
      : NAMES.map((nm, i) => ({ nm, i, j: i, label: nm }));

  return (
    <div className={`not-content ${s.root}`} {...stepper.keyProps}>
      <StepControls
        stepper={stepper}
        speed={false}
        counter={`step ${step} / 2`}
      >
        <div className={s.seg} role="group" aria-label="Case">
          {CASES.map(([p, n], i) => (
            <button
              key={i}
              className={`viz-btn ${i === ci ? s.on : ""}`}
              aria-pressed={i === ci}
              onClick={() => {
                setCi(i);
                stepper.reset();
              }}
              title={`previous ${p ? "allocated" : "free"}, next ${n ? "allocated" : "free"}`}
            >
              Case {i + 1}
              <span className={s.glyph} aria-hidden="true">
                <i className={p ? s.gA : s.gF} />
                <i className={s.gN} />
                <i className={n ? s.gA : s.gF} />
              </span>
            </button>
          ))}
        </div>
      </StepControls>

      <p className={s.msg}>{msg}</p>

      <div className={s.scroll}>
        <svg
          className={s.svg}
          viewBox={`0 0 ${W} 150`}
          role="img"
          aria-label="Coalescing with boundary tags"
        >
          <defs>
            <marker
              id="cc-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" className={s.head} />
            </marker>
          </defs>

          {/* context: the heap continues on both sides */}
          <text
            className={s.dots}
            x={X0 - 14}
            y={ROW_Y + CELL_H / 2 + 5}
            textAnchor="end"
          >
            …
          </text>
          <text
            className={s.dots}
            x={X0 + BLK * 3 + 14}
            y={ROW_Y + CELL_H / 2 + 5}
          >
            …
          </text>

          {/* payload cells */}
          {NAMES.map((nm, i) =>
            Array.from({ length: NPAY }, (_, k) => (
              <rect
                key={`${nm}p${k}`}
                className={`${s.cell} ${alloc[nm] ? s.alloc : s.free}`}
                x={bx(i) + TAG + k * PAY}
                y={ROW_Y}
                width={PAY}
                height={CELL_H}
              />
            )),
          )}

          {/* header / footer tags */}
          {tags.map((t) => (
            <g
              key={t.key}
              className={`${s.tag} ${t.inner ? s.inner : ""} ${t.free ? s.tagFree : s.tagAlloc} ${t.changed ? s.changed : ""} ${t.checked ? s.checked : ""}`}
            >
              <rect x={t.x} y={ROW_Y} width={TAG} height={CELL_H} />
              <line
                className={s.div}
                x1={t.x + TAG - 18}
                x2={t.x + TAG - 18}
                y1={ROW_Y}
                y2={ROW_Y + CELL_H}
              />
              <text
                className={s.size}
                x={t.x + (TAG - 18) / 2}
                y={ROW_Y + CELL_H / 2 + 4.5}
                textAnchor="middle"
              >
                {t.label}
              </text>
              <text
                className={s.bit}
                x={t.x + TAG - 9}
                y={ROW_Y + CELL_H / 2 + 4.5}
                textAnchor="middle"
              >
                {t.bit}
              </text>
            </g>
          ))}

          {/* block boundaries: fade out where blocks merge */}
          {[1, 2].map((i) => {
            const gone =
              step === 2 && ((i === 1 && mergePrev) || (i === 2 && mergeNext));
            return (
              <line
                key={i}
                className={`${s.bound} ${gone ? s.gone : ""}`}
                x1={bx(i)}
                x2={bx(i)}
                y1={ROW_Y - 4}
                y2={ROW_Y + CELL_H + 4}
              />
            );
          })}
          <rect
            className={s.frame}
            x={X0}
            y={ROW_Y}
            width={BLK * 3}
            height={CELL_H}
          />

          {/* block being freed */}
          {step < 2 && (
            <rect
              className={s.target}
              x={bx(1) + 2}
              y={ROW_Y - 5}
              width={BLK - 4}
              height={CELL_H + 10}
              rx={4}
            />
          )}

          {/* the two reads */}
          {step === 1 && (
            <g className={s.reads}>
              <path
                d={`M${bx(1) + TAG / 2},${ROW_Y - 6} C${bx(1) + TAG / 2},${ROW_Y - 40} ${bx(1) - TAG / 2},${ROW_Y - 40} ${bx(1) - TAG / 2},${ROW_Y - 7}`}
                markerEnd="url(#cc-arrow)"
              />
              <path
                d={`M${bx(2) - TAG / 2},${ROW_Y - 6} C${bx(2) - TAG / 2},${ROW_Y - 40} ${bx(2) + TAG / 2},${ROW_Y - 40} ${bx(2) + TAG / 2},${ROW_Y - 7}`}
                markerEnd="url(#cc-arrow)"
              />
              <text x={bx(1) - TAG / 2} y={ROW_Y - 44} textAnchor="middle">
                {pa ? "allocated" : "free"}
              </text>
              <text x={bx(2) + TAG / 2} y={ROW_Y - 44} textAnchor="middle">
                {na ? "allocated" : "free"}
              </text>
            </g>
          )}

          {/* size brackets */}
          {brackets.map((b) => {
            const x1 = bx(b.i) + 3;
            const x2 = bx(b.j) + BLK - 3;
            const y = ROW_Y + CELL_H + 12;
            const merged = b.nm === "merged" && b.i !== b.j;
            return (
              <g
                key={`${b.nm}${b.i}${b.j}`}
                className={`${s.bracket} ${merged ? s.bracketMerged : ""}`}
              >
                <path
                  d={`M${x1},${y - 5} L${x1},${y} L${x2},${y} L${x2},${y - 5}`}
                />
                <text x={(x1 + x2) / 2} y={y + 17} textAnchor="middle">
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className={s.legend}>
        <span>
          <i className={s.swAlloc} /> allocated
        </span>
        <span>
          <i className={s.swFree} /> free
        </span>
        <span>
          <i className={s.swTag} /> header / footer: size | a
        </span>
        <span>
          <i className={s.swRead} /> check if allocated
        </span>
      </div>
    </div>
  );
}
