// Small figures for the dynamic memory page.
// 'process': a process's address space, with a button that grows the heap (moves brk up).
// 'patterns': memory in use over time for the ramp / plateau / peaks allocation patterns.
import { useState } from "react";
import { ArrowUp, RotateCcw } from "lucide-react";
import s from "./MemFigure.module.css";

interface Props {
  figure: "process" | "patterns";
}

function Process() {
  const [grow, setGrow] = useState(0);
  const X = 200;
  const RW = 280;
  const heapH = 34 + grow * 14;
  // bottom-up regions
  const bottom = 330;
  const text = { y: bottom - 28, h: 28 };
  const data = { y: text.y - 24, h: 24 };
  const bss = { y: data.y - 24, h: 24 };
  const heap = { y: bss.y - heapH, h: heapH };
  const kernel = { y: 10, h: 30 };
  const stack = { y: kernel.y + kernel.h, h: 40 };
  const mmap = { y: 112, h: 34 };
  const region = (
    r: { y: number; h: number },
    label: string,
    cls: string,
    key: string,
  ) => (
    <g key={key} className={cls}>
      <rect x={X} y={r.y} width={RW} height={r.h} />
      <text x={X + RW / 2} y={r.y + r.h / 2 + 4.5} textAnchor="middle">
        {label}
      </text>
    </g>
  );
  return (
    <>
      <div className={`viz-controls ${s.controls}`}>
        <button
          onClick={() => setGrow((g) => Math.min(3, g + 1))}
          disabled={grow >= 3}
        >
          <ArrowUp size={15} />
          <span>sbrk: grow the heap</span>
        </button>
        <button onClick={() => setGrow(0)} disabled={grow === 0}>
          <RotateCcw size={15} />
          <span>Reset</span>
        </button>
      </div>
      <div className={s.scroll}>
        <svg
          className={s.svg}
          viewBox="0 0 680 352"
          role="img"
          aria-label="Process memory image"
        >
          <defs>
            <pattern
              id="mf-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" className={s.hatchBg} />
              <line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
            </pattern>
            <marker
              id="mf-arrow"
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
          <rect
            className={s.space}
            x={X}
            y={kernel.y}
            width={RW}
            height={bottom - kernel.y}
          />
          <g className={s.kernel}>
            <rect
              x={X}
              y={kernel.y}
              width={RW}
              height={kernel.h}
              fill="url(#mf-hatch)"
            />
            <text
              x={X + RW / 2}
              y={kernel.y + kernel.h / 2 + 4.5}
              textAnchor="middle"
            >
              kernel virtual memory
            </text>
          </g>
          {region(stack, "stack", s.stack, "stack")}
          {region(mmap, "memory-mapped region (shared libs)", s.mmap, "mmap")}
          <g className={s.heap}>
            <rect x={X} y={heap.y} width={RW} height={heap.h} />
            <text x={X + RW / 2} y={bss.y - 14} textAnchor="middle">
              run-time heap (malloc)
            </text>
          </g>
          {region(bss, "uninitialized data (.bss)", s.seg, "bss")}
          {region(data, "initialized data (.data)", s.seg, "data")}
          {region(text, "program text (.text)", s.seg, "text")}

          {/* growth arrows */}
          <line
            className={s.grow}
            x1={X + RW / 2}
            x2={X + RW / 2}
            y1={stack.y + stack.h + 2}
            y2={stack.y + stack.h + 22}
            markerEnd="url(#mf-arrow)"
          />
          <line
            className={s.grow}
            x1={X + RW / 2}
            x2={X + RW / 2}
            y1={heap.y - 4}
            y2={heap.y - 24}
            markerEnd="url(#mf-arrow)"
          />

          {/* pointers */}
          <g className={s.ptr}>
            <line
              x1={X - 70}
              x2={X - 4}
              y1={stack.y + stack.h}
              y2={stack.y + stack.h}
              markerEnd="url(#mf-arrow)"
            />
            <text x={X - 76} y={stack.y + stack.h + 4} textAnchor="end">
              %esp (stack top)
            </text>
          </g>
          <g
            className={`${s.ptr} ${s.brk}`}
            style={{ transform: `translateY(${heap.y}px)` }}
          >
            <line
              x1={X + RW + 70}
              x2={X + RW + 4}
              y1={0}
              y2={0}
              markerEnd="url(#mf-arrow)"
            />
            <text x={X + RW + 76} y={4}>
              brk (heap top)
            </text>
          </g>
          <text className={s.note} x={X + RW + 14} y={kernel.y + 20}>
            invisible to user code
          </text>
          <text className={s.addr} x={X - 8} y={bottom + 4} textAnchor="end">
            0
          </text>
          <text className={s.addr} x={X - 8} y={kernel.y + 4} textAnchor="end">
            high addresses
          </text>
        </svg>
      </div>
    </>
  );
}

function Patterns() {
  const PW = 200;
  const PH = 90;
  const n = 60;
  const curves: { name: string; desc: string; f: (t: number) => number }[] = [
    {
      name: "Ramp",
      desc: "allocate, never release",
      f: (t) => 0.08 + 0.85 * t + 0.03 * Math.sin(t * 40),
    },
    {
      name: "Plateau",
      desc: "allocate, use a long time, release",
      f: (t) =>
        t < 0.18
          ? (t / 0.18) * 0.85
          : t < 0.82
            ? 0.85
            : Math.max(0.05, 0.85 - ((t - 0.82) / 0.12) * 0.8),
    },
    {
      name: "Peaks",
      desc: "bursts of short-lived objects",
      f: (t) => {
        const p = (t * 4) % 1;
        return (
          0.1 +
          (p < 0.35
            ? (p / 0.35) * 0.75
            : Math.max(0, 0.75 - ((p - 0.35) / 0.15) * 0.75))
        );
      },
    },
  ];
  return (
    <div className={s.scroll}>
      <svg
        className={s.svg}
        viewBox="0 0 680 150"
        role="img"
        aria-label="Allocation patterns: memory in use over time"
      >
        {curves.map((c, i) => {
          const x0 = 20 + i * (PW + 20);
          const y0 = 12;
          const pts = Array.from({ length: n + 1 }, (_, k) => {
            const t = k / n;
            return [x0 + t * PW, y0 + PH - c.f(t) * PH] as const;
          });
          const line = pts
            .map(
              ([px, py], k) =>
                `${k ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`,
            )
            .join(" ");
          return (
            <g key={c.name}>
              <path
                className={s.area}
                d={`${line} L${x0 + PW},${y0 + PH} L${x0},${y0 + PH} z`}
              />
              <path className={s.line} d={line} />
              <line
                className={s.axis}
                x1={x0}
                x2={x0 + PW}
                y1={y0 + PH}
                y2={y0 + PH}
              />
              <line className={s.axis} x1={x0} x2={x0} y1={y0} y2={y0 + PH} />
              <text
                className={s.pname}
                x={x0 + PW / 2}
                y={y0 + PH + 20}
                textAnchor="middle"
              >
                {c.name}
              </text>
              <text
                className={s.pdesc}
                x={x0 + PW / 2}
                y={y0 + PH + 36}
                textAnchor="middle"
              >
                {c.desc}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function MemFigure({ figure }: Props) {
  return (
    <div className={`not-content ${s.root}`}>
      {figure === "process" ? <Process /> : <Patterns />}
      {figure === "patterns" && (
        <p className={s.caption}>memory in use (up) over time (right)</p>
      )}
    </div>
  );
}
