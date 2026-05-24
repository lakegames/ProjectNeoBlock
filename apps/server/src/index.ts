import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
dotenv.config({ path: envPath });

import { startServer } from './server.js';

startServer().then(({ port }) => {
  console.log(`server listening on http://localhost:${port}`);
});