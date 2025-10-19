const { spawn } = require('node:child_process');

const processes = [];
let shuttingDown = false;

function run(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  processes.push(child);

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (code !== 0) {
      shutdown(signal ?? 'SIGTERM', code ?? 1);
    }
  });

  child.on('error', (error) => {
    console.error(`Failed to start ${command} ${args.join(' ')}:`, error);
    shutdown('SIGTERM', 1);
  });

  return child;
}

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) {
      child.kill(signal);
    }
  }

  // Give children a moment to exit gracefully before forcing termination.
  setTimeout(() => {
    process.exit(exitCode);
  }, 100);
}

process.on('SIGINT', () => shutdown('SIGINT', 0));
process.on('SIGTERM', () => shutdown('SIGTERM', 0));

run('npm', ['--workspace', 'server', 'run', 'dev']);
run('npm', ['--workspace', 'client', 'run', 'dev']);

// Keep the process alive until both children exit or we receive a shutdown signal.
Promise.all(
  processes.map(
    (child) =>
      new Promise((resolve) => {
        child.on('close', () => resolve());
      })
  )
).then(() => {
  shutdown('SIGTERM', 0);
});
