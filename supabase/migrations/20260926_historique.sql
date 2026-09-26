-- Historique daté : heure simulée aussi pour l'habitation + agrégation côté base
-- (avant : 1000 dernières lignes, sans filtre exploitation, sans date sur la courbe)
alter table habitation_readings add column if not exists heure_simulee timestamptz;
create index if not exists stockage_readings_eid_hsim   on stockage_readings   (exploitation_id, heure_simulee);
create index if not exists habitation_readings_eid_hsim on habitation_readings (exploitation_id, heure_simulee);
create index if not exists stockage_readings_eid_ts     on stockage_readings   (exploitation_id, ts);
create index if not exists habitation_readings_eid_ts   on habitation_readings (exploitation_id, ts);

-- historique(eid, 'sto' | 'hab', '1h' | '6h' | '24h' | '7d' | '10d' | '30d' | 'saison' | 'dates', du, au, points)
-- Axe du temps : heure simulée si le simulateur l'envoie (dernière mesure), sinon heure réelle (ts).
-- Renvoie {debut, fin, simule, points:[{t, v1, v2, v3, pac, mode, alarme}], stats:{…}}
create or replace function public.historique(eid uuid, bat text, periode text,
                                             du timestamptz default null, au timestamptz default null,
                                             points int default 300)
returns jsonb language plpgsql volatile security invoker set search_path = public as $$
declare
  sim boolean; sai text; t_fin timestamptz; t_deb timestamptz; res jsonb;
begin
  if bat not in ('sto','hab') then raise exception 'bat inconnu'; end if;
  points := greatest(10, least(coalesce(points, 300), 1000));

  -- Dernière mesure : horloge simulée ? saison ?
  if bat = 'sto' then
    select heure_simulee is not null, saison_id into sim, sai
      from stockage_readings where exploitation_id = eid order by ts desc limit 1;
  else
    select heure_simulee is not null, saison_id into sim, sai
      from habitation_readings where exploitation_id = eid order by ts desc limit 1;
  end if;
  if sim is null then return jsonb_build_object('points', '[]'::jsonb); end if;

  create temp table if not exists _h (t timestamptz, v1 numeric, v2 numeric, v3 numeric,
                                      pac boolean, pac2 boolean, mode text, alarme text, saison_id text) on commit drop;
  truncate _h;
  if bat = 'sto' then
    insert into _h select case when sim then heure_simulee else ts end, t_stock, hr_stock, co2_ppm,
                          pac_on, coalesce(pac2_on, false), mode_actif, alarme_active, saison_id
      from stockage_readings where exploitation_id = eid and (not sim or heure_simulee is not null);
  else
    insert into _h select case when sim then heure_simulee else ts end, t_int_z1, t_int_z2, t_ecs,
                          pac_on, false, mode_actif, alarme_active, saison_id
      from habitation_readings where exploitation_id = eid and (not sim or heure_simulee is not null);
  end if;

  t_fin := coalesce(au, (select max(t) from _h));
  t_deb := case
    when du is not null then du
    when periode = '1h'  then t_fin - interval '1 hour'
    when periode = '6h'  then t_fin - interval '6 hours'
    when periode = '24h' then t_fin - interval '1 day'
    when periode = '7d'  then t_fin - interval '7 days'
    when periode = '10d' then t_fin - interval '10 days'
    when periode = '30d' then t_fin - interval '30 days'
    else coalesce((select min(t) from _h where saison_id is not distinct from sai), (select min(t) from _h))
  end;
  if t_deb >= t_fin then t_deb := t_fin - interval '1 hour'; end if;

  with p as (
    select *, lead(t) over (order by t) as t_suiv, lag(alarme) over (order by t) as alarme_prec
      from _h where t between t_deb and t_fin
  ), b as (
    select width_bucket(extract(epoch from t), extract(epoch from t_deb), extract(epoch from t_fin) + 1, points) as k, *
      from p
  ), agg as (
    select k, min(t) + (max(t) - min(t)) / 2 as t,
           round(avg(v1), 2) v1, round(avg(v2), 2) v2, round(avg(v3), 1) v3,
           round(avg(pac::int), 2) pac, mode() within group (order by mode) mode, max(alarme) alarme
      from b group by k
  )
  select jsonb_build_object(
    'debut', t_deb, 'fin', t_fin, 'simule', sim,
    'points', coalesce((select jsonb_agg(jsonb_build_object('t', t, 'v1', v1, 'v2', v2, 'v3', v3,
                          'pac', pac, 'mode', mode, 'alarme', alarme) order by t) from agg), '[]'::jsonb),
    'stats', (select jsonb_build_object(
        'n', count(*),
        't_moy', round(avg(v1), 2),
        'mode_dominant', mode() within group (order by mode),
        'alarmes', count(*) filter (where alarme is not null and alarme is distinct from alarme_prec),
        'cumul_pac_h', round(coalesce(sum(extract(epoch from least(t_suiv - t, interval '6 hours')))
                                        filter (where pac and t_suiv is not null), 0) / 3600.0, 1),
        -- Durée de froid mécanique = temps où AU MOINS une PAC refroidit (hors anti-gel, où elle chauffe),
        -- quel que soit le nombre de PAC ; « dont 2 PAC » = temps où les deux tournent
        'froid_h', round(coalesce(sum(extract(epoch from least(t_suiv - t, interval '6 hours')))
                                   filter (where pac and t_suiv is not null and coalesce(mode, '') not like 'ANTI-GEL%'), 0) / 3600.0, 1),
        'froid_2pac_h', round(coalesce(sum(extract(epoch from least(t_suiv - t, interval '6 hours')))
                                   filter (where pac2 and t_suiv is not null and coalesce(mode, '') not like 'ANTI-GEL%'), 0) / 3600.0, 1))
      from p),
    'evenements', coalesce((select jsonb_agg(e order by e->>'t' desc) from (
        select jsonb_build_object('t', t, 'mode', mode, 'v1', v1, 'v2', v2, 'v3', v3, 'pac', pac, 'alarme', alarme) e
          from (select *, lag(mode) over (order by t) mode_prec from p) x
         where mode is distinct from mode_prec or (alarme is not null and alarme is distinct from alarme_prec)
         order by t desc limit 50) z), '[]'::jsonb)
  ) into res;
  return res;
end $$;
grant execute on function public.historique(uuid, text, text, timestamptz, timestamptz, int) to anon, authenticated;
