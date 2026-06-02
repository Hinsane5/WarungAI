import { app } from './src/app.js';
import { config } from './src/config/index.js';
import { connectDb, registerDbShutdownHandlers } from './src/config/db.js';
import { registerCronJobs } from './src/jobs/scheduler.js';
import { logger } from './src/utils/logger.js';

async function start() {
  registerDbShutdownHandlers();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'WarungAI server started');
  });

  server.on('error', (error) => {
    logger.error({ err: error }, 'HTTP server failed');
    process.exit(1);
  });

  try {
    await connectDb();
    registerCronJobs();
  } catch (error) {
    logger.error({ err: error }, 'Startup failed');
    server.close(() => {
      process.exit(1);
    });
  }
}

start().catch((error) => {
  logger.error({ err: error }, 'Startup failed');
  process.exit(1);
});
