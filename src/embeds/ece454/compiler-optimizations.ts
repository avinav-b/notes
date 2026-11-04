import { embed } from '../types';

export const compilerFlow = embed('CompilerFlow', 'Inside a compiler', 174);
export const cfg = embed('BasicBlocks', 'Control flow graph: IR to basic blocks', 618, { variant: 'cfg' });
export const reachingDefs = embed('BasicBlocks', 'Reaching definitions', 557, { variant: 'reaching' });

export const constantProp = embed('CodeSteps', 'Constant propagation and constant folding', 394, {
	steps: [
		{
			label: 'Constant propagation',
			note: 'a and b hold known constants.',
			done: 'The variables are replaced by their values.',
			code: `
{=a = 5;=}
{=b = 3;=}
   :
n = {-a-}{+5+} + {-b-}{+3+};
for (i = 0; i < n; ++i) {
   :
}`,
		},
		{
			label: 'Constant folding',
			note: '5 + 3 only involves constants.',
			done: 'Computed at compile time: no add at run time.',
			code: `
a = 5;
b = 3;
   :
n = {-5 + 3-}{+8+};
for (i = 0; i < n; ++i) {
   :
}`,
		},
		{
			label: 'Constant propagation',
			note: 'Folding made n a constant too.',
			done: 'Another round of propagation.',
			code: `
a = 5;
b = 3;
   :
{=n = 8;=}
for (i = 0; i < {-n-}{+8+}; ++i) {
   :
}`,
		},
	],
});

export const cse = embed('CodeSteps', 'Common sub-expression elimination', 287, {
	steps: [
		{
			label: 'Common sub-expression elimination',
			note: 'c * d is already in a, and c and d have not changed.',
			done: 'One multiply instead of two.',
			code: `
a = {=c * d=};
   :
   :
d = ({-c * d-}{+a+} + t) * u;`,
		},
	],
});

export const copyProp = embed('CodeSteps', 'Copy propagation', 301, {
	steps: [
		{
			label: 'Copy propagation',
			note: 'y is just a copy of x.',
			done: 'Use x directly.',
			code: `
   :
{=y = x;=}
z = 3 + {-y-}{+x+};`,
		},
		{
			label: 'Dead code elimination',
			note: 'Nothing reads y any more.',
			done: 'The copy is gone.',
			code: `
   :
{-y = x;-}
z = 3 + x;`,
		},
	],
});

export const deadCode = embed('CodeSteps', 'Dead code elimination', 394, {
	steps: [
		{
			label: 'Constant propagation',
			note: 'debug is the constant 0.',
			code: `
{=debug = 0;=}  // set to false
   :
if ({-debug-}{+0+}) {
   :
   :
}
a = f(b);`,
		},
		{
			label: 'Dead code elimination',
			note: 'if (0) never runs.',
			done: 'The whole block is removed.',
			code: `
debug = 0;  // set to false
   :
{-if (0) {-}
{-   :-}
{-   :-}
{-}-}
a = f(b);`,
		},
	],
});

export const arrayLayout = embed('ArrayLayout', 'Row-major layout of char a[2][2][2]', 478, { I: 2, J: 2, K: 2 });

const GUTTER = 'runs (I = J = K = 100)';
export const licm = embed('CodeSteps', 'Loop invariant code motion', 482, {
	gutterLabel: GUTTER,
	steps: [
		{
			label: 'Address arithmetic',
			note: 'What a[i][j][k] really costs: the full address, every iteration.',
			code: `
for (i = 0; i < I; ++i) {
  for (j = 0; j < J; ++j) {
    for (k = 0; k < K; ++k) {
      {-a[i][j][k]-}{+*(a + i*J*K + j*K + k)+} = i*j*k; ## 1M
    }
  }
}`,
		},
		{
			label: 'Hoist a + i*J*K',
			note: 'a + i*J*K only changes when i does.',
			done: 'Computed once per i: 100 times, not 1,000,000.',
			code: `
for (i = 0; i < I; ++i) {
  {+t1 = a + i*J*K;  // t1 = a[i]+} ## {+100+}
  for (j = 0; j < J; ++j) {
    for (k = 0; k < K; ++k) {
      *({-a + i*J*K-}{+t1+} + j*K + k) = i*j*k; ## 1M
    }
  }
}`,
		},
		{
			label: 'Hoist t1 + j*K',
			note: 't1 + j*K only changes when j does.',
			done: 'Computed once per j: 10,000 times.',
			code: `
for (i = 0; i < I; ++i) {
  t1 = a + i*J*K;  // t1 = a[i] ## 100
  for (j = 0; j < J; ++j) {
    {+t2 = t1 + j*K;  // t2 = t1[j]+} ## {+10k+}
    for (k = 0; k < K; ++k) {
      {-*(t1 + j*K + k)-}{+t2[k]+} = i*j*k; ## 1M
    }
  }
}`,
		},
		{
			label: 'Hoist i*j',
			note: 'i*j does not depend on k either.',
			done: 'The inner loop is left with one multiply and a store.',
			code: `
for (i = 0; i < I; ++i) {
  t1 = a + i*J*K;  // t1 = a[i] ## 100
  for (j = 0; j < J; ++j) {
    t2 = t1 + j*K;  // t2 = t1[j] ## 10k
    {+tmp = i*j;+} ## {+10k+}
    for (k = 0; k < K; ++k) {
      t2[k] = {-i*j-}{+tmp+}*k; ## 1M
    }
  }
}`,
		},
	],
});

export const inlining = embed('CodeSteps', 'Function inlining', 579, {
	steps: [
		{
			label: 'Inline foo',
			note: 'Replace the call with a copy of the body.',
			done: 'Parameters and locals become renamed variables.',
			code: `
main() {
  …
  {-x = foo(x);-}
  {+{+}
  {+  int foo_z = x;+}
  {+  int foo_m = 5;+}
  {+  int foo_return = foo_z + foo_m;+}
  {+  x = foo_return;+}
  {+}+}
  …
}

{=foo(int z) {=}
{=  int m = 5;=}
{=  return z + m;=}
{=}=}`,
		},
		{
			label: 'Propagate and clean up',
			note: 'Copy and constant propagation now apply across the old call.',
			done: 'No call, no return: just x = x + 5.',
			code: `
main() {
  …
  {-{-}
  {-  int foo_z = x;-}
  {-  int foo_m = 5;-}
  {-  int foo_return = foo_z + foo_m;-}
  {-  x = foo_return;-}
  {-}-}
  {+x = x + 5;+}
  …
}

foo(int z) {
  int m = 5;
  return z + m;
}`,
		},
	],
});

export const unrolling = embed('CodeSteps', 'Loop unrolling', 352, {
	gutterLabel: 'runs',
	steps: [
		{
			label: 'Unroll by 2',
			note: 'Do two iterations of work per trip around the loop.',
			done: 'Half the loop tests and half the j updates.',
			code: `
j = 0;
while (j < {-100-}{+99+}) { ## {-101-}{+51+}
   a[j] = b[j+1];
   {+a[j+1] = b[j+2];+}
   j += {-1-}{+2+}; ## {-100-}{+50+}
}`,
		},
	],
});
