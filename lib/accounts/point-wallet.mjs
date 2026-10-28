import { fail, id, iso } from './common.mjs';
import { POINTS_PER_REGION, TRIAL_POINTS } from './subscription-catalog.mjs';

export function createPointWallet({ db, now = () => Date.now() }) {
  const date = () => new Date(now()).toISOString();
  const event = (tx, owner, kind, amount, reference) => tx.query(
    'INSERT INTO qinban_control.point_events VALUES($1,$2,$3,$4,$5,$6)', [id(), owner, kind, amount, reference, date()]);
  async function grant(tx, owner, { key, kind, amount, startsAt = date(), expiresAt = null, productId = null, billingDay = null }) {
    const added = (await tx.query('INSERT INTO qinban_control.point_grants(id,owner_id,kind,product_id,amount,starts_at,expires_at,billing_day,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id',
      [key, owner, kind, productId, amount, startsAt, expiresAt, billingDay, date()])).rows.length > 0;
    if (added) await event(tx, owner, kind, amount, key);
    return added;
  }
  async function lock(tx, owner) {
    const added = (await tx.query('INSERT INTO qinban_control.point_accounts VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING owner_id', [owner, date()])).rows.length;
    await tx.query('SELECT owner_id FROM qinban_control.point_accounts WHERE owner_id=$1 FOR UPDATE', [owner]);
    if (added) {
      await grant(tx, owner, { key: 'trial:' + owner, kind: 'trial', amount: TRIAL_POINTS });
      // Honor old unspent one-time task bonuses at the former maximum 30 rows/task.
      // Old monthly free task limits stay historical and do not renew as points.
      const granted = Number((await tx.query('SELECT COALESCE(SUM(amount),0) AS n FROM qinban_control.task_credits WHERE owner_id=$1', [owner])).rows[0].n);
      const spent = Number((await tx.query('SELECT COUNT(*) AS n FROM qinban_control.job_index WHERE owner_id=$1 AND uses_credit=true AND slot_released=false', [owner])).rows[0].n);
      if (granted > spent) await grant(tx, owner, { key: 'legacy:' + owner, kind: 'legacy', amount: (granted - spent) * 30 * POINTS_PER_REGION });
    }
  }
  async function balance(tx, owner) {
    await lock(tx, owner);
    const rows = (await tx.query('SELECT * FROM qinban_control.point_grants WHERE owner_id=$1 ORDER BY expires_at NULLS LAST,created_at', [owner])).rows;
    const active = rows.filter(g => new Date(g.starts_at).getTime() <= now() && (!g.expires_at || new Date(g.expires_at).getTime() > now()));
    const current = active.find(g => g.kind === 'monthly');
    return {
      unit: 'point', remaining: active.reduce((n, g) => n + g.amount - g.spent - g.held, 0),
      held: rows.reduce((n, g) => n + g.held, 0), pointsPerRegion: POINTS_PER_REGION,
      subscription: current ? { productId: current.product_id, startsAt: iso(current.starts_at), expiresAt: iso(current.expires_at), autoRenew: false } : null,
      grants: rows.map(g => ({ id: g.id, kind: g.kind, productId: g.product_id, amount: g.amount, remaining: g.amount - g.spent - g.held, held: g.held, startsAt: iso(g.starts_at), expiresAt: g.expires_at ? iso(g.expires_at) : null,
        state: new Date(g.starts_at).getTime() > now() ? 'scheduled' : g.expires_at && new Date(g.expires_at).getTime() <= now() ? 'expired' : 'active' })),
    };
  }
  async function reserve(tx, owner, jobId, regionIds) {
    const quota = await balance(tx, owner), amount = regionIds.length * POINTS_PER_REGION;
    if (!amount || new Set(regionIds).size !== regionIds.length) throw fail('INVALID_POINT_QUOTE', '识谱积分估价无效。');
    if (quota.remaining < amount) throw fail('POINTS_INSUFFICIENT', `积分不足，本次需要 ${amount} 积分，当前可用 ${quota.remaining} 积分。`, 402);
    await tx.query('INSERT INTO qinban_control.point_jobs(job_id,owner_id,region_ids,points_per_region,reserved,created_at) VALUES($1,$2,$3,$4,$5,$6)', [jobId, owner, JSON.stringify(regionIds), POINTS_PER_REGION, amount, date()]);
    let left = amount;
    for (const g of quota.grants.filter(g => g.state === 'active' && g.remaining > 0)) {
      const take = Math.min(left, g.remaining);
      await tx.query('UPDATE qinban_control.point_grants SET held=held+$1 WHERE id=$2', [take, g.id]);
      await tx.query('INSERT INTO qinban_control.point_allocations(job_id,grant_id,amount) VALUES($1,$2,$3)', [jobId, g.id, take]);
      left -= take; if (!left) break;
    }
    await event(tx, owner, 'reserve', -amount, jobId);
  }
  async function settle(tx, jobId) {
    let j = (await tx.query('SELECT * FROM qinban_control.point_jobs WHERE job_id=$1', [jobId])).rows[0];
    if (!j || j.state !== 'held') return;
    await lock(tx, j.owner_id);
    j = (await tx.query('SELECT * FROM qinban_control.point_jobs WHERE job_id=$1 FOR UPDATE', [jobId])).rows[0];
    if (j.state !== 'held') return;
    // Private rows are read in the owner's existing RLS transaction. Reused rows
    // were excluded from region_ids at reservation and can never be charged twice.
    const rows = (await tx.query("SELECT region_id FROM qinban_private.recognition_regions WHERE owner_id=$1 AND job_id=$2 AND state='complete' AND result->'checks'->>'passed'='true'", [j.owner_id, jobId])).rows;
    const complete = new Set(rows.map(r => r.region_id));
    const charged = j.region_ids.filter(r => complete.has(r)).length * j.points_per_region;
    let left = charged;
    const allocations = (await tx.query('SELECT a.*,g.expires_at,g.created_at FROM qinban_control.point_allocations a JOIN qinban_control.point_grants g ON g.id=a.grant_id WHERE job_id=$1 ORDER BY g.expires_at NULLS LAST,g.created_at', [jobId])).rows;
    for (const a of allocations) {
      const used = Math.min(left, a.amount);
      await tx.query('UPDATE qinban_control.point_grants SET held=held-$1,spent=spent+$2 WHERE id=$3', [a.amount, used, a.grant_id]);
      await tx.query('UPDATE qinban_control.point_allocations SET charged=$1 WHERE job_id=$2 AND grant_id=$3', [used, jobId, a.grant_id]); left -= used;
    }
    await tx.query("UPDATE qinban_control.point_jobs SET state='settled',charged=$1,settled_at=$2 WHERE job_id=$3", [charged, date(), jobId]);
    await event(tx, j.owner_id, 'settle', j.reserved - charged, jobId);
  }
  async function refund(tx, jobId) {
    let j = (await tx.query('SELECT * FROM qinban_control.point_jobs WHERE job_id=$1', [jobId])).rows[0];
    if (!j) return null;
    await lock(tx, j.owner_id);
    j = (await tx.query('SELECT * FROM qinban_control.point_jobs WHERE job_id=$1 FOR UPDATE', [jobId])).rows[0];
    if (j.state !== 'settled') throw fail('TASK_ACTIVE', '请等待任务结算后补偿积分。', 409);
    const amount = j.charged - j.refunded;
    if (amount > 0) {
      // A compensation is permanent so that an expired monthly grant cannot swallow it.
      await grant(tx, j.owner_id, { key: 'refund:' + jobId, kind: 'compensation', amount });
      await tx.query('UPDATE qinban_control.point_jobs SET refunded=charged WHERE job_id=$1', [jobId]);
    }
    return { jobId, refunded: true, refundedPoints: amount };
  }
  return { lock, grant, balance, reserve, settle, refund,
    async grantInvite(owner, amount, source) {
      return db.control(async tx => {
        await lock(tx, owner);
        if ((await tx.query('SELECT id FROM qinban_control.task_credits WHERE id=$1', [source.id])).rows.length) return false;
        return grant(tx, owner, { key: 'invite:' + source.id, kind: 'invite', amount: amount * 30 * POINTS_PER_REGION });
      });
    },
    async account(owner) {
      return db.control(async tx => ({ ...await balance(tx, owner), events: (await tx.query('SELECT kind,amount,reference,created_at FROM qinban_control.point_events WHERE owner_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100', [owner])).rows.map(e => ({ ...e, createdAt: iso(e.created_at) })) }));
    },
    async jobView(tx, jobId) {
      const j = (await tx.query('SELECT reserved,charged,refunded,state FROM qinban_control.point_jobs WHERE job_id=$1', [jobId])).rows[0];
      return j ? { reserved: j.reserved, charged: j.charged, refunded: j.refunded, state: j.state } : null;
    },
  };
}
