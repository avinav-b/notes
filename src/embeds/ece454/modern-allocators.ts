import { embed } from '../types';

export const classicFreeList = embed('PhkMalloc', 'Free list stored in free blocks', 458, { variant: 'classic' });
export const phkPageAllocator = embed('PhkMalloc', 'phkmalloc page allocator', 499, { variant: 'pages' });
export const phkSubPageAllocator = embed('PhkMalloc', 'phkmalloc sub-page allocator', 616, { variant: 'subpage' });
