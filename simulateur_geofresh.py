"""
╔══════════════════════════════════════════════════════════╗
║   GeoFresh — Simulateur Python Windows                   ║
║   Jumeau Numerique : Stockage PDT + Habitation PAC       ║
║                                                          ║
║   CONFIGURATION : remplissez les 3 lignes ci-dessous    ║
║   puis double-cliquez sur ce fichier pour lancer         ║
╚══════════════════════════════════════════════════════════╝
"""

# ═══════════════════════════════════════════════════════════
#  ▶ CONFIGUREZ ICI (copiez depuis Supabase → Settings → API)
# ═══════════════════════════════════════════════════════════
SUPABASE_URL     = "https://diqxglwsffrlfziymplm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcXhnbHdzZmZybGZ6aXltcGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODQwMjksImV4cCI6MjA5NDE2MDAyOX0.7sOo_xhhtISH9tQyJ7pg2Z3eXlDZfKZA5Xp6D7-Gs2w"   # ← coller ici votre anon key
CYCLE_SECONDES   = [30]                # intervalle entre chaque envoi [mutable pour accélération]
# ═══════════════════════════════════════════════════════════

import sys, time, math, random, json, urllib.request, urllib.error
from datetime import datetime

# ── Installation automatique de supabase-py ─────────────────
def install_if_missing(package):
    try:
        __import__(package.replace("-","_"))
    except ImportError:
        print(f"  Installation de {package}...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])

install_if_missing("supabase")
from supabase import create_client

# ── Couleurs console Windows ─────────────────────────────────
GREEN  = "\033[92m"
CYAN   = "\033[96m"
YELLOW = "\033[93m"
RED    = "\033[91m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def p(msg, color=RESET): print(f"{color}{msg}{RESET}")


# ═══════════════════════════════════════════════════════════
#  GENERATEUR METEO (Hauts-de-France, tres variable)
# ═══════════════════════════════════════════════════════════
class Meteo:
    """
    Generateur meteo realiste — Hauts-de-France (Lille / Cambrai)
    Source : normales climatologiques Meteo-France 1991-2020

    Temperatures moyennes mensuelles (°C) :
      Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
       3.5  4.0  7.0 10.5 14.0 17.0 19.5 19.0 15.5 11.5  7.0  4.0

    Nombre de jours de gel par mois (T < 0°C) :
      Jan=10 Feb=8 Mar=3 Apr=0 May=0 Jun=0 Jul=0 Aug=0 Sep=0 Oct=1 Nov=4 Dec=8
    → Gel rare et surtout en janv/fev, JAMAIS de mai a octobre

    Humidite relative moyenne : 82% annuelle (min 75% ete, max 90% hiver)
    """

    # Normales mensuelles Hauts-de-France
    T_MOY  = [3.5, 4.0, 7.0, 10.5, 14.0, 17.0, 19.5, 19.0, 15.5, 11.5, 7.0, 4.0]
    T_AMPL = [4.5, 4.5, 5.0,  6.0,  7.0,  7.5,  8.0,  8.0,  7.0,  5.5, 4.5, 4.0]  # amplitude journalière
    # Probabilite de gel par mois (fraction de cycles a risque)
    P_GEL  = [0.08,0.06,0.02, 0.0,  0.0,  0.0,  0.0,  0.0,  0.0, 0.005,0.03,0.06]
    HR_MOY = [87,  85,  80,   75,   73,   72,   73,   74,   79,   83,  87,  88 ]

    def __init__(self):
        now = datetime.now()
        mois = now.month - 1  # 0-indexed
        self.t_ext   = self.T_MOY[mois] + random.gauss(0, 1.5)
        self.hr_ext  = float(self.HR_MOY[mois]) + random.gauss(0, 3)
        self.t_sol   = 10.1
        self.wind    = 3.5
        self._t_tr   = 0.0
        self._hr_tr  = 0.0
        self._cycles = 0

    def _t_cible(self):
        """Temperature cible selon mois + heure du jour."""
        now  = datetime.now()
        mois = now.month - 1
        heure = now.hour + now.minute / 60.0
        # Cycle journalier : minimum a 6h, maximum a 14h
        cycle_j = math.sin((heure - 6) * math.pi / 14) if 6 <= heure <= 20 else                   -math.sin((heure - 20) * math.pi / 10 + math.pi) if heure > 20 else                   -math.sin((heure + 4) * math.pi / 10)
        return self.T_MOY[mois] + self.T_AMPL[mois] * 0.5 * cycle_j

    def step(self):
        self._cycles += 1
        now  = datetime.now()
        mois = now.month - 1

        # ── Rappel vers la normale (force de rappel = 0.08) ───────────────
        # Sans ca, la temperature derive indefiniment
        t_cible  = self._t_cible()
        rappel_t = 0.08 * (t_cible - self.t_ext)

        hr_cible  = float(self.HR_MOY[mois])
        rappel_hr = 0.06 * (hr_cible - self.hr_ext)

        # ── Fronts meteorologiques (sauts brusques) ────────────────────────
        # Frequence realiste : 1 front tous les ~3 jours = 1 saut / ~4320 cycles a 30s
        # On simule ca avec prob 0.03 par cycle (~1 par heure en demo)
        # Fronts moderes : amplitude 1.8°C max (realiste Hauts-de-France)
        if random.random() < 0.025:
            self._t_tr  = random.gauss(0, 1.8)
        if random.random() < 0.025:
            self._hr_tr = random.gauss(0, 5.0)

        # Amortissement progressif (le front passe en quelques heures)
        self._t_tr  *= 0.93
        self._hr_tr *= 0.90

        # Bruit de mesure fin
        bruit_t  = random.gauss(0, 0.35)
        bruit_hr = random.gauss(0, 1.2)

        # Rappel renforce : 0.10 (au lieu de 0.08) pour rester proche de la normale
        rappel_t  = 0.10 * (t_cible - self.t_ext)
        rappel_hr = 0.08 * (float(self.HR_MOY[mois]) - self.hr_ext)

        self.t_ext  += rappel_t + self._t_tr + bruit_t
        self.hr_ext += rappel_hr + self._hr_tr + bruit_hr

        # ── Gel : uniquement si mois a risque ET ecart plausible ──────────
        # En Hauts-de-France : gel possible janv/fev/mar/nov/dec
        # La temperature ne peut descendre sous -5°C que tres rarement
        p_gel = self.P_GEL[mois]
        if p_gel == 0:
            # Jamais de gel d'avril a octobre — minimum 2°C
            t_min = 2.0
        elif random.random() < p_gel:
            # Episode de gel leger : -3°C max (Hauts-de-France oceanique)
            t_min = random.uniform(-3.0, 0.0)
        else:
            # Pas de gel ce cycle : minimum = T_cible - 3.5°C mais >= 0.5°C
            t_min = max(0.5, t_cible - 3.5)

        # Borne haute : jamais plus de 35°C
        t_max = 35.0

        self.t_ext  = max(t_min, min(t_max, self.t_ext))
        self.hr_ext = max(40.0, min(99.0, self.hr_ext))

        # ── Sol geothermique (tres stable, variation saisonniere lente) ───
        t_sol_cible = 8.0 + 3.5 * math.sin((now.month - 4) * math.pi / 6)
        self.t_sol += 0.002 * (t_sol_cible - self.t_sol) + random.gauss(0, 0.02)
        self.t_sol  = max(4.0, min(14.0, self.t_sol))

        # ── Vent ──────────────────────────────────────────────────────────
        self.wind = max(0, self.wind * 0.95 + random.gauss(3.5, 1.5) * 0.05)
        self.wind = max(0, min(25, self.wind))

    @property
    def t_rosee(self):
        return self.t_ext - ((100 - self.hr_ext) / 5.0)

    def to_dict(self):
        return {
            "t_ext":      round(self.t_ext,  2),
            "hr_ext":     round(self.hr_ext, 2),
            "t_rosee":    round(self.t_rosee,2),
            "t_sol":      round(self.t_sol,  2),
            "irradiance": 0.0,
            "wind_speed": round(self.wind,   2),
        }


# ═══════════════════════════════════════════════════════════
#  SIMULATEUR STOCKAGE POMMES DE TERRE
#  Logique conforme Draw.io pages 1-4
# ═══════════════════════════════════════════════════════════
class SimulateurStockage:
    def __init__(self, csg_t=6.0, csg_hr=90.0, hyst_t=0.5, hyst_hr=3.0):
        self.csg_t    = csg_t
        self.csg_hr   = csg_hr
        self.hyst_t   = hyst_t
        self.hyst_hr  = hyst_hr

        # Etat interne
        self.t_stock  = 7.2
        self.hr_stock = 88.0
        self.t_batt   = 10.0
        self.co2_ppm  = 900.0   # ppm — niveau initial normal stockage
        self.pac_on   = False
        self.cumul_pac_h = 0.0
        self.duree_degivrage_min = 0.0
        self.pr_phase = 0

        # Memoire cycle PAC
        self._last_pac = False
        self._temps_depuis_arret_pac = 65.0  # minutes

    def _mode(self, meteo):
        """Selection du mode — priorites Draw.io pages 1-4."""
        t  = self.t_stock
        hr = self.hr_stock

        besoin_froid = t  > self.csg_t  + self.hyst_t
        besoin_sech  = hr > self.csg_hr + self.hyst_hr

        t_rosee = meteo.t_rosee
        fc_ok   = (meteo.t_ext < t - 2.0) and (t_rosee < t - 0.5) and (meteo.t_ext > 0.5)
        degiv   = self.t_batt <= 0.5 or self.duree_degivrage_min > 30

        # CO2 : actions selon niveau (priorité après sécurités)
        co2_critique = self.co2_ppm > 5000
        co2_alerte   = self.co2_ppm > 3500

        if besoin_sech:
            air_fav = (t_rosee < t) and (meteo.t_ext > t - 5) and (meteo.t_ext < t + 3)
            return "SECHAGE-AIR FRAIS" if air_fav else "SECHAGE-CONDENSATION"
        elif degiv and self._last_pac:
            return "DEGIVRAGE"
        elif co2_critique:
            # > 5000 ppm : purge d'air urgente
            return "CO2 CRITIQUE-PURGE AIR" if meteo.t_ext < t + 3 else "CO2 CRITIQUE-VENTIL FORCE"
        elif co2_alerte and meteo.t_ext < t + 3:
            # > 3500 ppm : aération si T_ext acceptable
            return "CO2 ALERTE-AERATION"
        elif fc_ok and besoin_froid:
            return "FREE COOLING"
        elif besoin_froid:
            return "FROID MECANIQUE"
        else:
            return "VENTILATION CYCLIQUE"

    def _volet(self, mode):
        m = mode.upper()
        if "FREE"  in m:                    return True
        if "SECH"  in m and "AIR" in m:     return True
        if "PURGE" in m:                    return True   # CO2 critique + T_ext ok
        if "AERAT" in m:                    return True   # CO2 alerte aération
        return False

    def _ventil(self, mode):
        """Retourne 0 (OFF), 0.5 (HALF), 1.0 (FULL)"""
        m = mode.upper()
        if any(x in m for x in ["DEGIV","ANTI","ALARM","SECURIT"]): return 0
        if "CYCL" in m:    return 0.5
        if "FREE" in m:    return 1.0
        if "SECH" in m and "AIR" in m: return 1.0
        if "FROID" in m or "MECANIQUE" in m:
            if   self.t_stock > self.csg_t + 1.0:       return 1.0
            elif self.t_stock > self.csg_t - self.hyst_t: return 0.5
            else:                                          return 0.0
        if "SECH" in m:    return 1.0
        return 0.0

    def step(self, meteo, dt_s=30):
        """Avancer la simulation d'un cycle."""
        dt_h = dt_s / 3600.0
        mode = self._mode(meteo)

        # PAC avec hysteresis
        if "FROID" in mode.upper():
            if   self.t_stock > self.csg_t + self.hyst_t: self.pac_on = True
            elif self.t_stock < self.csg_t - self.hyst_t: self.pac_on = False
        else:
            self.pac_on = False

        volet = self._volet(mode)

        # ── Physique stockage — bilan énergétique 500t PDT ──────────────
        #
        # Masse thermique : 500 000 kg × cp=3.5 kJ/kg°C = 1 750 000 kJ/°C
        # PAC 30kW sur 30s → ΔT = 30 × 30 / 1 750 000 = 0.000514°C/cycle
        # → Consigne 6°C atteinte depuis 7°C en ~18h de PAC en continu
        # → Inertie ÉNORME : variation max ~0.03°C/h sans PAC
        #
        # Modèle bilan de puissance (kW) → ΔT = P × dt_s / C_th
        # P_pac  = -30 kW si PAC ON et T_stock > csg
        # P_resp = respiration Q10 (~0.25 kW à 5°C pour 500t)
        # P_env  = U_S × (T_ext - T_stock) déperditions enveloppe

        C_TH    = 1_750_000.0   # kJ/°C — capacité thermique 500t PDT
        P_PAC   = 30.0           # kW    — puissance PAC
        P_RESP0 = 0.25           # kW    — respiration à 5°C pour 500t
        U_S     = 0.005          # kW/°C — déperdition enveloppe isolée
        U_S_V   = 0.020          # kW/°C — déperdition volet ouvert

        Q10_factor = math.pow(2.0, (self.t_stock - 5.0) / 10.0)

        P_resp = P_RESP0 * Q10_factor                            # kW, toujours positif
        P_env  = (U_S_V if volet else U_S) * (meteo.t_ext - self.t_stock)  # kW
        P_pac  = -P_PAC if (self.pac_on and self.t_stock > self.csg_t - self.hyst_t) else 0  # kW

        dT = (P_pac + P_resp + P_env) * dt_s / C_TH  # °C/cycle
        self.t_stock += dT + random.gauss(0, 0.003)
        self.t_stock  = max(2.0, min(16.0, self.t_stock))

        # Transpiration PDT → humidite (proportionnel à respiration)
        transp_hr    = 0.0012 * Q10_factor
        chaleur_resp = dT

        # Humidite
        echange_hr = (0.06 * (meteo.hr_ext - self.hr_stock)) if volet else 0
        dehumid    = -0.12 if self.pac_on else 0
        bruit_hr   = random.gauss(0, 0.3)
        self.hr_stock += transp_hr + echange_hr + dehumid + bruit_hr
        self.hr_stock  = max(68, min(99, self.hr_stock))

        # Batterie evaporateur
        # ── Modèle physique batterie évaporateur calibré installation réelle ──
        # PAC 30kW | Descente 10°C→0.5°C en ~3h | Remontée en ~22min
        #
        # Paramètres calibrés :
        #   T_sat   = -2°C  (température saturation basse pression à pleine charge)
        #   tau_ref = 114.7 min (constante de temps refroidissement)
        #   tau_rem = 8.6 min   (constante de temps remontée PAC OFF)
        #   tau_deg = 5.0 min   (dégivrage résistance électrique)

        TAU_REFROID  = 114.7   # min — descente sous charge PAC
        TAU_REMONTEE = 8.6     # min — remontée vers T_stock PAC OFF
        TAU_DEGIV    = 5.0     # min — chauffage résistance dégivrage
        T_SAT        = -2.0    # °C  — température saturation BP
        dt_min       = dt_s / 60.0

        if "DEGIV" in mode.upper():
            # Résistance électrique → montée rapide vers +10°C
            self.t_batt += (10.0 - self.t_batt) / TAU_DEGIV * dt_min
            self.t_batt += random.gauss(0, 0.05)
            self.duree_degivrage_min += dt_min
            # Fin dégivrage : T_batt > 5°C → sortie dégivrage au prochain cycle
        else:
            self.duree_degivrage_min = 0.0
            if self.pac_on:
                # PAC ON : évaporateur se refroidit vers T_sat
                # T_sat s'abaisse légèrement si T_stock élevée (charge plus forte)
                t_sat_eff = T_SAT - max(0, (self.t_stock - 6.0) * 0.2)
                self.t_batt += (t_sat_eff - self.t_batt) / TAU_REFROID * dt_min
            else:
                # PAC OFF : batterie remonte vers T_stock (air du local, pas T_ext)
                self.t_batt += (self.t_stock - self.t_batt) / TAU_REMONTEE * dt_min

            self.t_batt += random.gauss(0, 0.03)

        # Bornes physiques : jamais sous -4°C (antigel déclenche avant),
        # jamais au-dessus de T_stock + 2°C
        self.t_batt = max(-4.0, min(self.t_stock + 2.0, self.t_batt))

        # ventil calculé ici — requis pour le modèle CO2
        ventil = self._ventil(mode)

        # ── Modèle CO2 (source : respiration cellulaire PDT) ──────────────
        # Production CO2 ∝ respiration Q10, ~ 300 ppm/h à 5°C pour 200t en 250m³
        # Valeurs réelles mesurées en stockage PDT : 800-2000 ppm normales
        #
        # CO2_ext ambiant = 420 ppm
        # Production = resp_co2_ref * Q10_factor  [ppm/cycle]
        # Dilution   = volet ouvert (air neuf) ou ventilation forcée
        # Accumulation = local fermé, PAC seule (air recyclé)

        CO2_EXT      = 420.0    # ppm ambiant extérieur
        resp_co2_ref = 1.80     # ppm/cycle à 5°C (500t PDT, local ~600m³)
        Q10_co2      = math.pow(2.0, (self.t_stock - 5.0) / 10.0)
        production   = resp_co2_ref * Q10_co2

        # Dilution selon mode et actionneurs
        if volet:
            # Volet ouvert : mélange rapide avec air ext (free cooling ou séchage)
            dilution = 0.08 * (CO2_EXT - self.co2_ppm)
        elif ventil > 0:
            # Ventilation interne seule (recirculation) : légère dilution
            dilution = 0.02 * (CO2_EXT - self.co2_ppm) * ventil
        else:
            # Local fermé, pas de ventilation : accumulation pure
            dilution = 0.005 * (CO2_EXT - self.co2_ppm)

        self.co2_ppm += production + dilution + random.gauss(0, 3.0)
        self.co2_ppm  = max(400.0, min(8000.0, self.co2_ppm))

        # Compteurs
        if self.pac_on:
            self.cumul_pac_h += dt_h
            self._temps_depuis_arret_pac = 0
        else:
            self._temps_depuis_arret_pac += dt_s / 60.0

        self._last_pac = self.pac_on

        # Alarmes
        alarme = None
        niveau = 0
        if self.t_batt < 0.5:
            alarme = f"ANTIGEL BATTERIE — T_batt={self.t_batt:.1f}°C"
            niveau = 3
        elif self.t_stock < 2:
            alarme = f"GEL PRODUIT — T_stock={self.t_stock:.1f}°C"
            niveau = 3
        elif self.co2_ppm > 5000:
            alarme = f"CO2 CRITIQUE — {self.co2_ppm:.0f} ppm — Purge immédiate"
            niveau = 3
        elif self.co2_ppm > 3500:
            alarme = f"CO2 ALERTE — {self.co2_ppm:.0f} ppm — Aération requise"
            niveau = 2
        elif self.co2_ppm > 2000:
            alarme = f"CO2 ELEVE — {self.co2_ppm:.0f} ppm — Surveillance"
            niveau = 1
        elif self.t_stock > self.csg_t + 3:
            alarme = f"T_HAUTE — T_stock={self.t_stock:.1f}°C vs csg={self.csg_t}°C"
            niveau = 2

        return {
            "t_stock":              round(self.t_stock,  2),
            "hr_stock":             round(self.hr_stock, 2),
            "t_batterie":           round(self.t_batt,   2),
            "co2_ppm":              round(self.co2_ppm,  1),
            "pac_on":               self.pac_on,
            "ventil_on":            ventil > 0,
            "degivrage_on":         "DEGIV" in mode.upper(),
            "registre_ouvert":      volet,
            "vitesse_ventil":       ventil,
            "t_consigne":           self.csg_t,
            "hr_consigne":          self.csg_hr,
            "mode_actif":           mode,
            "mode_manu":            False,
            "alarme_active":        alarme,
            "niveau_alarme":        niveau,
            "duree_fonct_pac_h":    round(self.cumul_pac_h, 2),
            "duree_degivrage_min":  round(self.duree_degivrage_min, 1),
            "pr_phase":             self.pr_phase,
            "pr_duree_h":           0.0,
        }


# ═══════════════════════════════════════════════════════════
#  SIMULATEUR HABITATION PAC SOL/SOL
#  Logique conforme Draw.io page 5
# ═══════════════════════════════════════════════════════════
class SimulateurHabitation:
    def __init__(self, csg_z1=20.0, csg_z2=19.0, csg_ecs=55.0, saison="CHAUD"):
        self.csg_z1   = csg_z1
        self.csg_z2   = csg_z2
        self.csg_ecs  = csg_ecs
        self.saison   = saison
        self.csg_c1   = 26.0
        self.csg_c2   = 26.0

        # Etat interne
        self.t_z1     = 19.5
        self.t_z2     = 18.8
        self.t_ecs    = 52.0
        self.t_dep    = 40.0
        self.t_ret    = 35.0
        self.pac_on   = False
        self.vc1_on   = False
        self.vc2_on   = False
        self.vanne_ecs = False
        self.cumul_pac_h = 0.0
        self._temps_arret = 5.0

    def _loi_eau(self, t_ext):
        """Loi d'eau : T_dep selon T_ext."""
        t_lim, t_base = 18.0, -7.0
        t_dep_max, t_dep_min = 45.0, 30.0
        if t_ext >= t_lim: return t_dep_min
        pente = (t_dep_max - t_dep_min) / (t_base - t_lim)
        return max(t_dep_min, min(t_dep_max, t_dep_min + pente * (t_lim - t_ext)))

    def step(self, meteo, dt_s=30, manu=False, manu_pac=False, manu_vc1=False, manu_vc2=False):
        dt_h = dt_s / 3600.0
        heure = datetime.now().hour

        # ── Mode MANUEL : opérateur prend la main ─────────────────────────
        # En MANU : tout passe en STANDBY sauf ce que l'opérateur active
        # Les actionneurs ne suivent plus la logique AUTO
        if manu:
            self.pac_on    = manu_pac
            self.vc1_on    = manu_vc1
            self.vc2_on    = manu_vc2
            self.vanne_ecs = False
            self.t_dep     = 14.0 if not manu_pac else self._loi_eau(meteo.t_ext)
            mode = "MANU"
            # Physique continue même en MANU
            TAU_ENV = 480.0; TAU_VC = 90.0; dt_min = dt_s / 60.0
            self.t_z1 += (meteo.t_ext - self.t_z1)/TAU_ENV*dt_min + (self.t_dep-self.t_z1)/TAU_VC*dt_min*manu_vc1 + random.gauss(0,.02)
            self.t_z2 += (meteo.t_ext - self.t_z2)/TAU_ENV*dt_min + (self.t_dep-self.t_z2)/TAU_VC*dt_min*manu_vc2 + random.gauss(0,.02)
            self.t_z1 = max(5, min(35, self.t_z1)); self.t_z2 = max(5, min(35, self.t_z2))
            chauffe = 0.5 if (self.vanne_ecs and self.pac_on) else 0
            self.t_ecs += (chauffe - 0.01*(self.t_ecs-20)) * dt_h * 60 + random.gauss(0,.05)
            self.t_ecs = max(15, min(70, self.t_ecs))
            self.t_ret = self.t_dep - 5 + random.gauss(0,.2)
            if self.pac_on: self.cumul_pac_h += dt_h; self._temps_arret = 0
            else: self._temps_arret += dt_s/60
            alarme, niveau = None, 0
            if self.t_ecs > 65: alarme = f"SURCHAUFFE ECS — {self.t_ecs:.1f}°C"; niveau = 3
            elif meteo.t_sol < -3: alarme = f"GEL CAPTEURS SOL — T_sol={meteo.t_sol:.1f}°C"; niveau = 3
            return self._build_return(mode, alarme, niveau)

        # ECS prioritaire (plage 6h-22h)
        ecs_besoin = self.t_ecs < (self.csg_ecs - 3.0) and 6 <= heure < 22
        if ecs_besoin and self._temps_arret >= 3:
            self.pac_on    = True
            self.vanne_ecs = True
            self.vc1_on    = False
            self.vc2_on    = False
            mode = "ECS PRIORITAIRE"
        else:
            self.vanne_ecs = False
            if self.saison == "FROID":
                # ── CHAUFFAGE (saison FROID = hiver) ──────────────────────
                # VC ON si T_zone < csg - 0.5°C (besoin de chaleur)
                # VC OFF si T_zone >= csg + 0.5°C (consigne atteinte)
                self.vc1_on = self.t_z1 < self.csg_z1 - 0.5
                self.vc2_on = self.t_z2 < self.csg_z2 - 0.5
                if self.t_z1 >= self.csg_z1 + 0.5: self.vc1_on = False
                if self.t_z2 >= self.csg_z2 + 0.5: self.vc2_on = False
                # Loi d'eau : T_dep chaude (30-45°C) selon T_ext
                self.t_dep = self._loi_eau(meteo.t_ext)
                need_pac = (self.vc1_on or self.vc2_on)
                if need_pac and self._temps_arret >= 3:
                    self.pac_on = True
                elif not need_pac:
                    self.pac_on = False
                mode = ("CHAUFFAGE Z1+Z2" if (self.vc1_on and self.vc2_on) else
                        "CHAUFFAGE Z1"    if self.vc1_on else
                        "CHAUFFAGE Z2"    if self.vc2_on else "STANDBY")
            else:
                # ── CLIMATISATION (saison CHAUD = ete) ────────────────────
                # VC ON si T_zone > csg_clim + 0.5°C (besoin de froid)
                # VC OFF si T_zone <= csg_clim - 0.5°C (consigne atteinte)
                self.vc1_on = self.t_z1 > self.csg_c1 + 0.5
                self.vc2_on = self.t_z2 > self.csg_c2 + 0.5
                if self.t_z1 <= self.csg_c1 - 0.5: self.vc1_on = False
                if self.t_z2 <= self.csg_c2 - 0.5: self.vc2_on = False
                # Eau froide pour rafraichissement (14°C)
                self.t_dep = 14.0
                need_pac = (self.vc1_on or self.vc2_on)
                if need_pac and self._temps_arret >= 3:
                    self.pac_on = True
                elif not need_pac:
                    self.pac_on = False
                mode = ("CLIM Z1+Z2" if (self.vc1_on and self.vc2_on) else
                        "CLIM Z1"    if self.vc1_on else
                        "CLIM Z2"    if self.vc2_on else "STANDBY")

        # ── Physique zones habitation (modèle RC thermique) ─────────
        # Maison ~150m², bien isolée, PAC 10kW, ventilo-convecteurs 0.5kW/zone
        #
        # Modèle : dT/dt = (gains - pertes) / (masse_air * cp_air)
        # tau_env   = 480 min (8h) : constante de temps déperdition enveloppe
        # tau_vc    = 90 min       : constante de temps apport ventilo-convecteur
        # → dT_env = (T_ext - T_zone) / tau_env * dt_min
        # → dT_vc  = (T_dep - T_zone) / tau_vc  * dt_min  (seulement si VC ON)
        #
        # Sans ces tau, l'apport brut (T_dep-T_zone)*coeff*dt diverge en 3 mois

        TAU_ENV = 480.0   # min — déperdition thermique enveloppe
        TAU_VC  = 90.0    # min — apport ventilo-convecteur
        dt_min  = dt_s / 60.0

        dT_env1 = (meteo.t_ext - self.t_z1) / TAU_ENV * dt_min
        dT_vc1  = (self.t_dep  - self.t_z1) / TAU_VC  * dt_min if self.vc1_on else 0
        self.t_z1 += dT_env1 + dT_vc1 + random.gauss(0, 0.02)
        self.t_z1  = max(5.0, min(35.0, self.t_z1))

        dT_env2 = (meteo.t_ext - self.t_z2) / TAU_ENV * dt_min
        dT_vc2  = (self.t_dep  - self.t_z2) / TAU_VC  * dt_min if self.vc2_on else 0
        self.t_z2 += dT_env2 + dT_vc2 + random.gauss(0, 0.02)
        self.t_z2  = max(5.0, min(35.0, self.t_z2))

        # ECS
        chauffe = 0.5 if (self.vanne_ecs and self.pac_on) else 0
        pertes  = 0.01 * (self.t_ecs - 20)
        self.t_ecs += (chauffe - pertes) * dt_h * 60 + random.gauss(0, 0.05)
        self.t_ecs = max(15, min(70, self.t_ecs))

        # Eau
        if self.pac_on and not self.vanne_ecs:
            self.t_dep += (self.t_dep - self.t_dep) * 0.1 * dt_h * 60
        self.t_ret = self.t_dep - 5 + random.gauss(0, 0.2)

        # Compteurs
        if self.pac_on:
            self.cumul_pac_h += dt_h
            self._temps_arret = 0
        else:
            self._temps_arret += dt_s / 60

        # Alarmes
        alarme, niveau = None, 0
        if self.t_ecs > 65:
            alarme = f"SURCHAUFFE ECS — {self.t_ecs:.1f}°C"
            niveau = 3
        elif meteo.t_sol < -3:
            alarme = f"GEL CAPTEURS SOL — T_sol={meteo.t_sol:.1f}°C"
            niveau = 3

        return self._build_return(mode, alarme, niveau)

    def _build_return(self, mode, alarme, niveau):
        return {
            "t_int_z1":    round(self.t_z1, 2),
            "t_int_z2":    round(self.t_z2, 2),
            "t_ecs":       round(self.t_ecs, 2),
            "t_eau_dep":   round(self.t_dep, 2),
            "t_eau_ret":   round(self.t_ret, 2),
            "pac_on":      self.pac_on,
            "pompe_sol_on":      self.pac_on,
            "pompe_circuit_on":  True,
            "vanne_ecs_on":      self.vanne_ecs,
            "fancoil_z1_on":     self.vc1_on,
            "fancoil_z2_on":     self.vc2_on,
            "csg_z1":      self.csg_z1,
            "csg_z2":      self.csg_z2,
            "csg_ecs":     self.csg_ecs,
            "csg_clim_z1": self.csg_c1,
            "csg_clim_z2": self.csg_c2,
            "mode_actif":  mode,
            "saison":      self.saison,
            "mode_manu":   False,
            "alarme_active":  alarme,
            "niveau_alarme":  niveau,
            "temps_depuis_arret_pac_min": round(self._temps_arret, 1),
            "cumul_pac_h": round(self.cumul_pac_h, 2),
            "cumul_ecs_h": round(self.cumul_pac_h * (1 if self.vanne_ecs else 0.3), 2),
        }


# ═══════════════════════════════════════════════════════════
#  BOUCLE PRINCIPALE
# ═══════════════════════════════════════════════════════════
def main():
    # Activer les couleurs ANSI sur Windows
    import os
    os.system("color")

    p("\n╔══════════════════════════════════════════════════════╗", GREEN)
    p("║        GeoFresh — Simulateur Jumeau Numerique        ║", GREEN)
    p("╚══════════════════════════════════════════════════════╝\n", GREEN)

    # Verifier la cle
    if "VOTRE_ANON_KEY" in SUPABASE_KEY:
        p("  ⚠  Configurez votre SUPABASE_KEY dans ce fichier !", RED)
        p("     Supabase → Settings → API → anon public", YELLOW)
        input("\n  Appuyez sur Entree pour fermer...")
        return

    # Connexion Supabase
    p("  Connexion a Supabase...", CYAN)
    try:
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        p("  Connecte ✓\n", GREEN)
    except Exception as e:
        p(f"  ERREUR connexion : {e}", RED)
        input("  Appuyez sur Entree pour fermer...")
        return

    # Consignes operateur
    p("  ── Consignes Stockage ──────────────────────────────", CYAN)
    try:
        csg_t  = float(input("  T_consigne stockage (°C) [defaut 6.0] : ") or "6.0")
        csg_hr = float(input("  HR_consigne stockage (%)  [defaut 90]  : ") or "90.0")
    except: csg_t, csg_hr = 6.0, 90.0

    p("\n  ── Consignes Habitation ────────────────────────────", CYAN)
    try:
        csg_z1  = float(input("  Consigne Zone 1 (°C) [defaut 20] : ") or "20.0")
        csg_z2  = float(input("  Consigne Zone 2 (°C) [defaut 19] : ") or "19.0")
        csg_ecs = float(input("  Consigne ECS    (°C) [defaut 55] : ") or "55.0")
        saison  = input("  Saison CHAUD/FROID [defaut CHAUD] : ").upper() or "CHAUD"
        if saison not in ("CHAUD","FROID"): saison = "CHAUD"
    except: csg_z1, csg_z2, csg_ecs, saison = 20.0, 19.0, 55.0, "CHAUD"

    # Initialisation
    meteo = Meteo()
    sto   = SimulateurStockage(csg_t=csg_t, csg_hr=csg_hr)
    hab   = SimulateurHabitation(csg_z1=csg_z1, csg_z2=csg_z2, csg_ecs=csg_ecs, saison=saison)

    # ── Restaurer le cumul PAC depuis Supabase (survit aux redémarrages) ──
    try:
        rows = sb.table("consignes").select("cumul_pac_sto_h,cumul_pac_hab_h").eq("id","stockage").execute().data
        if rows and rows[0].get("cumul_pac_sto_h"):
            sto.cumul_pac_h = float(rows[0]["cumul_pac_sto_h"])
            hab.cumul_pac_h = float(rows[0].get("cumul_pac_hab_h") or 0)
            p(f"  Cumul PAC restaure : Stockage={sto.cumul_pac_h:.1f}h | Habitation={hab.cumul_pac_h:.1f}h", CYAN)
    except:
        pass

    p(f"\n  Simulation demarree — cycle toutes les {CYCLE_SECONDES[0]}s", GREEN)
    p("  Ctrl+C pour arreter\n", YELLOW)
    p(f"  {'Cycle':<6} {'Mode Stockage':<28} {'T_stock':>8} {'T_Z1':>6} {'PAC_S':>6} {'PAC_H':>6}", CYAN)
    p("  " + "─"*70, CYAN)

    cycle = 0
    vitesse = 1  # multiplicateur de temps physique
    while True:
        cycle += 1
        try:
            # ── Lire les consignes depuis Supabase ──────────────────
            try:
                csg_rows = sb.table("consignes").select("*").execute().data
                for row in csg_rows:
                    if row['id'] == 'stockage':
                        # Vitesse simulation pilotée depuis le dashboard
                        vitesse = int(row.get('vitesse_sim', 1))
                        vitesse = max(1, int(vitesse))
                        if   vitesse >= 100: CYCLE_SECONDES[0] = 1
                        elif vitesse >= 50:  CYCLE_SECONDES[0] = 2
                        elif vitesse >= 5:   CYCLE_SECONDES[0] = 6
                        else:                CYCLE_SECONDES[0] = 30
                        sto.csg_t    = float(row.get('csg_t',   sto.csg_t))
                        sto.hyst_t   = float(row.get('hyst_t',  sto.hyst_t))
                        sto.csg_hr   = float(row.get('csg_hr',  sto.csg_hr))
                        sto.hyst_hr  = float(row.get('hyst_hr', sto.hyst_hr))
                    if row['id'] == 'habitation':
                        hab.csg_z1    = float(row.get('csg_z1',      hab.csg_z1))
                        hab.csg_z2    = float(row.get('csg_z2',      hab.csg_z2))
                        hab.csg_ecs   = float(row.get('csg_ecs',     hab.csg_ecs))
                        hab.hyst_ecs  = float(row.get('hyst_ecs',    3.0))
                        hab.csg_c1    = float(row.get('csg_clim_z1', hab.csg_c1))
                        hab.csg_c2    = float(row.get('csg_clim_z2', hab.csg_c2))
                        s = row.get('saison', hab.saison)
                        if s in ('CHAUD','FROID'): hab.saison = s
            except Exception as e_csg:
                pass  # En cas d'erreur, on garde les consignes actuelles

            # Avancer la meteo
            meteo.step()
            ext = meteo.to_dict()

            # Avancer les simulateurs
            data_sto = sto.step(meteo, dt_s=CYCLE_SECONDES[0] * vitesse)
            data_hab = hab.step(meteo, dt_s=CYCLE_SECONDES[0] * vitesse)

            # Push Supabase — conditions externes
            ext_res = sb.table("conditions_externes").insert(ext).execute()
            ext_id  = ext_res.data[0]["id"] if ext_res.data else None

            # Push stockage
            data_sto["ext_id"] = ext_id
            sb.table("stockage_readings").insert(data_sto).execute()

            # Push habitation
            data_hab["ext_id"] = ext_id
            sb.table("habitation_readings").insert(data_hab).execute()

            # ── Persistance cumul PAC dans Supabase (survit aux redémarrages) ──
            if cycle % 10 == 0:  # toutes les ~5 min
                try:
                    sb.table("consignes").update({
                        "cumul_pac_sto_h": round(sto.cumul_pac_h, 2),
                        "cumul_pac_hab_h": round(hab.cumul_pac_h, 2),
                        "updated_at": datetime.now().isoformat()
                    }).eq("id", "stockage").execute()
                except:
                    pass  # non bloquant

            # Affichage console
            mode_s = data_sto["mode_actif"][:26]
            alarm  = " ⚠" if data_sto["alarme_active"] else ""
            alarm_h= " ⚠" if data_hab["alarme_active"] else ""
            p(
                f"  {cycle:<6} {mode_s:<28} "
                f"{data_sto['t_stock']:>6.1f}°C "
                f"{data_hab['t_int_z1']:>5.1f}°C "
                f"{'ON ' if data_sto['pac_on'] else 'OFF':>6}"
                f"{'ON ' if data_hab['pac_on'] else 'OFF':>6}"
                f"{alarm}{alarm_h}",
                GREEN if not data_sto["alarme_active"] else YELLOW
            )

            # Alarmes en rouge
            if data_sto["alarme_active"]:
                p(f"  ⚠  STOCKAGE  : {data_sto['alarme_active']}", RED)
            if data_hab["alarme_active"]:
                p(f"  ⚠  HABITATION: {data_hab['alarme_active']}", RED)

            time.sleep(CYCLE_SECONDES[0])

        except KeyboardInterrupt:
            p("\n\n  Simulation arretee.", YELLOW)
            break
        except Exception as e:
            p(f"\n  ERREUR cycle {cycle}: {e}", RED)
            p("  Nouvelle tentative dans 10s...", YELLOW)
            time.sleep(10)


if __name__ == "__main__":
    main()
    input("\n  Appuyez sur Entree pour fermer...")
