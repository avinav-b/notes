import { embed } from '../types';

export const insnBuffer = embed('InsnBufferPipeline', 'In-order vs out-of-order issue', 770);
export const registerRenaming = embed('RenameDemo', 'Register renaming', 690, {
	program: ['div r2,r3 -> r1', 'add r2,r1 -> r3', 'subi r4,4 -> r2', 'add r4,r2 -> r1'],
	archRegs: 4,
	physRegs: 8,
});
