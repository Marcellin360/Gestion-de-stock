# 9. Toro-lalana isaky ny rôle — ny asa azonao atao sy ny fomba fanaovana azy
### (kinova 2.7 : rôle 3, magasin 2 — DÉPÔT sy PHARMACIE)

Ity rakitra ity dia mizara **telo** : ny **Administrateur**, ny **Pharmacien / responsable**,
ary ny **Gestionnaire du dépôt**. Isaky ny rôle dia aseho : ny rohy hita ao amin’ny menu,
ny asa rehetra azo atao (miaraka amin’ny dingana), ary ny tsy azo atao (miaraka amin’iza no manao azy).

> ⚠️ **Vaovao 2.7** : ny rôle **« Vendeur habilité »** sy **« Gestionnaire de stock »** dia
> **nesorina**. Ny **dépôt dia mpampiasa hafa mihitsy** (rôle `DEPOT`) : izy no mitantana
> ny réserve. Ny **commande** sy ny **retour fournisseur** dia **tsy misy intsony**.
> Ny fanafody rehetra dia **réception → dépôt**, avy eo **transfert → pharmacie** araka ny
> ilain’ny comptoir ; ny **vente** dia ao amin’ny pharmacie ihany.

> Tsindrimandry : ny **fahefana** dia voasivana **avy amin’ny serveur** — na dia te-hanao zavatra
> tsy anananao aza ianao (na amin’ny alalan’ny fitaovana fanadihadiana), dia **lavina** ny fangatahana
> (*« Droit insuffisant pour cette action. »*). Ny tsy hita ao amin’ny menu dia tsy midika hoe « nafenina » :
> tena tsy omena anao mihitsy izy.

## 0. Fizarana iombonana (ny rôle rehetra)

| Asa | Fomba |
|---|---|
| **Fidirana** | Sokafy ny adiresy (`http://localhost:5173` amin’ny fanandramana) → identifiant + mot de passe → *Ouvrir la session* |
| **Hanovana ny mot de passenao** | Ikona 🔑 (ambony havanana) → `Mot de passe actuel` + `Nouveau mot de passe` (12 litera farafahakeliny) → `Enregistrer`. ⚠️ Tapaka ny session rehetra : midira indray |
| **Hijery ny alerts** | Ikona 🔔 → miverina amin’ny **Tableau de bord** |
| **Tableau de bord** | **Carte roa** : *Dépôt (réserve)* sy *Pharmacie (comptoir)* — valeur du stock, isan’ny médicaments, *En rupture* (dépôt) na *Ventes du jour* (pharmacie) ; avy eo alerts, prochaines péremptions, ary **Derniers transferts dépôt → pharmacie** |
| **Magasin aseho** | Eo ambony havanana : badge **Dépôt** na **Pharmacie**. Ny données (lots, alertes, statistiques) dia voafetra amin’ny magasin’ny rôle — afa-tsy ny admin, mahita ny roa |
| **Hiala** | Ikona 🡒 (*Se déconnecter*) |
| **Finday / tablette** | Menu ambany : *Tableau de bord, Historique de vente, Lots & stock, Transferts, Mouvements* (araka ny fahefana) + bokotra fanokafana ny menu feno |

---

# 1. ADMINISTRATEUR — ilay mitantana ny rafitra

**Ny rohy** : Tableau de bord · **Historique de vente** · Documents · Stock
*(onglets : Lots & stock / Mouvements)* · **Réceptions** · **Transferts dépôt → pharmacie** ·
Inventaires · Pertes et dons · Catalogue *(onglets : Médicaments / Catégories / Fournisseurs)* ·
Rapports · Journal d’audit · **Utilisateurs** · **Paramètres**.

*(Tsy misy `Commandes` na `Retours fournisseur` intsony : nesorina tamin’ny code mihitsy izy ireo.)*

## 1.1 Mise en service (atao indray mandeha)

**A. Mamorona ny compte-n’ny mpiasa**
1. `Utilisateurs` → **`Nouvel utilisateur`**
2. `Nom et prénom`, `Identifiant de connexion` (ohatra `hery`, `naina`),
   `Rôle` — **iray amin’ny telo** : *Administrateur*, *Pharmacien / responsable*, *Gestionnaire du dépôt* —
   `Téléphone`, `Mot de passe` (**12 litera farafahakeliny**), `Compte actif`, `Note`
3. `Enregistrer` → omeo ny identifiant sy mot de passe ilay olona
4. Avereno amin’ny mpiasa rehetra — **iray isaky ny olona**, tsy misy iombonana

> Ny kaonty **DEPOT** dia ho an’ilay mitantana ny réserve : izy ihany no mandray entana
> sy mamindra entana any amin’ny comptoir. Ny kaonty **PHARMACIST** dia ho an’ny comptoir.

**A bis. Ny automatisme efa napetraka (tsy mila asa fanampiny)**
- Réception : `Durée de conservation` (6/12/18/24/36 mois) no mamoaka ny **date de péremption** ;
  ny `Frais de livraison` dia zaraina amin’ny units rehetra → **coût de revient** marina.
- Transfert : ny quantité sy ny lot no safidiana ; ny **coût** dia arahin’ny lot (tsy miova ny CMP
  amin’ny transfert : entana iray ihany no mifindra).
- Marge : taux amin’ny boutons (10 % … 30 %) + motif amin’ny lisitra → prix de vente kajy.
- Vente : ny **lot sy ny prix dia avy amin’ny serveur (FEFO)** ; ny client amin’ny lisitra.
- Fiche de stock : ny **stock initial dia miverina ho azy** avy amin’ny stock final taloha.

**B. Mametraka ny mombamomba ny officine**
`Paramètres` → `Nom de la pharmacie`, `Adresse`, `Téléphone`, `Responsable`, `Devise` → `Enregistrer`
(io anarana io no miposaka amin’ny tapakila sy ny taratasy rehetra).

**C. Mametraka ny fitsipika ara-bola sy ny alerts**

| Saha (ao amin’ny `Paramètres`) | Sanda atolotra | Fanazavana |
|---|---|---|
| `Méthode de valorisation du stock` | `Coût de revient réel du lot` na `Coût moyen pondéré (CMP)` | ⚠️ **Mihidy** raha efa nisy mouvement — safidio aloha |
| `Mode de calcul de la marge` | `Marge sur coût d’achat` (matetika) na `Marge sur prix de vente` | ny prix de vente dia kajy foana (RG05) |
| `Marge minimum / maximum` | 10 % / 30 % | Fiarovana ny vidiny (RG22-24) |
| `Jours d’alerte avant péremption` | 90 | Fotoana fampitandremana ho an’ny magasin roa |
| `Devise` | `Ar` | Ariary |

**D. Andramana voalohany** : `Réceptions` (kaonty dépôt) → `Transferts` → `Historique de vente`
(kaonty pharmacien) → `Rapports` → `Fiche de stock — PHARMACIE` sy `— DÉPÔT`.

## 1.2 Ny andraikiny manokana (admin)

| Asa | Fomba |
|---|---|
| **Fanaraha-maso ny vidiny sy ny marge** | `Catalogue → Médicaments` → ikona **%** → `Taux` + `Motif` (voatery) → `Appliquer` ; `Détail` → `Historique des prix` |
| **Fanaraha-maso ny stock (magasin roa)** | `Stock → Lots & stock` → `Magasin` : *Dépôt (réserve)* / *Pharmacie (comptoir)* / ny roa ; filtres statut sy péremption |
| **Fanamarinana ny stock** | `Réceptions` (ny an’ny dépôt), `Transferts` (ny fifindran’entana), `Ventes` (ny an’ny comptoir) |
| **Fanafoanana document diso** | `Documents` → `Détail` → `Annuler le document` + motif |
| **Hanafoana transfert diso** | `Transferts` → `Détail` → `Annuler` + motif → ny stock dia miverina ao amin’ny dépôt |
| **Hijery iza no nanao inona** | `Journal d’audit` (+ `Rapports → Contrôle d’intégrité`) |
| **Inventaire** | `Inventaires` → `Ouvrir un inventaire` → `Magasin à compter` → `Compter`/`Tout conforme` → `Justification` amin’ny écart → `Valider` |
| **Fitantanana ny comptes sy ny paramètres** | `Utilisateurs`, `Paramètres` (admin ihany) |
| **Sauvegarde** | `scripts\backup-database.sh` (na `pg_dump`) — tsy ao anaty interface |

## 1.3 Ny tabilao fizarana (RG18) — admin

| Zavatra | Admin | Pharmacien | Dépôt |
|---|---|---|---|
| Réception (entrée) | ✔ | ✔ | **✔** |
| Transfert dépôt → pharmacie | ✔ | ✔ | **✔** |
| Vente | ✔ | **✔** | ✘ |
| Perte / don | ✔ | ✔ (comptoir) | ✔ (réserve) |
| Inventaire | ✔ | ✔ | ✔ |
| Prix / marge | ✔ | ✔ | ✘ (tsy aseho) |
| Comptes · Paramètres · Sauvegarde | **✔** | ✘ | ✘ |

---

# 2. PHARMACIEN / RESPONSABLE — ilay mitantana ny comptoir

**Ny rohy** : Tableau de bord · **Historique de vente** · Documents · Stock *(Lots & stock / Mouvements)* ·
Réceptions · Transferts dépôt → pharmacie · Inventaires · Pertes et dons · Catalogue · Rapports ·
Journal d’audit.
*(Afoana ny `Utilisateurs` sy ny `Paramètres`.)*

## 2.1 Ny asa rehetra azony atao

| Asa | Fomba |
|---|---|
| **Mivarotra** | `Historique de vente` → `Rechercher un médicament` (≥ 2 litera : anarana, code, principe actif, code-barres) → tsindrio → `Quantité` (− / +) → client (facultatif) → **`Recalculer le total`** → **`Valider la vente`** |
| **Fanontana ny tapakila** | Ao amin’ny efijery vente : `Imprimer le ticket` |
| **Fijerena ny historiques de vente** | `Historique de vente` → lisitry ny vente rehetra (référence, client, isa, total, marge, état) + filtres (`Recherche`, `État`, `À partir du`) |
| **Ny vente diso** | `Documents` → `Détail` → `Annuler` + motif → miverina ao amin’ny lot ny stock, voatahiry ny trace |
| **Fandraisana entana** | `Réceptions → Nouvelle réception` (miditra **ao amin’ny dépôt** foana, na iza na iza no manao) |
| **Fandefasana entana any amin’ny comptoir** | `Transferts dépôt → pharmacie → Nouveau transfert` → motif + lot (avy amin’ny dépôt) + quantité |
| **Fampodiana entana be loatra any amin’ny dépôt** | `Nouveau transfert` → motif `Retour du surplus au dépôt` (ny dépôt no tanàna farany) |
| **Pertes, dons, entana simba** | `Pertes et dons` → `Magasin concerné` (*Pharmacie* na *Dépôt*) + `Motif` + `Remarque justificative` (≥ 3 litera) → `Enregistrer` |
| **Fikarohana sy fanaraha-maso ny lot** | `Stock → Lots & stock` → `Magasin = Pharmacie (comptoir)` ; ny tsanganana `Coût retenu` sy ny `Détail` (mouvements) dia hita aminao |
| **Fanakanana lot (quarantaine)** | `Lots & stock` → ikona 🛡 → `Justification` → `Confirmer` (na `Remettre en vente`) |
| **Inventaire ny comptoir** | `Inventaires` → `Ouvrir un inventaire` → `Magasin à compter : Pharmacie` → `Compter` → justification amin’ny écart → `Valider` |
| **Fanovana ny marge** | `Catalogue → Médicaments` → **%** → `Taux` (10–30 %) + `Motif` |
| **Rapports** | `Rapports` → `Fiche de stock — PHARMACIE`, `Fiche de stock — DÉPÔT`, `Transferts dépôt → pharmacie`, `Ventes et marges (pharmacie)`, `Achats et réceptions (dépôt)`, `Pertes et dons`, `Lots à surveiller`, `Inventaires et écarts`, `Historique des prix`, `Stock` → `Export CSV` / `Imprimer` |
| **Fanaraha-maso ny hetsika** | `Mouvements` → filtres (`Du…au…`, `Produit`, `Magasin`, `Motif`) |
| **Iza no nanao inona** | `Journal d’audit` (+ `Rapports → Contrôle d’intégrité`) |

**Ny fomba tokony hatao amin’ny vente iray (tsara indrindra) :**
1. Karohy ny fanafody → tsindrio (miditra ao amin’ny panier).
2. Amboary ny quantité (raha misy fanafody faharoa dia karohy indray).
3. **`Recalculer le total`** — eto no misafidy ny lot (FEFO : izay akaiky indrindra ny péremption).
4. Jereo ny `Lot retenu` sy ny `Expiration` aseho.
5. Ampidiro ny anaran’ny client raha misy (ohatra *Client de passage*).
6. `Valider la vente` → miseho `Vente VTE-AAAA-NNNNNN enregistrée`.
7. `Imprimer le ticket` → omeo ny mpanjifa.

## 2.2 Ny tsy azon’ny pharmacien (sy iza no manao)

| Tsy azony | Antony | Iza no manao |
|---|---|---|
| **Fanokafana/ovana ny `Paramètres`** | fahefana `settings` tsy ananana | **Administrateur** |
| **Fitantanana ny `Utilisateurs`** | fahefana `users` tsy ananana | **Administrateur** |
| **Famafa document** | tsy misy mamafa mihitsy (RG19) | atao *annulation* ihany, misy motif |

**Azonao** kosa ny zavatra rehetra momba ny catalogue (médicaments, catégories, fournisseurs),
ny prix sy ny marge, ny annulations, ny transferts, ny inventaires, ny rapports (an’ny magasin roa
ny vakiana), ny journal d’audit ary ny `Contrôle d’intégrité`.

---

# 3. GESTIONNAIRE DU DÉPÔT — ilay mitantana ny réserve

**Ny rohy** : Tableau de bord · Documents · Stock *(Lots & stock / Mouvements)* · **Réceptions (dépôt)** ·
**Transferts dépôt → pharmacie** · Inventaires · Pertes et dons · Catalogue · Rapports.
*(Tsy hita mihitsy ny `Historique de vente`, ny `Utilisateurs`, ny `Paramètres`, ny `Journal d’audit`.)*

> Ny **Tableau de bord** dia ny an’ny dépôt ihany : *Valeur du stock*, *Médicaments*, **En rupture**,
> ary `Ventes du jour = 0,00 Ar` (ny dépôt tsy mivarotra). Ny lots rehetra aseho dia **lot du dépôt**.

## 3.1 Ny asa rehetra azony atao

| Asa | Fomba |
|---|---|
| **Fandraisana entana (réception)** | `Réceptions (dépôt)` → `Nouvelle réception` → `Fournisseur`, `Numéro de facture / bordereau`, `Frais de livraison` → andalana : `Médicament`, `N° de lot`, `Quantité`, `Prix d’achat unitaire`, `Date de réception`, `Durée de conservation` → `Valider la réception` → `Imprimer le bon` |
| **Fandefasana any amin’ny pharmacie** | `Transferts dépôt → pharmacie` → `Nouveau transfert` → `Motif du transfert` (Réassort du comptoir · Produit très demandé · Retour du surplus au dépôt · Contrôle qualité · Autre) + `Remarque` → andalana : lot **du dépôt** + quantité → `Valider le transfert` → `Bordereau` azo pirinty |
| **Fanafoanana transfert diso** | `Transferts` → `Détail` → `Annuler` + `Motif` (≥ 3 litera) → ny quantité dia **miverina ao amin’ny dépôt** |
| **Lots be loatra any amin’ny comptoir** | Averin’ny pharmacien ao amin’ny dépôt amin’ny transfert misy motif `Retour du surplus au dépôt` |
| **Pertes, dons, entana simba ao amin’ny réserve** | `Pertes et dons` → `Magasin concerné : Dépôt (réserve)` → `Motif` (Casse, Détérioration, Expiration…) + `Remarque justificative` (≥ 3 litera) → `Enregistrer` |
| **Fikarohana sy fanaraha-maso ny lot** | `Stock → Lots & stock` → `Magasin = Dépôt (réserve)` ; hita ny `Coût retenu`, ny `CMP`, ny `Expiration`, ny `Statut` |
| **Fanakanana lot** | `Lots & stock` → ikona 🛡 → `Justification` → `Confirmer` (na `Remettre en vente`) |
| **Inventaire ny réserve** | `Inventaires` → `Ouvrir un inventaire` → `Magasin à compter : Dépôt (réserve)` → `Compter` (na `Tout conforme`) → `Justification` amin’ny écart → `Valider` |
| **Fanaraha-maso ny hetsika** | `Mouvements` → filtres (`Du…au…`, `Produit`, `Magasin`, `Motif`) — hita ny `RECEIPT_IN`, `TRANSFER_OUT`, `LOSS_OUT`, `ADJUSTMENT` |
| **Rapports** | `Rapports` → `Fiche de stock — DÉPÔT`, `Achats et réceptions (dépôt)`, `Transferts dépôt → pharmacie`, `Stock`, `Mouvements`, `Lots à surveiller`, `Inventaires et écarts` → `Export CSV` / `Imprimer` |
| **Mamorona fanafody vaovao ao amin’ny catalogue** | `Catalogue → Médicaments → Nouveau médicament` (samy manana ny fahefana `reference` ny rôle telo, mba hahafahana manoratra entana tonga tsy mbola ao amin’ny lisitra) |

## 3.2 Ny tsy azon’ny dépôt (sy iza no manao)

| Tsy azony | Antony | Iza no manao |
|---|---|---|
| **Mivarotra** | tsy manana ny fahefana `sale` — ny écran `Historique de vente` dia **tsy hita**, ary ny `POST /api/sales` dia **lavina (403)** | Pharmacien, Administrateur |
| **Mijery ny ventes sy ny marge** | ny vente dia tsy alefa mihitsy amin’ny kaonty dépôt (`salesToday = 0,00 Ar`) | Pharmacien, Administrateur |
| **Manova ny prix de vente** | tsy manana `prices` — ny tsanganana vidiny dia tsy miseho | Pharmacien, Administrateur |
| **Journal d’audit** | tsy manana `audit` | Pharmacien, Administrateur |
| **Fitantanana comptes sy Paramètres** | tsy manana `users` / `settings` | Administrateur |
| **`Contrôle d’intégrité`** | mila `audit` (noho izany **tsy hita** ilay bokotra) | Pharmacien, Administrateur |

> Fanamarihana : ny **coût d’achat** (ilaina amin’ny réception sy ny fanombanana ny entana)
> dia hita aminao, ary ny `Coût retenu` amin’ny lot sy ny `CMP` amin’ny Médicaments.
> Ny **vidin’ny varotra** ihany no tsy aseho anao.

---

# 4. Tabilao fampifanarahana (recap)

| Asa | Dépôt | Pharmacien | Admin |
|---|---|---|---|
| Réception (entrée, dépôt) | ✔ | ✔ | ✔ |
| Transfert dépôt → pharmacie | ✔ | ✔ | ✔ |
| Annulation transfert | ✔ | ✔ | ✔ |
| Vente + ticket | — | ✔ | ✔ |
| Historique de vente | — | ✔ | ✔ |
| Perte / don (magasin safidiana) | ✔ (dépôt) | ✔ (comptoir) | ✔ |
| Inventaire | ✔ (dépôt) | ✔ (comptoir) | ✔ roa |
| Lots : blocage quarantaine | ✔ | ✔ | ✔ |
| Catalogue (médicaments, catégories, fournisseurs) | ✔ | ✔ | ✔ |
| Taux de marge + historique des prix | — | ✔ | ✔ |
| Annulation document | ✔ (transfert) | ✔ | ✔ |
| Rapports + export CSV | ✔ (an’ny dépôt) | ✔ | ✔ |
| Contrôle d’intégrité | — | ✔ | ✔ |
| Journal d’audit | — | ✔ | ✔ |
| Comptes utilisateurs | — | — | ✔ |
| Paramètres de l’officine | — | — | ✔ |
| Sauvegarde / mise en service | — | — | ✔ |

---

## 5. Fanontaniana matetika isaky ny rôle

| Fanontaniana | Valiny |
|---|---|
| **Dépôt** : « Tsy hitako ny varotra ? » | Tsy aseho anao mihitsy ny vente (fahefana `sale` tsy ananana) — ny asanao dia ny réserve |
| **Dépôt** : « Nahoana no tsy afaka mivarotra aho na dia misy stock ? » | Ny stock dia tsy amidy avy amin’ny dépôt : ny pharmacie no mivarotra. Manaova **transfert** aloha |
| **Dépôt** : « Misy fanafody vaovao tsy ao amin’ny catalogue ? » | Afaka mamorona azy ianao ao amin’ny `Catalogue → Médicaments` |
| **Pharmacien** : « Tsy ampy ny stock ao amin’ny comptoir ? » | Manaova `Transferts dépôt → pharmacie` : ny stock du dépôt dia tsy azo amidy mivantana |
| **Pharmacien** : « Be loatra ny stock ao amin’ny comptoir ? » | `Transfert` misy motif *Retour du surplus au dépôt* (indrindra raha akaiky ny péremption) |
| **Pharmacien** : « Tsy hitako ny `Utilisateurs` ? » | Fahefana admin ihany izany |
| **Rehetra** : « Nahoana no tsy afaka manova quantité efa voarakitra ? » | Ny rejistra dia tsy azo ovaina (RG19/RG20). Ny fanitsiana dia hetsika vaovao : `Annulation`, `Perte`, na `Inventaire` misy fanamarinana |
| **Rehetra** : « Diso aho nanao vente, ahoana ? » | Lazaovy ny pharmacien na admin : `Documents` → `Annuler le document` + motif → miverina amin’ny stock ny entana |
| **Rehetra** : « Nahoana ny stock initial no tsy fenoiko ? » | Ny rindranasa no manao azy : ny **stock final** amin’ny période teo aloha no **stock initial** amin’ny manaraka (jereo `Rapports → Fiche de stock`) |

---

## Fanazavana fohy (résumé)

- **Gestionnaire du dépôt (`DEPOT`)** : mandray entana (réception), mamindra entana any amin’ny
  pharmacie (transfert), pertes sy inventaire ao amin’ny réserve, rapports an’ny dépôt.
  Tsy mivarotra, tsy mahita vidin’ny varotra.
- **Pharmacien (`PHARMACIST`)** : mivarotra, mitantana ny stock du comptoir (mila inona dia
  mangataka transfert), pertes sy inventaire ao amin’ny pharmacie, vidiny sy marge, rapports roa,
  journal d’audit. Tsy mikitika ny comptes sy ny paramètres.
- **Administrateur (`ADMIN`)** : ny zavatra rehetra — comptes, paramètres, magasin roa —
  ary izy ihany no manao ny sauvegarde.
- **Lalana fototra** : `Réception → Dépôt → Transfert → Pharmacie → Vente`.
