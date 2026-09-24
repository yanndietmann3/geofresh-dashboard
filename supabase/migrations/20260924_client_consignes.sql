-- GeoFresh v2.3 — Le client modifie les consignes de SES exploitations.
-- Le pilotage (manu, standby, descente, vitesse sim, cumuls…) reste réservé au staff.

drop policy if exists client_update on consignes;
create policy client_update on consignes for update to authenticated
  using (has_exploitation(exploitation_id))
  with check (has_exploitation(exploitation_id));

-- Pour un client, seules les colonnes de consigne changent ; le reste garde l'ancienne valeur.
create or replace function public.consignes_client_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r consignes;
begin
  if auth.uid() is null or is_staff() then return new; end if;  -- service role / staff
  r := old;
  r.csg_t       := new.csg_t;       r.hyst_t   := new.hyst_t;
  r.csg_hr      := new.csg_hr;      r.hyst_hr  := new.hyst_hr;
  r.csg_z1      := new.csg_z1;      r.csg_z2   := new.csg_z2;
  r.csg_ecs     := new.csg_ecs;     r.hyst_ecs := new.hyst_ecs;
  r.csg_clim_z1 := new.csg_clim_z1; r.csg_clim_z2 := new.csg_clim_z2;
  r.updated_at  := new.updated_at;
  return r;
end $$;

drop trigger if exists trg_consignes_client_guard on consignes;
create trigger trg_consignes_client_guard before update on consignes
  for each row execute function consignes_client_guard();
