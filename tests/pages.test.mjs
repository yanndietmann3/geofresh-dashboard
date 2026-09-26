// ================================================================
// GeoFresh — Tests automatiques des 3 pages (sans toucher à Supabase)
// Supabase est remplacé par une fausse base : on vérifie les rôles,
// les briques (avec / sans maison) et l'absence d'erreur JavaScript.
//
// Lancer (une fois) :  npm install --no-save playwright && npx playwright install chromium
// Puis, avant chaque mise en ligne :  node tests/pages.test.mjs
// ================================================================
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')).href + '/';
const EID  = '00000000-0000-0000-0000-000000000001';

// Fausse bibliothèque Supabase : rôle et briques au choix
const fauxSupabase = (role, avecMaison) => `
const BRQ=[{id:'b1',type:'stockage_pdt',nom:'Stockage PDT 500t',actif:true,ordre:1,config:{nb_pac:2}},
  ${avecMaison ? "{id:'b2',type:'habitation',nom:'Maison agricole',actif:true,ordre:2}," : ''}
  {id:'b3',type:'serre',nom:'Serre',actif:true,ordre:3}];
const T={profiles:[{role:'${role}',nom:null,email:'test@geofresh.fr'}],
  exploitations:[{id:'${EID}',nom:'Site Pilote',adresse:'62',capacite_pdt:500,nb_pac:3,statut:'actif',config:{},briques:BRQ}],
  briques:BRQ, alarmes_log:[], exploitation_users:[]};
function q(t){const o={_one:false};['select','eq','neq','order','limit','like','or','in','insert','update']
  .forEach(m=>o[m]=()=>o); o.single=()=>{o._one=true;return o;};
  o.then=(ok,ko)=>Promise.resolve({data:o._one?(T[t]||[])[0]:(T[t]||[]),error:null}).then(ok,ko); return o;}
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'t',user:{id:'u1',email:'test@geofresh.fr'}}}}),
        signOut:async()=>{},onAuthStateChange:()=>{},signInWithPassword:async()=>({})},
  from:q, rpc:async()=>({data:[],error:null}), functions:{invoke:async()=>({data:{sent:true,to:[]}})}})};
window.WebSocket=class{send(){}};`;

const mesures = {
  stockage_readings:   [{t_stock:5.2, pac_on:true, pac1_on:true, pac2_on:false, pac_kw:15, mode_actif:'FROID MECANIQUE',
                         duree_fonct_pac_h:123.4, cumul_fc_h:45.6, heure_simulee:'2026-11-14T08:30:00+00:00'}],
  habitation_readings: [{t_int_z1:20.4, t_int_z2:18.9, t_ecs:52, pac_on:true, pac_kw:9, mode_actif:'CHAUFFAGE'}],
  conditions_externes: [{t_ext:12.5, hr_ext:78, t_rosee:8}],
  exploitations: [{nom:'Site Pilote'}],
  consignes: [{id:'stockage', csg_t:6, hyst_t:1, csg_hr:90, hyst_hr:3, vitesse_sim:500},
              {id:'habitation', csg_z1:20, csg_z2:19, csg_ecs:55, hyst_ecs:3, csg_clim_z1:26, csg_clim_z2:26}],
};
// Historique agrégé renvoyé par la fonction historique() : 7 jours simulés
const debutHist = Date.parse('2026-11-07T08:30:00Z');
const historique = { debut:'2026-11-07T08:30:00+00:00', fin:'2026-11-14T08:30:00+00:00', simule:true,
  points: Array.from({length:50}, (_, i) => ({ t:new Date(debutHist + i*3.4*3600e3).toISOString(),
    v1:6 + Math.sin(i/5), v2:89, v3:900, pac:i%2, mode:'FROID MECANIQUE', alarme:null })),
  stats: { n:50, t_moy:6.1, alarmes:1, cumul_pac_h:40.2, mode_dominant:'FROID MECANIQUE' },
  evenements: [{ t:'2026-11-13T10:00:00+00:00', mode:'FREE COOLING', v1:6.4, v2:88, v3:900, pac:false, alarme:null }] };

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let echecs = 0;
const verifier = (nom, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${nom}${detail ? ' — ' + detail : ''}`);
  if(!ok) echecs++;
};

async function ouvrir(page, role, avecMaison) {
  const ctx = await browser.newContext();
  await ctx.route(/cdn\.jsdelivr\.net/, r => r.fulfill({contentType:'application/javascript', body:fauxSupabase(role, avecMaison)}));
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.fulfill({body:''}));
  await ctx.route(/supabase\.co\/rest/, r => {
    if(r.request().url().includes('rpc/historique'))
      return r.fulfill({contentType:'application/json', body: JSON.stringify(historique)});
    const t = Object.keys(mesures).find(k => r.request().url().includes(k));
    r.fulfill({contentType:'application/json', body: JSON.stringify(t ? mesures[t].map(m => ({...m, ts:new Date().toISOString()})) : [])});
  });
  const p = await ctx.newPage(); const erreurs = [];
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`${ROOT}${page}?exploitation_id=${EID}`);
  await p.waitForTimeout(2500);
  const visible = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
  return {ctx, p, erreurs, visible};
}

for(const avecMaison of [true, false]) {
  const cas = avecMaison ? 'avec maison' : 'sans maison';

  // Vue client, compte client : lecture + consignes, pas de pilotage
  { const {ctx, p, erreurs, visible} = await ouvrir('index.html', 'client', avecMaison);
    verifier(`Vue client / client / ${cas} : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
    verifier(`Vue client / client / ${cas} : onglet Stockage PDT affiché`, await visible('#ps'));
    verifier(`Vue client / client / ${cas} : pilotage caché`, !(await visible('#ps .mode-btns')));
    verifier(`Vue client / client / ${cas} : onglet Habitation ${avecMaison ? 'présent' : 'absent'}`,
             (await p.$('#tbh') !== null) === avecMaison);
    await ctx.close(); }

  // Vue client, super admin : pilotage visible
  { const {ctx, erreurs, visible} = await ouvrir('index.html', 'super_admin', avecMaison);
    verifier(`Vue client / super admin / ${cas} : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
    verifier(`Vue client / super admin / ${cas} : pilotage visible`, await visible('#ps .mode-btns'));
    await ctx.close(); }

  // Vue opérateur
  { const {ctx, p, erreurs, visible} = await ouvrir('operateur.html', 'super_admin', avecMaison);
    verifier(`Vue opérateur / super admin / ${cas} : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
    verifier(`Vue opérateur / super admin / ${cas} : carte maison ${avecMaison ? 'présente' : 'absente'}`,
             (await visible('.c-hab[data-brique="habitation"]')) === avecMaison);
    verifier(`Vue opérateur / super admin / ${cas} : encart Serre`, await visible('.c-extra[data-brique="serre"]'));
    await ctx.close(); }

  // Un client qui ouvre la vue opérateur est renvoyé vers sa vue
  { const {ctx, p} = await ouvrir('operateur.html', 'client', avecMaison);
    verifier(`Vue opérateur / client / ${cas} : renvoyé vers la vue client`, p.url().includes('index.html'));
    await ctx.close(); }
}

// Vue client : historique daté, et rien ne repart à zéro après un passage par le portail
{ const {ctx, p, erreurs} = await ouvrir('index.html', 'client', false);
  await p.click('#tbx'); await p.selectOption('#hist-range', '7d'); await p.waitForTimeout(800);
  const periode = await p.textContent('#hist-periode');
  verifier(`Historique : période datée`, periode.includes('07/11/2026') && periode.includes('14/11/2026'), periode);
  verifier(`Historique : date dans le tableau`, (await p.textContent('#hist-tbody')).includes('13/11/2026'));
  verifier(`Historique : cumul PAC de la période`, (await p.textContent('#hs-cumul')).startsWith('40.2'));
  await p.selectOption('#hist-range', 'dates'); await p.waitForTimeout(500);
  verifier(`Historique : dates proposées`, await p.inputValue('#hist-du') === '2026-11-07' && await p.inputValue('#hist-au') === '2026-11-14');
  const avant = { cumul: await p.textContent('#s-cumul-h'), fc: await p.textContent('#s-cumul-fc') };
  await p.goto(`${ROOT}portail.html`); await p.waitForTimeout(1000);
  await p.goto(`${ROOT}index.html?exploitation_id=${EID}`); await p.waitForTimeout(2500);
  verifier(`Retour : onglet Historique rouvert`, await p.evaluate(() => document.getElementById('phistory').classList.contains('active')));
  verifier(`Retour : période conservée`, await p.inputValue('#hist-range') === 'dates' && await p.inputValue('#hist-du') === '2026-11-07');
  verifier(`Retour : cumuls conservés`, await p.textContent('#s-cumul-h') === avant.cumul && avant.cumul.startsWith('123.4')
           && await p.textContent('#s-cumul-fc') === avant.fc, `${avant.cumul} / ${avant.fc}`);
  verifier(`Retour : date simulée conservée`, (await p.textContent('#sim-date')) === '14/11/2026', await p.textContent('#sim-date'));
  verifier(`Historique / retour : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
  await ctx.close(); }

// Changer une consigne : confirmation, et rien d'autre n'est envoyé (ni vitesse, ni l'autre bâtiment)
{ const {ctx, p, erreurs} = await ouvrir('index.html', 'client', true);
  const envois = [];
  p.on('request', r => { if(r.method() === 'PATCH' && r.url().includes('consignes')) envois.push({url: r.url(), body: r.postData()}); });
  await p.evaluate(() => openModal('sto', 't'));
  await p.fill('#mf-st', '5');
  await p.click('#m-save');
  await p.waitForSelector('.gf-confirm');
  const texte = await p.textContent('.gf-confirm');
  verifier(`Consigne : confirmation affichée (ancienne → nouvelle)`, texte.includes('Consigne T stock') && texte.includes('→ 5 °C'), texte.replace(/\s+/g, ' '));
  await p.click('.gf-confirm-non'); await p.waitForTimeout(300);
  verifier(`Consigne : Annuler n'envoie rien`, envois.length === 0);
  await p.click('#m-save'); await p.click('.gf-confirm-oui'); await p.waitForTimeout(500);
  verifier(`Consigne : Confirmer envoie seulement le stockage, sans vitesse`,
    envois.length === 1 && envois[0].url.includes('id=eq.stockage') && !envois[0].body.includes('vitesse_sim'), JSON.stringify(envois));
  verifier(`Consigne : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
  await ctx.close(); }

// Ancien commun.js en cache (sans GF.confirmer) : la confirmation du navigateur prend le relais
{ const {ctx, p, erreurs} = await ouvrir('index.html', 'client', true);
  const envois = [];
  p.on('request', r => { if(r.method() === 'PATCH' && r.url().includes('consignes')) envois.push(r.url()); });
  let message = '';
  p.on('dialog', d => { message = d.message(); d.accept(); });
  await p.evaluate(() => { delete GF.confirmer; openModal('sto', 'hr'); });
  await p.fill('#mf-shr', '88'); await p.click('#m-save'); await p.waitForTimeout(500);
  verifier(`Consigne sans GF.confirmer : confirmation de secours puis envoi`, message.includes('→ 88 %') && envois.length === 1, message);
  verifier(`Consigne sans GF.confirmer : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
  await ctx.close(); }

{ const {ctx, p, erreurs} = await ouvrir('operateur.html', 'super_admin', true);
  const envois = [];
  p.on('request', r => { if(r.method() === 'PATCH' && r.url().includes('consignes')) envois.push(r.postData()); });
  await p.evaluate(() => { CSG_DB.stockage = {csg_t: 6, csg_hr: 90, vitesse_sim: 500, mode_standby: false, mode_descente: false};
                           CMD.csg_t = 6; CMD.csg_hr = 90; CMD.vitesse_sim = 1; adj('csg_t', -0.5); applyCmd('sto'); });
  await p.waitForSelector('.gf-confirm');
  verifier(`Opérateur : confirmation avant d'appliquer`, (await p.textContent('.gf-confirm')).includes('→ 5.5 °C'));
  await p.click('.gf-confirm-oui'); await p.waitForTimeout(500);
  verifier(`Opérateur : Appliquer ne renvoie plus la vitesse`, envois.length === 1 && !envois[0].includes('vitesse_sim'), envois.join(' | '));
  verifier(`Opérateur : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
  await ctx.close(); }

// En-tête client : seulement le nom de l'exploitation ; historique en direct
{ const {ctx, p, erreurs, visible} = await ouvrir('index.html', 'client', false);
  verifier(`En-tête client : nom de l'exploitation`, (await p.textContent('#exploit-nom-hdr')).includes('Site Pilote'));
  verifier(`En-tête client : horloge, météo, email cachés`,
    !(await visible('.sim-clock')) && !(await visible('.ext-strip')) && !(await visible('#user-email')) && !(await visible('#clk')));
  let appels = 0;
  p.on('request', r => { if(r.url().includes('rpc/historique')) appels++; });
  await p.click('#tbx'); await p.waitForTimeout(600);
  const avant = appels;
  await p.evaluate(() => { _histDernier = 0; rafraichirHistorique(); }); await p.waitForTimeout(600);
  verifier(`Historique : se recharge tout seul à une nouvelle mesure`, appels > avant, `${avant} → ${appels}`);
  verifier(`Historique : indicateur « En direct »`, await visible('#hist-direct'));
  verifier(`En-tête / direct : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
  await ctx.close(); }
{ const {ctx, visible} = await ouvrir('index.html', 'super_admin', false);
  verifier(`En-tête staff : horloge simulée visible`, await visible('.sim-clock'));
  await ctx.close(); }

// Portail
{ const {ctx, erreurs, visible} = await ouvrir('portail.html', 'client', true);
  verifier(`Portail / client : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
  verifier(`Portail / client : section Saisons terminées`, await visible('#saisons-section'));
  await ctx.close(); }

await browser.close();
console.log(echecs ? `\n${echecs} test(s) en échec` : '\nTous les tests passent ✓');
process.exit(echecs ? 1 : 0);
