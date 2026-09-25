-- GeoFresh v2.3 — Résumé des saisons terminées (portail, visible par les clients)
-- security invoker : chaque utilisateur ne voit que les saisons de SES exploitations (RLS saisons).
drop function if exists public.saisons_terminees();
create function public.saisons_terminees()
returns table(
  id text, nom text, exploitation_id uuid, exploitation text,
  date_debut date, date_fin date, nb_mesures bigint,
  t_stock_moy numeric, t_stock_min numeric, t_stock_max numeric,
  hr_moy numeric, co2_max numeric, t_ext_moy numeric,
  pac_pct numeric, nb_alertes bigint
)
language sql stable security invoker set search_path = public as $$
  select s.id, s.nom, s.exploitation_id, e.nom, s.date_debut, s.date_fin,
         count(r.id),
         round(avg(r.t_stock), 2), round(min(r.t_stock), 2), round(max(r.t_stock), 2),
         round(avg(r.hr_stock), 1), round(max(r.co2_ppm), 0),
         (select round(avg(c.t_ext), 1) from conditions_externes c
            where c.saison_id = s.id and c.exploitation_id = s.exploitation_id),
         round(100.0 * avg(case when r.pac_on then 1 else 0 end), 0),
         (select count(*) from alarmes_log a
            where a.exploitation_id = s.exploitation_id
              and a.ts::date between s.date_debut and coalesce(s.date_fin, current_date))
  from saisons s
  join exploitations e on e.id = s.exploitation_id
  left join stockage_readings r on r.saison_id = s.id and r.exploitation_id = s.exploitation_id
  where s.statut = 'terminee'
  group by s.id, s.nom, s.exploitation_id, e.nom, s.date_debut, s.date_fin
  order by s.date_fin desc nulls last
$$;

revoke execute on function public.saisons_terminees() from anon;
grant execute on function public.saisons_terminees() to authenticated;
