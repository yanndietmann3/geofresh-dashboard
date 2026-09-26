-- Sécurité : avant, n'importe qui avec la clé publique du site lisait les mesures de TOUTES
-- les exploitations. Maintenant : lecture réservée aux comptes rattachés à l'exploitation
-- (ou staff). Le simulateur (clé publique) relit ce dont il a besoin via simu_config().

create or replace function public.exploitation_existe(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from exploitations where id = eid)
$$;
grant execute on function public.exploitation_existe(uuid) to anon, authenticated;

-- ── Mesures : lecture par exploitation, écriture seulement vers une exploitation existante ──
do $$
declare t text;
begin
  foreach t in array array['stockage_readings','habitation_readings','conditions_externes'] loop
    execute format('drop policy if exists anon_read on %I', t);
    execute format('drop policy if exists mesures_read on %I', t);
    execute format('create policy mesures_read on %I for select to authenticated using (has_exploitation(exploitation_id))', t);
    execute format('drop policy if exists anon_insert on %I', t);
    execute format('create policy anon_insert on %I for insert to anon, authenticated with check (exploitation_existe(exploitation_id))', t);
  end loop;
end $$;

drop policy if exists alarmes_insert on alarmes_log;
create policy alarmes_insert on alarmes_log for insert to anon, authenticated
  with check (exploitation_existe(exploitation_id));

-- ── Config système : lecture comptes connectés, écriture staff seulement (avant : tout client) ──
drop policy if exists auth_write on config_systeme;
create policy staff_write on config_systeme for all to authenticated using (is_staff()) with check (is_staff());

-- ── Simulateur : reprise (cumuls, horloge) + dernière météo, sans lire les tables ──
create or replace function public.simu_config(eid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'consignes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from consignes c where c.exploitation_id = eid),
    'config',    (select coalesce(jsonb_object_agg(cle, valeur), '{}'::jsonb) from config_installation where exploitation_id = eid),
    'systeme',   (select coalesce(jsonb_object_agg(id, valeur), '{}'::jsonb) from config_systeme),
    'briques',   (select coalesce(jsonb_object_agg(type, actif), '{}'::jsonb) from briques where exploitation_id = eid),
    'saison_id', (select id from saisons where exploitation_id = eid and statut = 'en_cours'
                  order by created_at desc limit 1),
    'reprise_sto', (select jsonb_build_object('duree_fonct_pac_h', duree_fonct_pac_h, 'cumul_fc_h', cumul_fc_h,
                                              'heure_simulee', heure_simulee)
                      from stockage_readings where exploitation_id = eid order by ts desc limit 1),
    'reprise_hab', (select jsonb_build_object('cumul_pac_h', cumul_pac_h)
                      from habitation_readings where exploitation_id = eid order by ts desc limit 1),
    'derniere_ext', (select to_jsonb(e) from conditions_externes e where e.exploitation_id = eid order by ts desc limit 1),
    'meteo_reelle', (select jsonb_build_object('t_ext', t_ext, 'hr_ext', hr_ext, 't_rosee', t_rosee, 'wind_speed', wind_speed)
                       from meteo_reelle order by ts desc limit 1)
  )
$$;
grant execute on function public.simu_config(uuid) to anon, authenticated;
