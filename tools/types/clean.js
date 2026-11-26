import { rm } from 'node:fs/promises';

await rm(new URL('../../dist/types/', import.meta.url), { recursive: true, force: true });
