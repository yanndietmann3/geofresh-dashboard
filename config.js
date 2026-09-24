// ================================================================
// GeoFresh — Configuration centralisée v2.2
// ================================================================

window.GEOFRESH_CONFIG = {

  supabase: {
    url:     'https://diqxglwsffrlfziymplm.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXhnbHdzZmZybGZ6aXltcGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODQwMjksImV4cCI6MjA5NDE2MDAyOX0.7sOo_xhhtISH9tQyJ7pg2Z3eXlDZfKZA5Xp6D7-Gs2w',
  },

  // ── DA GEOFRESH ──────────────────────────────────────────────
  // Couleurs exactes du logo
  colors: {
    // Primaires
    vert:        '#6AAF35',   // Geo — vert logo
    brun:        '#A0724A',   // Fresh — brun logo
    // Fond clair (thème light)
    bg:          '#F5F0E8',   // fond principal brun très clair
    bgCard:      '#FFFFFF',   // fond cartes blanc
    bgCardAlt:   '#FAF7F2',   // fond cartes alt
    border:      '#E2D9CC',   // bordures
    // Textes
    textPrimary: '#2D2017',   // texte principal brun foncé
    textSecond:  '#7A6352',   // texte secondaire
    textMuted:   '#B8A898',   // texte muted
    // États
    success:     '#5A9E2F',   // vert success
    warning:     '#C68A2A',   // ambre warning
    danger:      '#C0432A',   // rouge danger
    info:        '#3A7FA0',   // bleu info
    // Géothermie
    geo:         '#5B8A9A',   // bleu-vert géo
  },

  physique: {
    p_pac_kw:         15.0,
    p_ventil_1:        2.2,
    p_ventil_2:        4.4,
    p_pompe_glycol:    1.2,
    cop_ref_froid:     3.5,
    cop_ref_chaud:     4.0,
    cop_groupe_froid:  2.0,
    prix_kwh:          0.18,
  },

  alertes: {
    t_stock_max:    8.0,
    t_stock_min:    2.0,
    co2_warn:    3500,
    co2_alarm:   5000,
    hr_max:        95,
    esp32_timeout:  5,
    simu_timeout:  10,
  },

  dashboard: {
    refresh_ms:    5000,
    hist_points:    500,
    version:       '2.3.0',
  },

  // ── BRIQUES ──────────────────────────────────────────────────
  // Vocabulaire unique (portail, vue client, vue opérateur)
  briques: {
    stockage_pdt: { emoji: '🥔', label: 'Stockage PDT' },
    habitation:   { emoji: '🏠', label: 'Habitation' },
    serre:        { emoji: '🌿', label: 'Serre' },
  },

  // ── RÔLES ────────────────────────────────────────────────────
  roles: {
    super_admin: 'Super Admin',
    operator:    'Opérateur',
    client:      'Client',
  },
};

// Libellé d'une brique : "🏠 Habitation"
window.gfBriqueLabel = function(type, withEmoji = true) {
  const b = window.GEOFRESH_CONFIG.briques[type];
  if(!b) return type;
  return withEmoji ? `${b.emoji} ${b.label}` : b.label;
};

// Rôle de l'utilisateur connecté ('super_admin' | 'operator' | 'client' | null)
window.gfGetRole = async function(supa) {
  const {data: {session}} = await supa.auth.getSession();
  if(!session) return {session: null, role: null, profile: null};
  const {data: profile} = await supa.from('profiles')
    .select('role, nom, email').eq('id', session.user.id).single();
  return {session, role: profile?.role || 'client', profile};
};

// Staff = peut piloter (super admin ou opérateur)
window.gfIsStaff = role => role === 'super_admin' || role === 'operator';

// Raccourcis globaux
const C = window.GEOFRESH_CONFIG.colors;
window.SUPABASE_URL      = window.GEOFRESH_CONFIG.supabase.url;
window.SUPABASE_ANON_KEY = window.GEOFRESH_CONFIG.supabase.anonKey;
window.GEOFRESH_KEY      = window.GEOFRESH_CONFIG.supabase.anonKey;

// Injecter les variables CSS GeoFresh dynamiquement
(function() {
  const s = document.createElement('style');
  s.textContent = `
    :root {
      --gf-vert:    ${C.vert};
      --gf-brun:    ${C.brun};
      --gf-bg:      ${C.bg};
      --gf-card:    ${C.bgCard};
      --gf-card2:   ${C.bgCardAlt};
      --gf-border:  ${C.border};
      --gf-text:    ${C.textPrimary};
      --gf-text2:   ${C.textSecond};
      --gf-muted:   ${C.textMuted};
      --gf-ok:      ${C.success};
      --gf-warn:    ${C.warning};
      --gf-err:     ${C.danger};
      --gf-info:    ${C.info};
      --gf-geo:     ${C.geo};
    }
  `;
  document.head.appendChild(s);
})();
