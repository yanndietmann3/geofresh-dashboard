// ================================================================
// GeoFresh — Brique HABITATION (maison agricole + PAC3)
// Chargée par js/commun.js seulement si l'exploitation a une brique
// « habitation » active. Sans maison : ce fichier n'est jamais chargé.
// ================================================================
(function() {

// ── VUE CLIENT (index.html) ─────────────────────────────────────
const ONGLET_CLIENT = `
  <button class="tb" id="tbh">
    🏠 Habitation
    <span class="tbdg tok" id="badge-h">OK</span>
  </button>`;

const PANNEAU_CLIENT = `
<!-- ══════════════════════════════════════════════════════
     PANEL HABITATION
══════════════════════════════════════════════════════ -->
<div class="tc ch" id="ph">
  <!-- Bannière module désactivé -->
  <div id="hab-disabled-banner" style="display:none;margin-bottom:16px;padding:12px 16px;background:rgba(122,99,82,0.15);border:1px solid rgba(122,99,82,0.4);border-radius:10px;color:var(--muted);font-size:11px;text-align:center;">⊘ Module Habitation désactivé<span class="staff-only"> — </span><a class="staff-only" href="operateur.html" style="color:var(--sa);text-decoration:none;">Activer dans le panneau Opérateur →</a></div>

  <!-- Zone 1 -->
  <div class="card" id="card-hab-clim">
    <div class="ct">Zone 1 — Séjour</div>
    <div class="mbig" id="h-z1">--<span class="u">°C</span></div>
    <button class="csgbtn" onclick="openModal('hab','z1')" id="h-csgz1-btn">Csg : -- °C <span class="ei">✎</span></button>
    <div style="margin-top:10px;">
      <div style="font-size:7px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">Ventilo-convecteur Z1</div>
      <div class="gbar" style="margin-top:4px;"><div class="gfill" id="h-vc1-fill" style="width:12%"></div></div>
    </div>
    <div class="fcb fcoff" id="h-vc1-b">Inactif</div>
    <div class="sg">
      <div class="si"><div class="sl">Hyst</div><div class="sv" style="color:var(--muted)">±1.0 °C</div></div>
    </div>
  </div>

  <!-- Zone 2 -->
  <div class="card">
    <div class="ct">Zone 2 — Chambres</div>
    <div class="mbig" id="h-z2">--<span class="u">°C</span></div>
    <button class="csgbtn" onclick="openModal('hab','z2')" id="h-csgz2-btn">Csg : -- °C <span class="ei">✎</span></button>
    <div style="margin-top:10px;">
      <div style="font-size:7px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">Ventilo-convecteur Z2</div>
      <div class="gbar" style="margin-top:4px;"><div class="gfill" id="h-vc2-fill" style="width:12%"></div></div>
    </div>
    <div class="fcb fcoff" id="h-vc2-b">Inactif</div>
    <div class="sg">
      <div class="si"><div class="sl">Hyst</div><div class="sv" style="color:var(--muted)">±1.0 °C</div></div>
    </div>
  </div>

  <!-- ECS -->
  <div class="card" id="card-hab-ecs">
    <div class="ct">ECS — Eau Chaude Sanitaire</div>
    <div class="ecswrap">
      <div class="ecsring">
        <svg viewBox="0 0 76 76" width="76" height="76">
          <circle class="ecst" cx="38" cy="38" r="29"/>
          <circle class="ecsp" id="h-ecsp" cx="38" cy="38" r="29" stroke-dasharray="182" stroke-dashoffset="182"/>
        </svg>
        <div class="ecsin"><div class="ecsv" id="h-ecs-v">--</div><div class="ecsu">°C</div></div>
      </div>
      <div>
        <div style="font-size:7px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">Consigne ECS</div>
        <div style="font-family:'Syne';font-size:19px;font-weight:700;color:var(--hamb)" id="h-csgecs-v">-- °C</div>
        <button class="csgbtn" style="margin-top:5px;" onclick="openModal('hab','ecs')">Modifier <span class="ei">✎</span></button>
        <div style="margin-top:7px;font-size:7px;letter-spacing:2px;color:var(--muted);text-transform:uppercase">Vanne ECS</div>
        <div class="fcb fcoff" id="h-vanne-b" style="margin-top:3px;">Fermee</div>
      </div>
    </div>
    <!-- Cumul PAC saison -->
    <div class="cumul-strip">
      <div class="cumul-it">
        <div class="cumul-v" id="h-cumul-h" style="color:var(--ha)">0 h</div>
        <div class="cumul-l">Cumul PAC saison</div>
      </div>
      <div class="cumul-it">
        <div class="cumul-v" id="h-cumul-ecs" style="color:var(--hamb)">0 h</div>
        <div class="cumul-l">Dont ECS</div>
      </div>
    </div>
  </div>

  <!-- PAC + Mode + Switch AUTO/MANU -->
  <div class="card">
    <div class="ct">PAC & Mode</div>
    <div class="mbdg mph-STAND" id="h-mode">INIT</div>

    <div class="pacs pac-off" id="h-pac">
      <div class="pacc">⚙️</div>
      <div><div class="pact" id="h-pact">PAC OFF</div><div class="pacd" id="h-pacd">En attente</div></div>
    </div>
    <!-- Bouton STANDBY habitation -->
    <div class="mode-btns staff-only" style="margin-top:8px;">
      <div class="mode-btn" id="h-btn-standby" onclick="toggleStandbyHab()" title="PAC OFF — zones dérivent vers T_ext">
        ⏸ STANDBY
      </div>
      <div class="mode-btn active-descente" id="h-btn-auto" onclick="toggleStandbyHab('auto')" title="Mode automatique">
        ▶ AUTO
      </div>
    </div>
    <!-- Switch AUTO / MANU -->
    <div class="sw-wrap staff-only" style="margin-top:10px;">
      <span class="sw-lbl">Mode</span>
      <label class="sw" title="Basculer Auto/Manu">
        <input type="checkbox" id="h-sw-manu" onchange="toggleManu('hab')"/>
        <div class="sw-track"></div>
        <div class="sw-thumb"></div>
      </label>
      <span class="sw-val" id="h-sw-lbl" style="color:var(--muted)">AUTO</span>
    </div>
    <!-- Commandes manuelles (masquees si AUTO) -->
    <div id="h-manu-cmds" style="display:none;margin-top:8px;">
      <div style="font-size:7px;letter-spacing:2px;color:var(--samb);text-transform:uppercase;margin-bottom:6px;">Commandes manuelles</div>
      <div class="manu-cmds">
        <div class="cmd-btn" id="h-cmd-pac" onclick="toggleCmd('hab','pac')">❄️ PAC</div>
        <div class="cmd-btn" id="h-cmd-vc1" onclick="toggleCmd('hab','vc1')">🌬 VC Z1</div>
        <div class="cmd-btn" id="h-cmd-vc2" onclick="toggleCmd('hab','vc2')">🌬 VC Z2</div>
      </div>
    </div>
    <div class="sg" style="margin-top:8px;">
      <div class="si"><div class="sl">Anti-cycle</div><div class="sv" id="h-acc">-- min</div></div>
      <div class="si"><div class="sl">T eau dep</div><div class="sv" style="color:var(--hsky)" id="h-dep">-- °C</div></div>
    </div>
  </div>

  <!-- Circuit hydraulique + Pompes -->
  <div class="card s2">
    <div class="ct">Circuit hydraulique & Pompes</div>
    <div class="pmrow">
      <div class="pm" id="h-ps"><div class="pmico">🌡️</div><div class="pmlbl">Pompe Sol</div><div class="pmst" id="h-ps-s">OFF</div></div>
      <div class="pm" id="h-pc"><div class="pmico">🔄</div><div class="pmlbl">Circuit</div><div class="pmst" id="h-pc-s">OFF</div></div>
      <div class="pm" id="h-p1"><div class="pmico">🌬️</div><div class="pmlbl">VC Zone 1</div><div class="pmst" id="h-p1-s">OFF</div></div>
      <div class="pm" id="h-p2"><div class="pmico">🌬️</div><div class="pmlbl">VC Zone 2</div><div class="pmst" id="h-p2-s">OFF</div></div>
      <div class="pm" id="h-pe"><div class="pmico">🚿</div><div class="pmlbl">Vanne ECS</div><div class="pmst" id="h-pe-s">OFF</div></div>
    </div>
  </div>

  <!-- Securites + Alarmes -->
  <div class="card s2">
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;">
      <div>
        <div class="ct">Alarmes & Securites</div>

        <div class="sg" style="margin-top:8px;">
          <div class="si"><div class="sl">Surchauffe ECS</div><div class="sv" id="h-ecsmax">OK</div></div>
          <div class="si"><div class="sl">Gel sol</div><div class="sv" id="h-gel">OK</div></div>
        </div>
      </div>
      <div>
        <div class="ct">Journal</div>
        <div class="logl" id="h-log"></div>
      </div>
    </div>
  </div>

</div><!-- /ph -->`;

function monterClient() {
  document.getElementById('tbs').insertAdjacentHTML('afterend', ONGLET_CLIENT);
  document.getElementById('ps').insertAdjacentHTML('beforebegin', PANNEAU_CLIENT);
  document.getElementById('tbh').addEventListener('click', () => switchTab('h'));
  document.getElementById('ph').style.display = 'none';
}

// Mise à jour du panneau avec une mesure habitation_readings (+ conditions extérieures)
function majClient(d){
  const z1=parseFloat(d.t_int_z1||20),z2=parseFloat(d.t_int_z2||19);
  document.getElementById('h-z1').innerHTML=z1.toFixed(1)+'<span class="u">°C</span>';
  document.getElementById('h-z2').innerHTML=z2.toFixed(1)+'<span class="u">°C</span>';
  refreshCsg();

  const vc1=!!d.ventilateurcoil_z1_on, vc2=!!d.ventilateurcoil_z2_on;
  const fcC='var(--hamb)';  // toujours ambre (chauffage uniquement)
  // En MANU : commandes clavier | En AUTO : données simulateur
  const isManuH = MANU.hab.on;
  const vc1m = isManuH ? MANU.hab.vc1 : vc1;
  const vc2m = isManuH ? MANU.hab.vc2 : vc2;
  document.getElementById('h-vc1-fill').style.cssText=`width:${vc1m?85:12}%;background:${fcC}`;
  document.getElementById('h-vc2-fill').style.cssText=`width:${vc2m?85:12}%;background:${fcC}`;
  setFcb('h-vc1-b',vc1m); setFcb('h-vc2-b',vc2m);

  const tecs=parseFloat(d.t_ecs||52);
  document.getElementById('h-ecs-v').textContent=tecs.toFixed(1);
  const ecsPct=Math.max(0,Math.min(1,(tecs-15)/(CSG.hab.ecs+10-15)));
  document.getElementById('h-ecsp').style.strokeDashoffset=182-182*ecsPct;
  const von=!!d.vanne_ecs_on;
  const vb=document.getElementById('h-vanne-b'); vb.textContent=von?'Ouverte':'Fermee'; vb.className='fcb '+(von?'fcon':'fcoff');

  // Cumul
  // Cumul habitation : MAX local vs Supabase pour survivre aux redémarrages
  const newHabH = parseFloat(d.cumul_pac_h || 0);
  if(newHabH > CUMUL.hab.h) {
    CUMUL.hab.h   = newHabH;
    CUMUL.hab.ecs = parseFloat(d.cumul_ecs_h || 0);
  } else if(!!d.pac_on) {
    CUMUL.hab.h   += CYCLE_S/3600;
    if(von) CUMUL.hab.ecs += CYCLE_S/3600;
  }
  document.getElementById('h-cumul-h').textContent=CUMUL.hab.h.toFixed(1)+' h';
  document.getElementById('h-cumul-ecs').textContent=CUMUL.hab.ecs.toFixed(1)+' h';

  const mode=d.mode_actif||'INIT';
  const isManu=MANU.hab.on;
  const mp=document.getElementById('h-mode');
  // En MANU : afficher juste STANDBY (pas le mode AUTO)
  mp.textContent = isManu ? 'STANDBY' : mode;
  mp.className='mbdg';
  if(isManu) mp.classList.add('mph-STAND');
  else if(mode.includes('ECS'))   mp.classList.add('mph-ECS');
  else if(mode.includes('CLIM'))  mp.classList.add('mph-CLIM');   // CLIM avant CHAUF/Z1/Z2
  else if(mode.includes('CHAUF')) mp.classList.add('mph-CHAUF');
  else if(mode.includes('ALARM')) mp.classList.add('mph-ALARM');
  else mp.classList.add('mph-STAND');



  // En mode MANU : commandes opérateur | En AUTO : données simulateur
  const pOn  = isManu ? MANU.hab.pac : !!d.pac_on;
  const ps=document.getElementById('h-pac'); ps.className='pacs '+(pOn?'pac-on':'pac-off');
  document.getElementById('h-pact').textContent=pOn?'PAC EN MARCHE':'PAC ARRETEE';
  document.getElementById('h-pacd').textContent=isManu?'⚙ Mode Manuel':(pOn?'Sol→eau | OK':'Standby');

  document.getElementById('h-acc').textContent=parseFloat(d.temps_depuis_arret_pac_min||0).toFixed(0)+' min';
  document.getElementById('h-eau-ret').textContent=parseFloat(d.t_eau_ret||35).toFixed(1)+' °C';
  document.getElementById('h-ret-f').style.width=Math.max(0,Math.min(100,(parseFloat(d.t_eau_ret||35)-5)/50*100))+'%';

  setPm('h-ps','h-ps-s', pOn);
  setPm('h-pc','h-pc-s', pOn || !!d.pompe_circuit_on);
  setPm('h-p1','h-p1-s', vc1m); setPm('h-p2','h-p2-s', vc2m); setPm('h-pe','h-pe-s',von);

  const ap=document.getElementById('h-ap'),am=document.getElementById('h-am');
  ap.className='apa';
  if(!d.alarme_active){ap.classList.add('aok');am.textContent='✓ Systeme nominal';}
  else{const niv=parseInt(d.niveau_alarme||0);ap.classList.add(niv>=3?'acrit':'awrn');am.textContent=(niv>=3?'🚨 ':'⚠ ')+d.alarme_active;addLog(logsH,'h-log',d.alarme_active,niv);setBadge('badge-h',niv);}
  if(!d.alarme_active)setBadge('badge-h',0);

  const tEcs=parseFloat(d.t_ecs||0);
  const ee=document.getElementById('h-ecsmax'); ee.textContent=tEcs>63?'⚠ '+tEcs.toFixed(1)+'°C':'OK'; ee.style.color=tEcs>63?'var(--herr)':'var(--ha)';
  const tSol=parseFloat(d.t_sol||10);
  const ge=document.getElementById('h-gel'); ge.textContent=tSol<-3?'⚠ '+tSol.toFixed(1)+'°C':'OK'; ge.style.color=tSol<-3?'var(--herr)':'var(--ha)';
}

// Bouton STANDBY / AUTO de la maison (appelé depuis le panneau ci-dessus)
window.toggleStandbyHab = async function(mode) {
  if(!gfIsStaff(USER_ROLE)) return;  // vue client : lecture seule
  const isStandby = mode !== 'auto' && document.getElementById('h-btn-standby').className.includes('active');
  const newStandby = mode === 'auto' ? false : !isStandby;
  document.getElementById('h-btn-standby').className = 'mode-btn' + (newStandby?' active-standby':'');
  document.getElementById('h-btn-auto').className    = 'mode-btn' + (!newStandby?' active-descente':'');
  // Basculer MANU si STANDBY
  const swManu = document.getElementById('h-sw-manu');
  if(newStandby && swManu && !swManu.checked){ swManu.checked=true; toggleManu('hab'); }
  else if(!newStandby && swManu && swManu.checked){ swManu.checked=false; toggleManu('hab'); }
  if(SUPABASE_KEY!=='VOTRE_ANON_KEY') {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/consignes?exploitation_id=eq.${EXPLOIT_ID}&id=eq.habitation`, {
        method:'PATCH',
        headers:{...HDRS,'Content-Type':'application/json','Prefer':'return=minimal'},
        body: JSON.stringify({mode_standby_hab: newStandby, updated_at: new Date().toISOString()})
      });
    } catch(e) {}
  }
};

// ── VUE OPÉRATEUR (operateur.html) ──────────────────────────────
const CARTE_ETAT_OPE = `
  <!-- ── HABITATION PAC3 ── -->
  <div class="card c-hab" data-brique="habitation">
    <div class="ct">🏠 Habitation <span class="brique-sub" data-brique-nom="habitation"></span></div>
    <div class="row3">
      <div class="metric">
        <div class="mlbl">Zone 1</div>
        <div class="mval info" id="h-z1">–<span class="u">°C</span></div>
        <div class="msub" id="h-z1csg">csg –°C</div>
      </div>
      <div class="metric">
        <div class="mlbl">Zone 2</div>
        <div class="mval info" id="h-z2">–<span class="u">°C</span></div>
        <div class="msub" id="h-z2csg">csg –°C</div>
      </div>
      <div class="metric">
        <div class="mlbl">ECS</div>
        <div class="mval" id="h-ecs">–<span class="u">°C</span></div>
        <div class="msub" id="h-ecscsg">csg –°C</div>
      </div>
    </div>
    <div class="pac-row" style="margin-top:12px;">
      <div class="pac-unit off" id="h-p3"><div class="pac-dot"></div><div class="pac-lbl lbl-pac-hab">PAC3</div><div class="pac-kw" id="h-p3kw">0 kW</div></div>
    </div>
    <div class="row3" style="margin-top:10px;">
      <div class="metric">
        <div class="mlbl">Mode</div>
        <div style="font-size:10px;font-weight:600;color:var(--ha);margin-top:2px;" id="h-mode">–</div>
      </div>
      <div class="metric">
        <div class="mlbl">T_eau dep</div>
        <div class="mval info" id="h-tdep" style="font-size:16px;">–<span class="u">°C</span></div>
      </div>
      <div class="metric">
        <div class="mlbl">VC Z1 / Z2</div>
        <div style="font-size:9px;margin-top:4px;" id="h-vc">–</div>
      </div>
    </div>
    <div id="h-alarm" class="alarm-row ok" style="margin-top:10px;">✓ Aucune alarme</div>
  </div>`;

const CARTE_CMD_OPE = `
  <!-- ── COMMANDES HABITATION ── -->
  <div class="card c-cmd" id="card-commandes-hab">
    <div class="ct">⚙ Commandes 🏠 Habitation</div>
    <div class="cmd-section">
      <div class="cmd-grid">
        <div class="cmd-item">
          <div class="cmd-lbl">T Zone 1 (°C)</div>
          <div class="cmd-ctrl">
            <button class="cmd-btn" onclick="adj('csg_z1',-0.5)">−</button>
            <div class="cmd-val" id="v-csg-z1">20.0</div>
            <button class="cmd-btn" onclick="adj('csg_z1',+0.5)">+</button>
          </div>
        </div>
        <div class="cmd-item">
          <div class="cmd-lbl">T Zone 2 (°C)</div>
          <div class="cmd-ctrl">
            <button class="cmd-btn" onclick="adj('csg_z2',-0.5)">−</button>
            <div class="cmd-val" id="v-csg-z2">19.0</div>
            <button class="cmd-btn" onclick="adj('csg_z2',+0.5)">+</button>
          </div>
        </div>
        <div class="cmd-item">
          <div class="cmd-lbl">T ECS (°C)</div>
          <div class="cmd-ctrl">
            <button class="cmd-btn" onclick="adj('csg_ecs',-1)">−</button>
            <div class="cmd-val" id="v-csg-ecs">55</div>
            <button class="cmd-btn" onclick="adj('csg_ecs',+1)">+</button>
          </div>
        </div>
        <div class="cmd-item">
          <div class="cmd-lbl">STANDBY hab</div>
          <div class="cmd-ctrl" style="margin-top:4px;">
            <button class="toggle-btn off" id="btn-stdby-hab" onclick="toggleMode('hab','standby')">INACTIF</button>
          </div>
        </div>
      </div>
      <button class="cmd-apply" onclick="applyCmd('hab')">Appliquer Habitation</button>
    </div>
  </div>`;

function monterOperateur() {
  document.getElementById('slot-habitation-etat').insertAdjacentHTML('beforeend', CARTE_ETAT_OPE);
  document.getElementById('slot-habitation-cmd').insertAdjacentHTML('beforeend', CARTE_CMD_OPE);
}

// Mise à jour avec la dernière mesure habitation (ctx : puissance élec PAC3, T départ eau)
function majOperateur(hab, {pElecHab, tDep}) {
  const tZ1 = parseFloat(hab.t_int_z1??0);
  const tZ2 = parseFloat(hab.t_int_z2??0);
  const tEcs = parseFloat(hab.t_ecs??0);
  set('h-z1', fmt1(tZ1)+'<span class="u">°C</span>', tempClass(tZ1,CMD.csg_z1,1));
  set('h-z1csg', `csg ${CMD.csg_z1}°C`);
  set('h-z2', fmt1(tZ2)+'<span class="u">°C</span>', tempClass(tZ2,CMD.csg_z2,1));
  set('h-z2csg', `csg ${CMD.csg_z2}°C`);
  const ecsCl = tEcs < 45 ? 'warn' : tEcs > 65 ? 'err' : 'ok';
  set('h-ecs', fmt1(tEcs)+'<span class="u">°C</span>', ecsCl);
  set('h-ecscsg', `csg ${CMD.csg_ecs}°C`);
  setPac('h-p3', !!hab.pac_on, 'PAC3', fmt1(pElecHab)+' kW élec');
  txt('h-p3kw', fmt1(parseFloat(hab.pac_kw??0))+' kW th');
  set('h-mode', hab.mode_actif??'–');
  set('h-tdep', fmt1(tDep)+'<span class="u">°C</span>');
  const vc1 = !!hab.fancoil_z1_on, vc2 = !!hab.fancoil_z2_on;
  set('h-vc', `Z1:${vc1?'<span style="color:var(--ha)">ON</span>':'OFF'} Z2:${vc2?'<span style="color:var(--ha)">ON</span>':'OFF'}`);
  const alHab = hab.alarme_active;
  const alDivH = document.getElementById('h-alarm');
  alDivH.className = 'alarm-row ' + (alHab ? (hab.niveau_alarme>=3?'crit':'warn') : 'ok');
  alDivH.textContent = alHab ? '⚠ '+alHab : '✓ Aucune alarme';
}

GF.briques.habitation = Object.assign(GF.briques.habitation || {}, {
  client:    { monter: monterClient,    maj: majClient },
  operateur: { monter: monterOperateur, maj: majOperateur },
});

})();
