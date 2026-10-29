import {rename} from 'node:fs/promises';
await rename('dist/preview.html','dist/index.html');
