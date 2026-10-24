import type { Env } from './types';

export async function readAnnieMemory(env: Env, ownerSub: string) {
  return env.DB.prepare('SELECT snapshot_json FROM annie_owner_archives WHERE owner_sub = ?').bind(ownerSub).first<{snapshot_json: string}>();
}
