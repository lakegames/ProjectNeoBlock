import { startServer } from './server.js';

startServer().then(({ port }) => {
  console.log(`server listening on http://localhost:${port}`);
});
