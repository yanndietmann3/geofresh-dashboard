-- GeoFresh v2.3 — Séparation client / super admin + alertes email
-- Client   : lit uniquement SES exploitations, ne pilote rien.
-- Staff    : super_admin (tout) / operator (ses exploitations) → pilotage + acquittement.

-- ── Helpers ────────────────────────────────────────────────────
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('super_admin', 'operator'))
$$;

create or replace function public.has_exploitation(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or exists (select 1 from exploitation_users where exploitation_id = eid and user_id = auth.uid())
$$;

-- ── Lecture limitée à ses exploitations ────────────────────────
drop policy if exists exploitations_read on exploitations;
create policy exploitations_read on exploitations for select to authenticated
  using (has_exploitation(id));

drop policy if exists auth_read_briques on briques;
create policy auth_read_briques on briques for select to authenticated
  using (has_exploitation(exploitation_id));

drop policy if exists auth_read_eu on exploitation_users;
create policy auth_read_eu on exploitation_users for select to authenticated
  using (user_id = auth.uid() or is_admin());

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or is_admin());

-- ── Alarmes : lecture membres, acquittement staff ──────────────
drop policy if exists alarmes_read on alarmes_log;
create policy alarmes_read on alarmes_log for select to authenticated
  using (has_exploitation(exploitation_id));

drop policy if exists alarmes_ack on alarmes_log;
create policy alarmes_ack on alarmes_log for update to authenticated
  using (is_staff() and has_exploitation(exploitation_id))
  with check (is_staff() and has_exploitation(exploitation_id));

-- ── Pilotage réservé au staff ──────────────────────────────────
drop policy if exists auth_read  on consignes;
drop policy if exists auth_write on consignes;
create policy auth_read   on consignes for select to authenticated using (has_exploitation(exploitation_id));
create policy staff_write on consignes for all to authenticated
  using (is_staff() and has_exploitation(exploitation_id))
  with check (is_staff() and has_exploitation(exploitation_id));

drop policy if exists auth_read  on config_installation;
drop policy if exists auth_write on config_installation;
create policy auth_read   on config_installation for select to authenticated using (has_exploitation(exploitation_id));
create policy staff_write on config_installation for all to authenticated
  using (is_staff() and has_exploitation(exploitation_id))
  with check (is_staff() and has_exploitation(exploitation_id));

drop policy if exists auth_all on saisons;
create policy auth_read   on saisons for select to authenticated using (has_exploitation(exploitation_id));
create policy staff_write on saisons for all to authenticated
  using (is_staff() and has_exploitation(exploitation_id))
  with check (is_staff() and has_exploitation(exploitation_id));

-- ── Vérification des alertes toutes les 5 min ──────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('geofresh-alertes') where exists (select 1 from cron.job where jobname = 'geofresh-alertes');
select cron.schedule('geofresh-alertes', '*/5 * * * *', $cron$
  select net.http_post(
    url     := 'https://diqxglwsffrlfziymplm.supabase.co/functions/v1/geofresh-alertes',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      -- clé anon (publique, déjà dans config.js) : suffit pour passer verify_jwt
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXhnbHdzZmZybGZ6aXltcGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODQwMjksImV4cCI6MjA5NDE2MDAyOX0.7sOo_xhhtISH9tQyJ7pg2Z3eXlDZfKZA5Xp6D7-Gs2w'
    ),
    body    := '{"action":"check_alertes"}'::jsonb,
    timeout_milliseconds := 20000
  );
$cron$);
