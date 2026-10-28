// Minimal Telegram Bot API client on top of Node's fetch (Node 18+).
import { env } from './env.js';

const BASE = () => `${env.apiBase}/bot${env.token}`;

export class TgError extends Error {
  constructor(method, body) {
    super(`${method}: ${body.description}`);
    this.code = body.error_code;
    this.retryAfter = body.parameters?.retry_after;
  }
}

/** Calls a Bot API method. `files` = { field: { name, data: Buffer|string, type } } for uploads. */
export async function api(method, params = {}, files = null) {
  let init;
  if (files) {
    const form = new FormData();
    for (const [k, v] of Object.entries(params))
      if (v !== undefined) form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    for (const [k, f] of Object.entries(files)) form.append(k, new Blob([f.data], { type: f.type || 'application/octet-stream' }), f.name);
    init = { method: 'POST', body: form };
  } else {
    init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) };
  }
  const res = await fetch(`${BASE()}/${method}`, init);
  const body = await res.json();
  if (!body.ok) {
    if (body.parameters?.retry_after) {
      await sleep(body.parameters.retry_after * 1000 + 200);
      return api(method, params, files);
    }
    throw new TgError(method, body);
  }
  return body.result;
}

/** Downloads a file the bot can see (≤ 20 MB) and returns its contents. */
export async function download(fileId) {
  const f = await api('getFile', { file_id: fileId });
  const res = await fetch(`${env.apiBase}/file/bot${env.token}/${f.file_path}`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
