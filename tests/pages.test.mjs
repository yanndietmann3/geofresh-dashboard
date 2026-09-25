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
  stockage_readings:   [{t_stock:5.2, pac_on:true, pac1_on:true, pac2_on:false, pac_kw:15, mode_actif:'FROID MECANIQUE'}],
  habitation_readings: [{t_int_z1:20.4, t_int_z2:18.9, t_ecs:52, pac_on:true, pac_kw:9, mode_actif:'CHAUFFAGE'}],
  conditions_externes: [{t_ext:12.5, hr_ext:78, t_rosee:8}],
};

const browser = await chromium.launch();
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

// Portail
{ const {ctx, erreurs, visible} = await ouvrir('portail.html', 'client', true);
  verifier(`Portail / client : pas d'erreur JS`, !erreurs.length, erreurs.join(' | '));
  verifier(`Portail / client : section Saisons terminées`, await visible('#saisons-section'));
  await ctx.close(); }

await browser.close();
console.log(echecs ? `\n${echecs} test(s) en échec` : '\nTous les tests passent ✓');
process.exit(echecs ? 1 : 0);
