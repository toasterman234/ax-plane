import type { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { createRepositories } from '@axplane/db';
import {
  boardFingerprint,
  buildOperationsBoard,
  parseBoardQuery,
} from './operations-board.js';

type Repo = ReturnType<typeof createRepositories>;

const BOARD_POLL_MS = 1000;

function readBoardQuery(c: Context): ReturnType<typeof parseBoardQuery> {
  return parseBoardQuery({
    agentId: c.req.query('agentId'),
    runKind: c.req.query('runKind'),
    attention: c.req.query('attention'),
  });
}

export function registerOperationsBoardRoutes(app: Hono, repo: Repo) {
  app.get('/operations/board', async (c) => {
    return c.json(await buildOperationsBoard(repo, readBoardQuery(c)));
  });

  app.get('/operations/board/stream', (c) => {
    const query = readBoardQuery(c);
    return streamSSE(c, async (stream) => {
      let lastFingerprint = '';
      let seq = 0;
      let closed = false;

      stream.onAbort(() => {
        closed = true;
      });

      while (!closed) {
        const board = await buildOperationsBoard(repo, query);
        const fingerprint = boardFingerprint(board);

        if (fingerprint !== lastFingerprint) {
          lastFingerprint = fingerprint;
          seq += 1;
          await stream.writeSSE({
            id: String(seq),
            event: 'snapshot',
            data: JSON.stringify(board),
          });
        } else {
          await stream.writeSSE({ event: 'ping', data: '{}' });
        }

        await stream.sleep(BOARD_POLL_MS);
      }
    });
  });
}
