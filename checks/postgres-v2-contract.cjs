// Ephemeral PostgreSQL 17 contract test; NO Supabase/production network is involved.
// The SQL fixture simulates auth.uid via session claims, NOT actual JWT verification.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync, execFile} = require('node:child_process');
const {promisify} = require('node:util');
const execFileAsync = promisify(execFile);
const P = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PARENT_A = '11111111-1111-4111-8111-111111111111';
const PARENT_B = '22222222-2222-4222-8222-222222222222';
const CHILD = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';
const creds = { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'postgres' };
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432', '-U', process.env.PGUSER || 'postgres', '-d', process.env.PGDATABASE || 'kaixin_ci'];
function cmd(sql) {
  return execFileSync('psql', [...args, '-c', sql], { env: creds, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
}
async function cmdAsync(sql) {
  const { stdout } = await execFileAsync('psql', [...args, '-c', sql], {env:creds, maxBuffer: 1024*1024});
  return stdout.trim();
}
function session(user, statement, role='authenticated') {
  const identity = user ? "SET LOCAL request.jwt.claim.sub = '"+user+"';" : '';
  return "BEGIN; SET LOCAL ROLE "+role+"; "+identity+" "+statement+" COMMIT;";
}
function result(output) {
  const match = output.trim().split(/\r?\n/).map(x=>x.trim()).find(x=>x.startsWith('{') && x.endsWith('}'));
  assert.ok(match, 'expected single JSON response');
  return JSON.parse(match);
}
function one(user, statement, role='authenticated') {
  return result(cmd(session(user,statement,role)));
}
async function oneAsync(user, statement) {
  return result(await cmdAsync(session(user,statement)));
}
function literal(data) {return "'"+JSON.stringify(data).replace(/'/g,"''")+"'::jsonb";}
function uuid() {return require('node:crypto').randomUUID();}
function saveSql(data,rev,op,family=P) {
  return "SELECT public.family_save_v2('"+family+"',"+literal(data)+","+rev+",'"+op+"')::text;";
}
function loadSql(family=P) { return "SELECT public.family_load_v2('"+family+"')::text;"; }
function load(user=PARENT_A, family=P){return one(user,loadSql(family));}
function pgJson(query) {return result(cmd('SELECT row_to_json(t)::text FROM ('+query+') t;'));}
function mustFail(fn, label) {let failed=false;try{fn();}catch(_){failed=true;}assert.equal(failed,true,label);}
async function main() {
  // The fixture file is synthetic and never contains any real family data.
  execFileSync('psql', [...args, '-f', path.join(__dirname,'fixtures/postgres-v2-contract.sql')],
    {env:creds,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const grants=pgJson(`SELECT count(*) AS functions,
    bool_and(CASE WHEN n.nspname='public' THEN
      NOT p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      ELSE p.prosecdef AND NOT has_function_privilege('anon',p.oid,'EXECUTE') END) AS safe
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname IN ('family_load_v2','family_save_v2')
      AND n.nspname IN ('public','kaixin_private')`);
  assert.equal(Number(grants.functions),4,'both public wrappers and both private implementations required');
  assert.equal(grants.safe,true,'public RPCs must be invoker-only; high-privilege logic must be private');
  const first = load(PARENT_A);
  assert.equal(first.ok,true); assert.equal(first.revision,1);
  assert.deepEqual(first.payload.homework.map(x=>x.id),['existing']);
  assert.equal(load(PARENT_B).ok,true, 'second parent can read same family');
  assert.equal(load(CHILD).ok,true, 'child can read assigned family');
  assert.equal(load(OUTSIDER).error,'unauthorized','cross-family user blocked');
  assert.equal(load(PARENT_A, OTHER).error,'unauthorized','parent A cannot access B');
  mustFail(()=>one(null,loadSql(P),'anon'),'anonymous cannot EXECUTE load RPC');
  mustFail(()=>one(null,saveSql({homework:[]},1,uuid()),'anon'),'anonymous cannot EXECUTE save RPC');
  mustFail(()=>cmd(session(PARENT_A,'SELECT count(*) FROM public.family_cloud_data_v2;')),'direct table access forbidden');

  const payloadA={homework:[{id:'existing'},{id:'parent-added'}]};
  const opA=uuid();
  const saved=one(PARENT_A,saveSql(payloadA,1,opA));
  assert.equal(saved.ok,true);assert.equal(saved.revision,2);
  assert.equal(saved.duplicate,false);
  const replay=one(PARENT_A,saveSql(payloadA,1,opA));
  assert.equal(replay.ok,true);assert.equal(replay.duplicate,true);
  assert.equal(replay.revision,2,'request idempotent even with old expected revision');
  assert.equal(one(PARENT_A,saveSql({homework:[]},1,opA)).error,'idempotency_key_reused',
    'reusing op id with different body must be rejected');
  assert.equal(one(PARENT_B,saveSql({homework:[{id:'stale'}]},1,uuid())).error,'conflict',
    'stale device must not overwrite');
  assert.equal(load(PARENT_A).revision,2);
  assert.deepEqual(load(PARENT_A).payload.homework.map(x=>x.id),['existing','parent-added']);
  assert.equal(one(CHILD,saveSql(payloadA,2,uuid())).error,'unauthorized','child must not replace family snapshot');
  assert.equal(one(OUTSIDER,saveSql(payloadA,2,uuid())).error,'unauthorized');

  const payloadB={homework:[...payloadA.homework,{id:'parent-b-added'}]};
  assert.equal(one(PARENT_B,saveSql(payloadB,2,uuid())).revision,3);
  const changed=pgJson("SELECT revision FROM public.kaixin_sync_signal_v2 WHERE family_id='"+P+"'");
  assert.equal(changed.revision,3,'trigger revision matches successful writes');

  const baseRevision=3;
  const raceA={homework:[...payloadB.homework,{id:'race-a'}]};
  const raceB={homework:[...payloadB.homework,{id:'race-b'}]};
  const winnerAndLoser=await Promise.all([
    oneAsync(PARENT_A,saveSql(raceA,baseRevision,uuid())),
    oneAsync(PARENT_B,saveSql(raceB,baseRevision,uuid()))
  ]);
  assert.equal(winnerAndLoser.filter(x=>x.ok===true).length,1,'exactly one racing request commits');
  assert.equal(winnerAndLoser.filter(x=>x.error==='conflict').length,1,'other racing write gets conflict');
  const latest=load(PARENT_A);
  assert.equal(latest.revision,4);
  const remoteIds=new Set(latest.payload.homework.map(x=>x.id));
  assert.equal(remoteIds.has('race-a') && remoteIds.has('race-b'),false,'loser not silently accepted');
  const locallyPending=remoteIds.has('race-a')?'race-b':'race-a';
  const merged={homework:[...latest.payload.homework,{id:locallyPending}]};
  const retry=one(PARENT_A,saveSql(merged,latest.revision,uuid()));
  assert.equal(retry.revision,5,'conflict can be resolved using fresh revision');
  const after=load(PARENT_B);
  assert.deepEqual(new Set(after.payload.homework.map(x=>x.id)),
    new Set(['existing','parent-added','parent-b-added','race-a','race-b']));
  assert.equal(pgJson("SELECT revision FROM public.kaixin_sync_signal_v2 WHERE family_id='"+P+"'").revision,5);
  // Revoke child membership in the ephemeral fixture and confirm server rejects old claims.
  cmd("UPDATE public.family_members_v2 SET revoked_at=now() WHERE family_id='"+P+"' AND user_id='"+CHILD+"';");
  assert.equal(load(CHILD).error,'unauthorized','revoked member denied');
  console.log('PASS PostgreSQL 17: private definer + public invoker, membership isolation, anonymous deny, no raw table access, parent vs child, CAS, concurrent race, idempotency, replay safety, signal trigger, revocation');
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
