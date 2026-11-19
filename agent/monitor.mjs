import { monitorTick, startMonitor } from '../server/monitor.js';
if (process.argv.includes('--once')) console.log(JSON.stringify(await monitorTick(), null, 2));
else {
  const stop = startMonitor();
  for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => { stop(); process.exit(0); });
  console.log('Мониторинг включён. Проверяются только дела с monitor.enabled=true. Ctrl+C — остановить.');
}
