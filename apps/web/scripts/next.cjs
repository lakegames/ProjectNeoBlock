const { spawn, spawnSync } = require('node:child_process');

function runNext(command, extraEnv) {
  const r = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), command], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
  });

  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);

  return r.status ?? 1;
}

function runNextStreaming(command, extraEnv) {
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), command], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

const command = process.argv[2];
if (!command) process.exit(1);

if (command === 'dev' || command === 'start') {
  runNextStreaming(command, {});
  return;
}

let code = runNext(command, {});
if (code === 0) process.exit(0);

code = runNext(command, { NEXT_DISABLE_SWC: '1' });
process.exit(code);
