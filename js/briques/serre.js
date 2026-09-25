// ================================================================
// GeoFresh — Brique SERRE
// Pas encore de capteurs : un encart indique que la brique est déclarée.
// Modèle à copier pour un nouveau bâtiment (chambre froide, séchoir…) :
//   1. créer js/briques/<type>.js sur ce modèle
//   2. l'ajouter dans GF.fichiersBriques (js/commun.js)
//   3. l'ajouter dans GEOFRESH_CONFIG.briques (config.js) pour son libellé
// ================================================================
(function() {

const encart = b => `
  <div class="card c-extra" data-brique="serre">
    <div class="ct">${gfBriqueLabel('serre')} <span class="brique-sub">${b.nom ? '· ' + b.nom : ''}</span></div>
    <div class="extra-msg">Brique déclarée — pas encore de capteurs raccordés.<br/>
      Les mesures apparaîtront ici dès la mise en service.</div>
  </div>`;

// ── VUE CLIENT : un onglet + un panneau
function monterClient(b) {
  document.getElementById('tbx').insertAdjacentHTML('beforebegin',
    `<button class="tb" id="tbserre" data-brique="serre">${gfBriqueLabel('serre')}</button>`);
  document.getElementById('phistory').insertAdjacentHTML('beforebegin', `
    <div class="tc" id="pserre" data-brique="serre" style="display:none;padding:20px 26px;">
      <div class="card">
        <div class="ct">${gfBriqueLabel('serre')}${b.nom ? ' — ' + b.nom : ''}</div>
        <div style="font-size:11px;color:var(--muted);line-height:1.7;">
          Brique déclarée — pas encore de capteurs raccordés.<br/>
          Les mesures apparaîtront ici dès la mise en service.
        </div>
      </div>
    </div>`);
  document.getElementById('tbserre').addEventListener('click', () => switchTab('serre'));
}

// ── VUE OPÉRATEUR : un encart dans la grille
function monterOperateur(b) {
  document.getElementById('briques-extra').insertAdjacentHTML('beforeend', encart(b));
}

GF.briques.serre = {
  client:    { monter: monterClient },
  operateur: { monter: monterOperateur },
};

})();
