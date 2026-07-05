import pool from './database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pgNotify');
const RECONNECT_DELAY_MS = 5000;

/**
 * Open one dedicated connection that LISTENs on the given Postgres channels and
 * dispatches each notification to its handler. Self-heals if the connection
 * drops (a dropped LISTEN silently stops delivering, so we reconnect).
 *
 * @param {Record<string, (payload: string) => void|Promise<void>>} handlers
 *   Map of Postgres channel name → handler receiving the NOTIFY payload string.
 */
export const startNotifyListener = (handlers) => {
  const channels = Object.keys(handlers);
  let listenClient = null;
  let reconnectTimer = null;

  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    if (listenClient) {
      // Destroy the broken client (true) so it leaves the pool cleanly.
      try { listenClient.release(true); } catch { /* already gone */ }
      listenClient = null;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  };

  const connect = async () => {
    try {
      listenClient = await pool.connect();

      listenClient.on('notification', (msg) => {
        const handler = handlers[msg.channel];
        if (!handler) return;
        Promise.resolve(handler(msg.payload)).catch((err) =>
          logger.error(`Error handling ${msg.channel} notification`, err)
        );
      });

      listenClient.on('error', (err) => {
        logger.error('Notify listener connection error', err);
        scheduleReconnect();
      });

      for (const channel of channels) {
        await listenClient.query(`LISTEN ${channel}`);
      }
      logger.info(`Notify listener active (LISTEN ${channels.join(', ')})`);
    } catch (err) {
      logger.error('Failed to start notify listener', err);
      scheduleReconnect();
    }
  };

  connect();
};
