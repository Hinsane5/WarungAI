import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runNightlyJobsMock = vi.hoisted(() => vi.fn());

vi.mock('../src/jobs/index.js', () => ({
  runNightlyJobs: runNightlyJobsMock,
}));

import { app } from '../src/app.js';

const SECRET = process.env.JOBS_TRIGGER_SECRET;

describe('POST /jobs/run-nightly', () => {
  beforeEach(() => {
    runNightlyJobsMock.mockResolvedValue({ restock: {}, credit: {}, crm: {} });
  });
  afterEach(() => vi.clearAllMocks());

  it('rejects requests without the trigger secret', async () => {
    await request(app).post('/jobs/run-nightly').expect(403);
    expect(runNightlyJobsMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    await request(app)
      .post('/jobs/run-nightly')
      .set('x-warungai-jobs-secret', 'nope')
      .expect(403);
    expect(runNightlyJobsMock).not.toHaveBeenCalled();
  });

  it('runs the nightly batch with a valid secret and returns the summary', async () => {
    const res = await request(app)
      .post('/jobs/run-nightly')
      .set('x-warungai-jobs-secret', SECRET)
      .expect(200);

    expect(runNightlyJobsMock).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ ok: true });
  });

  it('returns 500 (so the scheduler retries) when the batch throws', async () => {
    runNightlyJobsMock.mockRejectedValueOnce(new Error('boom'));
    await request(app)
      .post('/jobs/run-nightly')
      .set('x-warungai-jobs-secret', SECRET)
      .expect(500, { ok: false, error: 'jobs_failed' });
  });
});
