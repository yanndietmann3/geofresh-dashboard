-- Heure simulée envoyée par le simulateur : la vue client la relit (plus de remise à zéro)
alter table stockage_readings add column if not exists heure_simulee timestamptz;
-- Saisons archivées : masquées du portail
comment on column saisons.statut is 'en_cours | terminee | archivee';
