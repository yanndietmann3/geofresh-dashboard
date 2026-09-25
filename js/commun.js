// ================================================================
// GeoFresh — Fonctions communes aux 3 pages (portail, vue client, vue opérateur)
// Chargé après config.js.
// ================================================================

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

// ── BRIQUES ─────────────────────────────────────────────────────
// Stockage PDT = brique universelle, intégrée aux pages.
// Les autres bâtiments sont des fichiers js/briques/<type>.js, chargés
// seulement si l'exploitation les a (et actifs). Chaque fichier s'inscrit dans
// GF.briques[type] = { client: {monter, maj}, operateur: {monter, maj} }.
window.GF = window.GF || {};
GF.briques = GF.briques || {};
GF.fichiersBriques = {
  habitation: 'js/briques/habitation.js',
  serre:      'js/briques/serre.js',
};

GF.chargerScript = src => new Promise((ok, ko) => {
  const s = document.createElement('script');
  s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Chargement impossible : ' + src));
  document.head.appendChild(s);
});

// Briques actives de l'exploitation (liste triée)
GF.briquesActives = async function(supa, eid) {
  const {data, error} = await supa.from('briques')
    .select('id, type, nom, actif, config, ordre').eq('exploitation_id', eid).order('ordre');
  if(error) { console.warn('briques :', error.message); return []; }
  return (data || []).filter(b => b.actif);
};

// Charge et monte les briques actives dans une vue ('client' | 'operateur')
GF.monterBriques = async function(supa, eid, vue, ctx) {
  const actives = await GF.briquesActives(supa, eid);
  for(const b of actives) {
    const fichier = GF.fichiersBriques[b.type];
    if(!fichier) continue;                          // stockage_pdt : déjà dans la page
    if(!GF.briques[b.type]) {
      try { await GF.chargerScript(fichier); } catch(e) { console.warn(e.message); continue; }
    }
    try { GF.briques[b.type]?.[vue]?.monter?.(b, ctx); }
    catch(e) { console.warn(`brique ${b.type} :`, e); }
  }
  return actives;
};

// Appelle une fonction d'une brique si elle est montée (sinon ne fait rien)
GF.appeler = function(type, vue, fn, ...args) {
  const f = GF.briques[type]?.[vue]?.[fn];
  return f ? f(...args) : undefined;
};
