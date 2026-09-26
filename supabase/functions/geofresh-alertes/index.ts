// GeoFresh — Alertes (v2)
// Vérifie chaque exploitation active, journalise dans alarmes_log et envoie un email (Resend).
//
// Actions (POST JSON) :
//   { action: 'check_alertes' }                      → appelé par pg_cron toutes les 5 min
//   { action: 'test_email', exploitation_id: '…' }   → bouton "Email de test" (staff connecté)
//   { action: 'archive' }                            → archivage des anciennes lectures
//
// Secrets : RESEND_API_KEY (obligatoire pour l'email), ALERT_FROM (optionnel)
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY')
const ALERT_FROM   = Deno.env.get('ALERT_FROM') || 'GeoFresh <onboarding@resend.dev>'
const DASHBOARD    = 'https://yanndietmann3.github.io/geofresh-dashboard'

// Seuils (surchargeables par exploitations.config.seuils).
// T et HR : écarts fixes par rapport à la consigne (indépendants de l'hystérésis).
// « Tenu » = la condition doit durer sans interruption (temps de la mesure : heure simulée
// si le simulateur l'envoie, sinon heure réelle) : un pic court ne déclenche rien.
const SEUILS_DEFAUT = {
  ecart_t_haut:   2,   // °C au-dessus de la consigne, tenu duree_t_min      → ⚠️
  ecart_t_crit:   4,   // °C au-dessus de la consigne, immédiat               → 🚨
  ecart_t_bas:    2,   // °C en dessous de la consigne, tenu duree_t_min      → ⚠️
  t_gel:          0,   // °C — risque de gel, fixe pour tous, immédiat         → 🚨
  duree_t_min:   60,
  ecart_hr_haut:  5,   // % au-dessus de la consigne HR, tenu duree_hr_haut_min → ⚠️ (condensation)
  duree_hr_haut_min: 120,
  ecart_hr_bas:   5,   // % en dessous de la consigne HR, tenu duree_hr_bas_min → ⚠️ (perte de poids)
  duree_hr_bas_min:  360,
  co2_warn:  3500,     // ppm
  co2_alarm: 5000,     // ppm
  simu_timeout: 10,    // min (heure réelle) sans donnée
}
// Consigne par défaut si l'exploitation n'en a pas encore
const CSG_DEFAUT = { csg_t: 6, hyst_t: 1, csg_hr: 90, hyst_hr: 3 }
const COOLDOWN_MIN = 30  // pas de nouvel email pour la même alerte avant 30 min

const BRIQUES: Record<string, string> = {
  stockage_pdt: '🥔 Stockage PDT',
  habitation:   '🏠 Habitation',
  serre:        '🌿 Serre',
}

type Alerte = { code: string; niveau: number; brique: string; message: string }

// CORS : le bouton "Email de test" appelle la fonction depuis GitHub Pages
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Règles ───────────────────────────────────────────────────
function minutesDepuis(ts: string) {
  return (Date.now() - new Date(ts).getTime()) / 60000
}

// Temps de la mesure : heure simulée si présente, sinon heure réelle
const tMesure = (r: any) => new Date(r.heure_simulee || r.ts).getTime()

// La condition est-elle vraie sur TOUTES les mesures des `minutes` dernières, et ces mesures
// couvrent-elles bien la durée (sinon pas assez de recul : on ne déclenche pas) ?
function tenu(hist: any[], minutes: number, cond: (r: any) => boolean) {
  if (!hist.length) return false
  const fin = tMesure(hist[0]), debut = fin - minutes * 60000
  const fenetre = hist.filter(r => tMesure(r) >= debut)
  const recul = fin - tMesure(fenetre[fenetre.length - 1])
  return recul >= minutes * 60000 * 0.9 && fenetre.every(cond)
}

// hist : mesures récentes, la plus récente en premier
function reglesStockage(hist: any[], s: typeof SEUILS_DEFAUT, c: typeof CSG_DEFAUT): Alerte[] {
  const b = 'stockage_pdt'
  const r = hist[0]
  if (!r) return [{ code: 'sto_no_data', niveau: 2, brique: b, message: 'Aucune donnée reçue du stockage' }]
  const out: Alerte[] = []
  const age = minutesDepuis(r.ts)
  if (age > s.simu_timeout)
    out.push({ code: 'sto_no_data', niveau: 2, brique: b, message: `Pas de donnée depuis ${Math.round(age)} min` })
  const t = Number(r.t_stock), co2 = Number(r.co2_ppm), hr = Number(r.hr_stock)
  const n = (v: number) => String(+Number(v).toFixed(1)).replace('.', ',')
  const duree = (m: number) => m >= 60 ? `${n(m / 60)} h` : `${m} min`
  const csgT = `consigne ${n(c.csg_t)} °C`

  // Descente / post-récolte : le stock est volontairement au-dessus de la consigne
  const descente = !!r.mode_descente || /^(DESCENTE|POST-R)/.test(String(r.mode_actif || ''))
  const tCrit = c.csg_t + s.ecart_t_crit, tHaut = c.csg_t + s.ecart_t_haut, tBas = c.csg_t - s.ecart_t_bas
  if (!descente && t > tCrit)
    out.push({ code: 'sto_t_crit', niveau: 3, brique: b, message: `T stock critique : ${n(t)} °C (${csgT}, seuil ${n(tCrit)} °C)` })
  else if (!descente && tenu(hist, s.duree_t_min, x => Number(x.t_stock) > tHaut))
    out.push({ code: 'sto_t_max', niveau: 2, brique: b, message: `T stock élevée : ${n(t)} °C, au-dessus de ${n(tHaut)} °C depuis plus de ${duree(s.duree_t_min)} (${csgT})` })
  if (t < s.t_gel)
    out.push({ code: 'sto_t_min', niveau: 3, brique: b, message: `Risque de gel : T stock ${n(t)} °C (sous ${n(s.t_gel)} °C)` })
  else if (tenu(hist, s.duree_t_min, x => Number(x.t_stock) < tBas))
    out.push({ code: 'sto_t_bas', niveau: 2, brique: b, message: `T stock basse : ${n(t)} °C, en dessous de ${n(tBas)} °C depuis plus de ${duree(s.duree_t_min)} (${csgT})` })

  if (co2 > s.co2_alarm)
    out.push({ code: 'sto_co2', niveau: 3, brique: b, message: `CO₂ critique : ${Math.round(co2)} ppm` })
  else if (co2 > s.co2_warn)
    out.push({ code: 'sto_co2', niveau: 2, brique: b, message: `CO₂ élevé : ${Math.round(co2)} ppm` })

  const hrHaut = c.csg_hr + s.ecart_hr_haut, hrBas = c.csg_hr - s.ecart_hr_bas
  if (tenu(hist, s.duree_hr_haut_min, x => Number(x.hr_stock) > hrHaut))
    out.push({ code: 'sto_hr', niveau: 2, brique: b, message: `HR élevée : ${hr.toFixed(0)} %, au-dessus de ${n(hrHaut)} % depuis plus de ${duree(s.duree_hr_haut_min)} (consigne ${n(c.csg_hr)} %)` })
  if (tenu(hist, s.duree_hr_bas_min, x => Number(x.hr_stock) < hrBas))
    out.push({ code: 'sto_hr_bas', niveau: 2, brique: b, message: `HR basse : ${hr.toFixed(0)} %, en dessous de ${n(hrBas)} % depuis plus de ${duree(s.duree_hr_bas_min)} (consigne ${n(c.csg_hr)} %)` })

  if (r.alarme_active && Number(r.niveau_alarme) >= 2)
    out.push({ code: 'sto_ctrl', niveau: Number(r.niveau_alarme), brique: b, message: `Automate : ${r.alarme_active}` })
  return out
}

// Mesures du stockage sur la plus longue durée utile (la plus récente en premier)
async function historiqueStockage(sb: SupabaseClient, eid: string, s: typeof SEUILS_DEFAUT) {
  const { data: der } = await sb.from('stockage_readings').select('ts, heure_simulee')
    .eq('exploitation_id', eid).order('ts', { ascending: false }).limit(1)
  if (!der?.length) return []
  const minutes = Math.max(s.duree_t_min, s.duree_hr_haut_min, s.duree_hr_bas_min) * 1.05
  const col = der[0].heure_simulee ? 'heure_simulee' : 'ts'
  const depuis = new Date(new Date(der[0][col]).getTime() - minutes * 60000).toISOString()
  const { data } = await sb.from('stockage_readings')
    .select('ts, heure_simulee, t_stock, hr_stock, co2_ppm, mode_actif, mode_descente, alarme_active, niveau_alarme')
    .eq('exploitation_id', eid).gte(col, depuis).order(col, { ascending: false }).limit(5000)
  return data || []
}

function reglesHabitation(r: any, s: typeof SEUILS_DEFAUT): Alerte[] {
  const b = 'habitation'
  if (!r) return []
  const out: Alerte[] = []
  const age = minutesDepuis(r.ts)
  if (age > s.simu_timeout)
    out.push({ code: 'hab_no_data', niveau: 2, brique: b, message: `Pas de donnée depuis ${Math.round(age)} min` })
  if (r.alarme_active && Number(r.niveau_alarme) >= 2)
    out.push({ code: 'hab_ctrl', niveau: Number(r.niveau_alarme), brique: b, message: `Automate : ${r.alarme_active}` })
  return out
}

// ── Destinataires ───────────────────────────────────────────
async function destinataires(sb: SupabaseClient, exploit: any): Promise<string[]> {
  const cfg = exploit.config?.alertes_emails
  if (Array.isArray(cfg) && cfg.length) return cfg
  const { data: membres } = await sb.from('exploitation_users').select('user_id').eq('exploitation_id', exploit.id)
  const ids = (membres || []).map((m: any) => m.user_id)
  const { data: profils } = await sb.from('profiles').select('email, role, id')
  const emails = (profils || [])
    .filter((p: any) => p.email && (ids.includes(p.id) || p.role === 'super_admin'))
    .map((p: any) => p.email)
  return [...new Set(emails)]
}

// ── Email ───────────────────────────────────────────────────
function emailHtml(exploit: any, alertes: Alerte[], test = false) {
  const rows = alertes.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E2D9CC;">${a.niveau >= 3 ? '🚨' : '⚠️'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E2D9CC;color:#7A6352;">${BRIQUES[a.brique] || a.brique}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E2D9CC;color:${a.niveau >= 3 ? '#C0432A' : '#C68A2A'};font-weight:600;">${a.message}</td>
    </tr>`).join('')
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#F5F0E8;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E2D9CC;border-radius:12px;overflow:hidden;">
      <div style="padding:18px 24px;border-bottom:2px solid #E2D9CC;">
        <span style="font-size:20px;font-weight:800;color:#6AAF35;">Geo</span><span style="font-size:20px;font-weight:800;color:#A0724A;">Fresh</span>
        <div style="font-size:11px;color:#B8A898;letter-spacing:2px;text-transform:uppercase;">${test ? 'Email de test' : 'Alerte supervision'}</div>
      </div>
      <div style="padding:20px 24px;color:#2D2017;">
        <div style="font-size:16px;font-weight:700;margin-bottom:12px;">${exploit.nom}</div>
        ${test
          ? '<p style="font-size:14px;">Les alertes email fonctionnent pour cette exploitation. ✅</p>'
          : `<table style="border-collapse:collapse;width:100%;font-size:13px;">${rows}</table>`}
        <p style="margin-top:20px;"><a href="${DASHBOARD}/index.html?exploitation_id=${exploit.id}" style="background:#6AAF35;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Accéder au dashboard</a></p>
        <p style="font-size:11px;color:#B8A898;margin-top:16px;">${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>
      </div>
    </div>
  </div>`
}

async function envoyerEmail(to: string[], subject: string, html: string) {
  if (!RESEND_KEY) return { sent: false, error: 'RESEND_API_KEY non configurée' }
  if (!to.length)  return { sent: false, error: 'Aucun destinataire' }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: ALERT_FROM, to, subject, html }),
  })
  if (!r.ok) return { sent: false, error: `Resend ${r.status} : ${await r.text()}` }
  return { sent: true, to }
}

// ── Vérification d'une exploitation ─────────────────────────
async function verifierExploitation(sb: SupabaseClient, exploit: any) {
  const seuils = { ...SEUILS_DEFAUT, ...(exploit.config?.seuils || {}) }
  const actives = new Set((exploit.briques || []).filter((b: any) => b.actif).map((b: any) => b.type))

  const derniere = async (table: string) => {
    const { data } = await sb.from(table).select('*').eq('exploitation_id', exploit.id)
      .order('ts', { ascending: false }).limit(1)
    return data?.[0] ?? null
  }

  // Consigne du stockage de cette exploitation (les seuils T / HR en découlent)
  const { data: csgRow } = await sb.from('consignes').select('csg_t, hyst_t, csg_hr, hyst_hr')
    .eq('exploitation_id', exploit.id).eq('id', 'stockage').maybeSingle()
  const csg = { ...CSG_DEFAUT }
  for (const k of Object.keys(CSG_DEFAUT) as (keyof typeof CSG_DEFAUT)[])
    if (csgRow?.[k] != null && !isNaN(Number(csgRow[k]))) csg[k] = Number(csgRow[k])

  const alertes: Alerte[] = []
  if (actives.has('stockage_pdt')) alertes.push(...reglesStockage(await historiqueStockage(sb, exploit.id, seuils), seuils, csg))
  if (actives.has('habitation'))   alertes.push(...reglesHabitation(await derniere('habitation_readings'), seuils))

  // Alertes automatiques déjà connues pour cette exploitation
  const depuis = new Date(Date.now() - COOLDOWN_MIN * 60000).toISOString()
  const { data: recentes } = await sb.from('alarmes_log')
    .select('id, source, acquittee, ts')
    .eq('exploitation_id', exploit.id).like('source', 'auto:%')
    .or(`acquittee.eq.false,ts.gte."${depuis}"`)
  const ouvertes  = new Set((recentes || []).filter((a: any) => !a.acquittee).map((a: any) => a.source))
  const recemment = new Set((recentes || []).map((a: any) => a.source))

  // Nouvelles = pas déjà ouvertes, pas déclenchées dans le cooldown (anti-yoyo)
  const nouvelles = alertes.filter(a => !recemment.has('auto:' + a.code) && !ouvertes.has('auto:' + a.code))
  if (nouvelles.length) {
    await sb.from('alarmes_log').insert(nouvelles.map(a => ({
      exploitation_id: exploit.id, source: 'auto:' + a.code, niveau: a.niveau,
      message: `${BRIQUES[a.brique] || a.brique} — ${a.message}`, acquittee: false,
    })))
  }

  // Retour à la normale : acquitter automatiquement les alertes dont la condition a disparu
  const presentes = new Set(alertes.map(a => 'auto:' + a.code))
  const resolues = [...ouvertes].filter(src => !presentes.has(src))
  if (resolues.length) {
    await sb.from('alarmes_log').update({ acquittee: true, acquittee_ts: new Date().toISOString() })
      .eq('exploitation_id', exploit.id).eq('acquittee', false).in('source', resolues)
  }

  let email = null
  if (nouvelles.some(a => a.niveau >= 2)) {
    const crit = nouvelles.some(a => a.niveau >= 3)
    const to = await destinataires(sb, exploit)
    email = await envoyerEmail(to,
      `${crit ? '🚨' : '⚠️'} GeoFresh — ${exploit.nom} : ${nouvelles.length} alerte${nouvelles.length > 1 ? 's' : ''}`,
      emailHtml(exploit, nouvelles))
  }
  return { exploitation: exploit.nom, alertes: alertes.length, nouvelles: nouvelles.length, resolues: resolues.length, email }
}

// ── Staff connecté ? (pour test_email) ──────────────────────
async function estStaff(sb: SupabaseClient, req: Request) {
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: { user } } = await sb.auth.getUser(jwt)
  if (!user) return false
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'super_admin' || p?.role === 'operator'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const body = await req.json().catch(() => ({}))
  const action = body.action || 'info'

  if (action === 'check_alertes') {
    const { data: exploits, error } = await sb.from('exploitations')
      .select('id, nom, config, statut, briques(type, actif)').eq('statut', 'actif')
    if (error) return json({ error: error.message }, 500)
    const resultats = []
    for (const e of exploits || []) resultats.push(await verifierExploitation(sb, e))
    return json({ ts: new Date().toISOString(), resultats })
  }

  if (action === 'test_email') {
    if (!(await estStaff(sb, req))) return json({ sent: false, error: 'Réservé au super admin / opérateur' }, 403)
    const { data: exploit } = await sb.from('exploitations').select('id, nom, config').eq('id', body.exploitation_id).single()
    if (!exploit) return json({ sent: false, error: 'Exploitation introuvable' }, 404)
    const to = await destinataires(sb, exploit)
    return json(await envoyerEmail(to, `GeoFresh — ${exploit.nom} : email de test`, emailHtml(exploit, [], true)))
  }

  if (action === 'archive') {
    await sb.rpc('archive_old_readings')
    return json({ ok: true, msg: 'Archive déclenchée' })
  }

  // Diagnostic : la clé Resend est-elle visible ? (ne révèle pas la clé)
  return json({ ok: true, version: '2.0', actions: ['check_alertes', 'test_email', 'archive'],
    resend_configured: !!RESEND_KEY, resend_key_prefix: RESEND_KEY ? RESEND_KEY.slice(0, 3) : null,
    secrets_resend: Object.keys(Deno.env.toObject()).filter(k => /resend|alert/i.test(k)) })
})
