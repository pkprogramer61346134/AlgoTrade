const { spawn } = require('child_process');

console.log("Testing process restart logic...");
console.log("Process ID:", process.pid);
console.log("ExecPath:", process.execPath);
console.log("Argv:", process.argv);

const child = spawn(process.execPath, [require.resolve('../../server/config_manager')], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore'
});
child.unref();

console.log("Spawned child PID:", child.pid);
