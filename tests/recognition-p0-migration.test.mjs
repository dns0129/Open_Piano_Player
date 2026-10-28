import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('P0 migration preserves settled billing records and enforces at most two distinct attempts',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE SCHEMA qinban_control;
    CREATE TABLE qinban_control.attempts(id text PRIMARY KEY,job_id text,region_id text,cost bigint,usage jsonb,UNIQUE(job_id,region_id));
    INSERT INTO qinban_control.attempts VALUES('original','job','row',123,'{"input":10}');`);
  const sql=await readFile(new URL('../db/accounts-recognition-p0.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await db.query('SELECT * FROM qinban_control.attempts')).rows,[{id:'original',job_id:'job',region_id:'row',cost:123,usage:{input:10},attempt:1}]);
  await db.query("INSERT INTO qinban_control.attempts VALUES('repair','job','row',45,'{}',2)");
  await assert.rejects(db.query("INSERT INTO qinban_control.attempts VALUES('duplicate','job','row',45,'{}',2)"),e=>e.code==='23505');
  await assert.rejects(db.query("INSERT INTO qinban_control.attempts VALUES('third','job','row',45,'{}',3)"),e=>e.code==='23514');
  assert.equal((await db.query('SELECT SUM(cost) AS total FROM qinban_control.attempts')).rows[0].total,'168');
});
