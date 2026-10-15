import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const owner = '11111111-1111-4111-8111-111111111111',
  friend = '22222222-2222-4222-8222-222222222222',
  stranger = '33333333-3333-4333-8333-333333333333';
test('actual SQL migration preserves old workspaces, isolates users, enforces invitations and protects concurrent saves', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${owner}'),('${friend}'),('${stranger}');`);
    // First reproduce the old personal app's table and a saved owner workspace.
    await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    await db.query('insert into public.applicator_workspaces(user_id,data) values($1,$2)', [
      owner,
      { version: 1, profile: { name: 'Owner before migration' }, jobs: [] },
    ]);
    const migration = await readFile(
      new URL('../supabase/multi-user.sql', import.meta.url),
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration);
    assert.equal(
      (await db.query('select data from public.applicator_workspaces where user_id=$1', [owner]))
        .rows[0].data.profile.name,
      'Owner before migration',
    );
    await db.query(
      "insert into public.applicator_members(email,user_id,role) values('owner@example.com',$1,'admin')",
      [owner],
    );
    await db.query(
      "insert into public.applicator_members(email,invite_digest,expires_at) values('friend@example.com','one-use',now()+interval '1 day')",
    );
    await db.exec('set role service_role');
    await assert.rejects(
      db.query('select public.applicator_accept_invitation($1,$2,$3)', [
        'one-use',
        stranger,
        'other@example.com',
      ]),
      /Invalid invitation/,
    );
    await db.query('select public.applicator_accept_invitation($1,$2,$3)', [
      'one-use',
      friend,
      'friend@example.com',
    ]);
    await assert.rejects(
      db.query('select public.applicator_accept_invitation($1,$2,$3)', [
        'one-use',
        friend,
        'friend@example.com',
      ]),
      /Invalid invitation/,
    );
    const first = await db.query('select public.applicator_save_workspace($1,$2,0) as revision', [
      friend,
      { version: 1, profile: { name: 'Friend' }, jobs: [] },
    ]);
    assert.equal(first.rows[0].revision, 1);
    await assert.rejects(
      db.query('select public.applicator_save_workspace($1,$2,0)', [
        friend,
        { version: 1, profile: { name: 'Stale device' }, jobs: [] },
      ]),
      (e) => e.code === 'PT409',
    );
    await db.query('select public.applicator_save_workspace($1,$2,1)', [
      friend,
      { version: 1, profile: { name: 'Friend updated' }, jobs: [] },
    ]);
    await db.exec('reset role;set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [friend]);
    const own = await db.query('select user_id,data from public.applicator_workspaces');
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0].user_id, friend);
    assert.equal(own.rows[0].data.profile.name, 'Friend updated');
    await assert.rejects(
      db.query('select public.applicator_save_workspace($1,$2,2)', [owner, { version: 1 }]),
      /permission denied/,
    );
    await assert.rejects(db.query('select * from public.applicator_members'), /permission denied/);
    await assert.rejects(
      db.query("update public.applicator_workspaces set data='{}'"),
      /permission denied/,
    );
    await db.exec('reset role');
    await db.query('update public.applicator_members set active=false where user_id=$1', [friend]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.applicator_workspaces')).rows.length, 0);
    await db.exec('reset role;set role service_role');
    await assert.rejects(
      db.query('select public.applicator_save_workspace($1,$2,2)', [friend, { version: 1 }]),
      /Membership required/,
    );
  } finally {
    await db.close();
  }
});
test('database AI and search allowances are enforced atomically across users and requests', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;insert into auth.users values('${owner}'),('${friend}');`,
    );
    await db.exec(await readFile(new URL('../supabase/multi-user.sql', import.meta.url), 'utf8'));
    await db.query(
      "insert into public.applicator_members(email,user_id) values('owner@example.com',$1),('friend@example.com',$2)",
      [owner, friend],
    );
    await db.exec('set role service_role');
    const reserve = async (id) =>
      (await db.query('select public.applicator_reserve_ai($1,2,3) as allowed', [id])).rows[0]
        .allowed;
    assert.equal(await reserve(owner), true);
    assert.equal(await reserve(owner), true);
    assert.equal(await reserve(owner), false);
    assert.equal(await reserve(friend), true);
    assert.equal(await reserve(friend), false);
    await db.exec('reset role');
    await db.query(
      "insert into public.applicator_provider_usage(period,calls) values('month:'||to_char(now() at time zone 'UTC','YYYY-MM'),2000)",
    );
    await db.exec('set role service_role');
    assert.equal(
      (await db.query('select public.applicator_reserve_search() as allowed')).rows[0].allowed,
      false,
    );
    await db.exec('reset role');
    await db.query('delete from public.applicator_provider_usage');
    await db.exec('set role service_role');
    assert.equal(
      (await db.query('select public.applicator_reserve_search() as allowed')).rows[0].allowed,
      true,
    );
  } finally {
    await db.close();
  }
});
