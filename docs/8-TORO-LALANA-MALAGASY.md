# 8. Toro-lalana feno — ny zavatra rehetra azo atao ao amin’ny PharmaStock

> ⚠️ **VAOVAO 2.7 — vakio aloha ity.** Ny rindranasa dia miasa amin’ny **magasin roa** :
> ny **DÉPÔT (réserve)** sy ny **PHARMACIE (comptoir)**. Ny fanafody rehetra tonga dia
> **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** araka ny ilain’ny comptoir ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : ADMIN, PHARMACIST, DEPOT
> (ny « Vendeur » sy « Gestionnaire de stock » dia nesorina ; ny **dépôt dia mpampiasa hafa mihitsy**).
> **Tsy misy commande** ary **tsy misy retour fournisseur** intsony.
> Ny boky feno vaovao : **`docs/14-FAMPIASANA-TENA-IZY.md`** sy **`docs/15-GUIDE-FENO-ECRAN-ISAKY-NY-EFIJERY.md`**.



Fanazavana amin’ny teny malagasy, **efijery isaky ny efijery**, ny zavatra rehetra azo atao
rehefa tafiditra ianao. Ny anaran’ny bokotra sy ny saha dia aseho amin’ny teny frantsay
(fa izany no hita ao amin’ny rindranasa) ary hazavaina amin’ny teny malagasy.

> **Fanaovana démonstration ?** Jereo `docs/13-FANAOVANA-DEMONSTRATION.md` : `npm run demo:scenario`
> no mamorona « andro iray officine » feno (commande, réception, ventes, perte, retour) hiomana amin’ny démo.
>
> **Fametrahana (installation) ?** Ny dingana rehetra — ZIP, Node.js, PostgreSQL, `npm run setup`
> (izay mamorona ny base **`pharmacie_stock`** sy ny `backend\.env` ho azy), `db:migrate`,
> `admin:create`, `npm run dev` — dia voasoratra ao amin’ny **`docs/12-FAMPIANARANA-INSTALLATION.md`**.

---

## 0. Alohan’ny hidirana

| Zavatra | Antony |
|---|---|
| Adiresy | `http://localhost:5173` (fandalinana) na `http://<IP-n’ny PC>:3001` (officine, rehefa vita ny `npm run build`) |
| Identifiant + mot de passe | Omen’ny administrateur anao. **Tsy misy compte iombonana** : iray isaky ny olona |
| Faharetana | **8 ora** ny session, avy eo mangataka ny mot de passe indray |
| Fandrarana | Rehefa **diso 20 heny ao anatin’ny 15 minitra** ny fidirana dia mihidy vonjimaika : *« Trop de tentatives de connexion. Réessayer dans 15 minutes. »* |
| Fiarovana | Ny compte **désactivé** dia tsy afaka miditra mihitsy |

**Hanovana ny mot de passenao** : tsindrio ny ikona 🔑 eo amin’ny zoro ambony havanana →
*Changer mon mot de passe* → `Mot de passe actuel` + `Nouveau mot de passe` (**12 litera farafahakeliny**,
tsy maintsy hafa amin’ilay taloha). Rehefa vita dia **voafafa ny session rehetra** — izany hoe averinao
miditra amin’ny mot de passe vaovao (fiarovana raha nisy olon-kafa nahita ny efijery).

**Hiala** : tsindrio ny ikona varavarana (🡒 *Se déconnecter*).

**« Hors ligne »** : raha tapaka ny fifandraisana amin’ny serveur dia miseho ny marika *Hors ligne* —
tsy azo atao ny manoratra, ary mety ho lany andro ny angona aseho. Andrasana ny fifandraisana hiverina.

---

## 1. Ny endrika ankapoben’ny efijery

- **Menu havia** : fizarana **6** (Quotidien, Stock, Achats, Sorties, Catalogue, Pilotage).
  Ny tsy azonao atao dia **tsindriana mihitsy** : tsy miseho ny rohy (fahefana RG18).
- **Onglets ao anatin’ny efijery iray** : *Stock* dia mirakitra **Lots & stock** sy **Mouvements** ;
  *Catalogue* dia mirakitra **Médicaments**, **Catégories** sy **Fournisseurs**. Kely ny rohy,
  fa tsy latsaka ny asa — tsindriana fotsiny ny onglet eo ambony.
- **Tsy misoratra izay azo alaina** : médicament, fournisseur, commande, lot, taux de marge,
  durée de conservation, motif — samy safidiana amin’ny lisitra. Ny **isa sy ny daty** ihany no soratana
  (ary ny daty aza dia atolotra ho azy : *Aujourd’hui*, *Dans 3 jours*…).
- **Barre ambony** : ♪ ny **lakolosy** (mankany amin’ny tabilao de bord sy ny alerts), 🔑 (mot de passe),
  🡒 (déconnexion). Eo koa ny anaranao sy ny andraikitrao.
- **Finday / tablette** : ny menu dia miforona eo ambany — 5 ihany :
  *Tableau de bord, Ventes, Lots & stock, Inventaires, Mouvements* + bokotra fanokafana ny menu feno.
- **Fampahafantarana (toasts)** : maitso = vita soa aman-tsara ; amber = fampitandremana ;
  mena = fahadisoana (vakio ny soratra, izy no milaza izay tsy mety).

### Iza no mahazo an’inona

| Écran | Dépôt (`naina`) | Pharmacien (`hery`) | Admin |
|---|---|---|---|
| Tableau de bord (carte Dépôt / Pharmacie) | ✔ (an’ny dépôt) | ✔ | ✔ roa |
| **Historique de vente** | ✖ | ✔ | ✔ |
| Documents | ✔ | ✔ | ✔ |
| Lots & stock (`Magasin` : Dépôt / Pharmacie / roa) | ✔ (Dépôt) | ✔ (Pharmacie) | ✔ roa |
| Mouvements (rejista feno) | ✔ | ✔ | ✔ |
| **Réceptions (dépôt)** | ✔ | ✔ | ✔ |
| **Transferts dépôt → pharmacie** | ✔ | ✔ | ✔ |
| Inventaires (magasin safidiana) | ✔ (dépôt) | ✔ (comptoir) | ✔ roa |
| Pertes et dons (magasin safidiana) | ✔ (dépôt) | ✔ (comptoir) | ✔ |
| Catalogue (Médicaments, Catégories, Fournisseurs) | ✔ | ✔ | ✔ |
| Rapports | ✔ (an’ny dépôt) | ✔ | ✔ |
| Journal d’audit | ✖ | ✔ | ✔ |
| Utilisateurs / Paramètres | ✖ | ✖ | ✔ |

> **Tsy misy** ny rohy `Commandes` sy `Retours fournisseur` : nesorina tamin’ny code mihitsy.

---

## 2. Fizarana « Quotidien »

### 2.1 Tableau de bord (ecran voalohany)

- **Fitahiana** : *« Bonjour … »* + ny daty androany.
- **Bokotra haingana** (miankina amin’ny fahefana) : *Nouvelle vente* (pharmacie),
  *Nouvelle réception* (dépôt), *Transfert vers la pharmacie*, *Inventaire*.
- **Carte ROA** : **Dépôt (réserve)** → `Valeur du stock`, `Médicaments`, `En rupture` ;
  **Pharmacie (comptoir)** → `Valeur du stock`, `Médicaments`, `Ventes du jour` (+ `Marge du jour`
  raha manana fahefana amin’ny prix ianao). Ny carte du dépôt dia mampiseho `Ventes du jour = 0,00 Ar`
  satria **ny dépôt tsy mivarotra**.
- **Alertes de stock** : lisitra misy loko — **mena** = tsy maintsy jerena anio (rupture, lot expiré, lot bloqué…) ;
  **amber** = hampitandremana (stock faible, expiration proche, surstock). Ny bokotra **Voir** dia
  mitondra any amin’ny lisitra mifanaraka.
- **Prochaines péremptions** : lot 6 akaiky indrindra ny daty.
- **Derniers transferts dépôt → pharmacie** : *Référence, Motif, Date, Valeur* (6 farany).
- Raha tsy misy olana : *« Aucune alerte bloquante : le stock est cohérent. »*

### 2.2 Historique de vente (vente au comptoir) — dingana 8

> Io écran io dia **an’ny pharmacie ihany** : ny kaonty `DEPOT` dia tsy mahita azy mihitsy
> (ary ny `POST /api/sales` avy amin’ny kaonty dépôt dia **lavina : 403**).

1. **Historique de vente** ao amin’ny menu.
2. `Rechercher un médicament` : manoratra **litera 2 farafahakeliny** — anarana, code, principe actif
   na code-barres. Miseho ny lisitra misy ny *stock vendable* (lot tsy lany daty sy tsy bloqué).
3. Tsindrio ny fanafody : **miditra ao amin’ny panier** izy.
4. `Quantité` : ampiova amin’ny **−** sy **+** (na soraty mivantana ny isa).
   Hamafao amin’ny fako raha diso.
5. *(Tsy voatery)* `Nom du client` (ohatra *Client de passage*, na anaran’ny marary) sy
   `Remarque` (ordonnance, fanazavana…).
6. Tsindrio **`Recalculer le total`** : eto ny serveur no misafidy ny lot (FEFO : ny akaiky indrindra
   ny daty no aloha) ary mampiseho : `Prix unitaire`, `Total ligne`, `Lot retenu`, `Expiration`,
   ary ho an’ny profil manana fahefana : `Coût retenu` sy `Marge brute`.
   ⚠️ Raha novainao ny panier dia **averinao tsindriana** ity bokotra ity aloha.
7. Tsindrio **`Valider la vente`** → miseho ny hafatra *« Vente VTE-AAAA-NNNNNN enregistrée »*.
   Eto **ny stock du comptoir (PHARMACIE)** ihany no mihena, ny marge kajy, ary ny mouvement
   no voarakitra. **Tsy mihetsika mihitsy ny stock du dépôt** (izy no tsy azo amidy mivantana).
8. **`Imprimer le ticket`** : misokatra ny taratasy fanontana (afaka pirinty na atao PDF).
   Avy eo **`Fermer`**.

> Fiarovana : tsy azo amidy ny lot **lany daty** na **bloqué**. Raha tsy ampy ny stock vendable dia
> miseho : *« Stock vendable insuffisant pour … : seuls les lots non expirés et non bloqués sont proposés. »*
> Raha sendra misy olana amin’ny fifandraisana ka averinao tsindriana ny *Valider*, dia **tsindroa
> faharoa ihany no atao** : ny serveur dia mahafantatra fa efa voarakitra ny vente (request key)
> ka tsy hamorona vente roa.

### 2.3 Documents (rejista feno)

- **Filtres** : `Type` (Tous, Vente, Réception, **Transfert**, Perte, Ajustement d’inventaire),
  `État` (Validé, En cours, Annulé, Abandonné), `À partir du` (daty), `Recherche`
  (référence, client, motif, n° facture).
- **Tsanganana** : `Référence`, `Date`, `Type`, `Statut`, `Montant`, ary `Détail`.
- **`Détail`** : misokatra ny fichtre — ny andalana (fanafody, quantité, prix/coût unitaire), ny
  `Client`, `Facture`, `Coût retenu`, `Motif`, ary **`Mouvements de stock liés`** (izay nanova ny stock).
- **`Imprimer`** : taratasy fanontana ilay document.
- **`Annuler le document`** (fahefana `cancel` : admin/pharmacien) : manoratra `Motif d’annulation`
  (**3 litera farafahakeliny**) → `Confirmer l’annulation`. Ny stock dia **miverina amin’ny toerany**
  ary voarakitra ao amin’ny audit izany. Tsy azo averina ny fanafoanana : raha diso ianao dia
  manao vente/documents vaovao.
- **`Journal imprimable`** : fanontana ny hetsika rehetra 30 andro farany (ho an’ny manana `reports`).

---

## 3. Fizarana « Stock »

### 3.1 Lots & stock (onglet voalohany amin’ny « Stock »)

Ny **fisafidianana `Magasin`** no zava-dehibe eto : *Dépôt (réserve)*, *Pharmacie (comptoir)*,
na ny roa. Ny pharmacien dia mahita ny an’ny comptoir, ny dépôt ny an’ny réserve,
ny admin ny roa.

- **Filtres** : `Produit` (anarana/code), `Statut` (En vente / Bloqué), `Expiration`
  (Toutes / À surveiller / Périmés / Sans date), ary fikarohana malalaka.
- **Tsanganana** : `Médicament`, `Numéro de lot`, `Quantité`, `Coût retenu`, `Expiration`, `Statut`.
- **`Bloquer / débloquer`** (ikona 🛡) : manoratra `Justification` (3 litera farafahakeliny,
  ohatra *contrôle qualité, rappel du laboratoire*) → ny lot dia **tsy atolotra amidy intsony** fa
  mbola hita ao amin’ny stock. Ampiasao koa rehefa hamerina azy amin’ny varotra (`Remettre en vente`).
- **`Détail`** : ny `Mouvements` rehetra tao amin’io lot io (niditra, nivoaka, ny antony sy ny olona).
  Raha tsy nisy hetsika : *« Aucun mouvement pour ce lot. »*
- **`État de stock imprimable`** : fanontana ny fanisana stock androany (taratasy fanaraha-maso).

### 3.2 Mouvements (onglet faharoa amin’ny « Stock » — rejista tsy azo ovaina)

- **Filtres** : `Du … au …` (daty), `Produit`, `Motif` (fikarohana malalaka).
- **Tsanganana** : `Date`, `Médicament`, `Type` (entrée/sortie/ajustement), `Quantité`, `Motif`,
  `Utilisateur`, `Référence`.
- **Tsy azo ovaina mihitsy** : na dia administrateur aza. Izany no fototry ny fiarovana ny lisitra
  (raha misy tsy mifanaraka dia inventaire no vahaolana, fa tsy fanovana ny lasa).

### 3.4 Fiche de stock — ny rejistrao lasa mandeha ho azy

Ny rejistra `Stock Initial / Entrée / Sortie / Stock Final` izay soratanao amin’ny cahier na Excel dia
mivoaka ho azy :

1. `Rapports` → `Fiche de stock — PHARMACIE (initial · entrées · sorties · final)`
   na `Fiche de stock — DÉPÔT`. **Roa ny fiche, samy manana ny isany** : ny an’ny pharmacie
   dia ny **vente** no sortie, ny an’ny dépôt dia ny **transfert** sy ny perte.
2. Safidio ny `Période` (ohatra `Ce mois`) → `Recalculer`.
3. Vokatra isaky ny fanafody : `Stock initial`, `Entrées`, `Sorties`, `Stock final`, `Seuil minimum`,
   `Situation` (Rupture / Sous le seuil / Correct), `Coût unitaire`, `Valeur`.
4. `Imprimer` (taratasy feno loha-taratasy) na `Export CSV` (Excel).
5. Hita koa ao amin’ny **`Inventaires`** ny bokotra **`Fiche de stock du mois`** — izay hanamarinana
   ny théorique alohan’ny manao comptage.

Ny tsara amin’izany : **ny `Stock initial` dia ny `Stock final` ny fe-potoana teo aloha, kajy avy
amin’ny mouvements** — tsy mila mandroso isa amin’ny tanana intsony ianao (izay loharanon’ny
fahadisoana amin’ny rejistra papier).

### 3.3 Inventaires — fanisana ny stock tena izy

**Fanokafana** :
1. `Ouvrir une session d’inventaire` → **`Magasin à compter`** (*Dépôt (réserve)* na
   *Pharmacie (comptoir)* — samy manana ny inventaire-ny, iray ihany no misokatra isaky ny magasin) →
   `Périmètre compté` (ohatra *rayon comptoir, réserve, armoire*) sy `Motif` → **`Ouvrir et compter`**.
2. Ny `Comptage` dia mampiseho ny lisitra : `Médicament`, `Théorique` (izay lazain’ny rindranasa),
   `Compté` (izay hita maso — ampidiro), `Justification`.
3. Ny bokotra **`Tout conforme`** dia mametraka ny `Compté` mitovy amin’ny `Théorique` amin’ny andalana rehetra.
4. Raha misy **écart** (tsy mitovy) dia **tsy maintsy** fenoina ny `Justification` (3 litera farafahakeliny) —
   tsy mandeha ny fanamarinana raha misy andalana tsy misy antony.
5. **`Valider`** → ny écart voazava no nanamboarana ny stock (mouvement *ajustement* voarakitra),
   ary miseho : *« Inventaire validé : les écarts justifiés ont ajusté le stock. »*
   Manomboka izao dia io no “fahamarinana” — ny théorique no nifanaraka tamin’ny tena izy.
6. **`Abandonner`** (mila `Motif` koa) : *« Inventaire abandonné : aucun mouvement de stock créé. »* —
   ampiasao raha diso fanisana na nisy nanakorontana.
7. **`Feuille`** : fanontana ny taratasy fanisana (ho an’ny olona manao comptage an-tanana).

---

## 4. Fizarana « Réceptions » sy « Transferts »

> **Tsy misy `Commandes` intsony** : tonga mivantana ny entana, soratana ao amin’ny *Réception*.
> Ny fifindran’entana avy amin’ny dépôt mankany amin’ny pharmacie dia atao amin’ny **`Transferts`**.

### 4.1 Réceptions (dépôt) — fampidirana entana iombonana

1. **`Nouvelle réception`** (ny fanafody rehetra dia **miditra ao amin’ny dépôt**).
2. `Fournisseur` (tsara foana ny mameno azy), `Numéro de facture / bordereau`,
   `Frais de livraison` (na frais hafa) — **`Réparti sur toutes les unités reçues`** : zarao
   araka ny sandan’ny entana ny frais (izany no mahatonga ny **coût de revient marina**).
4. `Note` (ohatra *état du colis, écarts constatés, numéro de scellé*).
5. `Lots reçus` : isaky ny `Médicament` → `N° de lot` (an’ny laboratoire), `Quantité`,
   `Prix d’achat`, `Reçu le`, **`Expire le`** (tena ilaina : izy no fototry ny FEFO),
   `Fabriqué le` (raha misy) → `Ajouter un lot` raha maro.
6. **`Valider la réception`** → voaforona ny **lot** vaovao, ka ny isa `Coût total`, `Frais répartis`,
   `Lots créés` no aseho. Ny prix de vente dia kajy ho azy avy amin’ny marge voafaritra.
7. **`Imprimer le bon`** : bon de réception (ho an’ny fitantanan-bola sy ny grossiste).

### 4.2 Transferts dépôt → pharmacie — ny lalana mankany amin’ny comptoir

1. **`Nouveau transfert`** (écran `Transferts dépôt → pharmacie`).
2. `Motif du transfert` (**voatery**, lisitra : *Réassort du comptoir · Produit très demandé ·
   Retour du surplus au dépôt · Contrôle qualité · Autre*) sy `Remarque` (facultatif).
3. `Lignes` : **lot avy amin’ny dépôt** (ny lisitra dia ny lot du dépôt ihany), `Quantité`
   (voafetra amin’ny `Stock du dépôt`), `Valeur estimée` kajy ho azy.
4. **`Valider le transfert`** → référence `TRF-AAAA-NNNNNN`.
   * Mihena ny **dépôt**, mitombo ny **pharmacie**.
   * Miforona **lot jumeau** any amin’ny pharmacie : mitovy `N° de lot`, mitovy `Expire le`,
     mitovy `Coût retenu` — izany no ahafahan’ny FEFO miasa tsara.
   * Mizara roa ny isa : ohatra 100 ao amin’ny dépôt → 60 dépôt + 40 pharmacie.
5. **`Bordereau`** : taratasy azo pirinty (ilaina rehefa misy mifindra entana ara-batana :
   soniavina eo amin’ny fifindran’ny entana ny anaran’ny mpandray).
6. **Annulation raha diso** : `Transferts` → `Détail` → `Annuler` + `Motif` (≥ 3 litera) →
   ny quantité dia **miverina ao amin’ny dépôt**, voatahiry ny trace (tsy misy famafana).

> Fiarovana : raha toa ka **samy magasin** ny départ sy ny arrivée, na ny quantité mihoatra
> ny stock du dépôt, na ny lot tsy an’ny dépôt, na tsy misy motif → **lavina ny transfert**
> (hafatra mazava amin’ny teny malagasy/frantsay).

> **Retour fournisseur** : tsy misy intsony. Raha misy lot raisin’ny laboratoire (rappel) dia
> atao **`Pertes et dons`** ao amin’ny magasin misy azy, misy motif `Rappel` sy fanamarinana.

---

## 5. Fizarana « Sorties » — Pertes et dons

**`Déclarer une perte`** :
0. **`Magasin concerné`** : *Dépôt (réserve)* na *Pharmacie (comptoir)* — ny stock mifidy
   ny lot dia avy amin’io magasin io ihany (lavina ny lot an’ny magasin hafa).
1. `Motif` : **Casse, Détérioration, Expiration, Perte, Don, Rappel**.
2. `Date du constat`.
3. `Remarque justificative` (**3 litera farafahakeliny** — tsy azo avela foana : izany no porofo
   ho an’ny fanaraha-maso, ohatra *flacons cassés lors du rangement du 12/09*).
4. `Médicament / lot` : safidio ny lot sy ny `Quantité retirée` — aseho ny `Stock du lot`,
   `Coût retenu`, ary `Coût total sorti du stock`.
5. **`Enregistrer la perte`** → miseho ny référence (ohatra `PRT-2026-000004`).
   Ny stock mihena, ny perte hita ao amin’ny tabilao de bord (*Pertes du jour*) sy ny rapports.
6. **`Fiche`** : fanontana ny taratasy fanamarinana ny perte (ilaina amin’ny contrôle).

---

## 6. Fizarana « Catalogue »

### 6.0 Ny onglets « Catalogue »

Ny efijery *Catalogue* dia misy onglet telo eo ambony : **Médicaments**, **Catégories**, **Fournisseurs**.
Tsindriana fotsiny ilay tianao — tsy mivoaka amin’ny efijery ianao.

### 6.1 Médicaments (onglet voalohany)

- **Filtres** : `Catégorie`, statut (`Tous / Actifs / Désactivés`), fikarohana.
- **`Nouveau médicament`** : `Code`, `Désignation`, `Principe actif`, `Dosage`, `Forme galénique`,
  `Présentation` (ohatra *Boîte de 20*), `Code-barres`, `Catégorie`, `Laboratoire`, `Unité de gestion`
  (boîte, flacon, tube…), `Stock minimum` (= seuil d’alerte), `Stock maximum` (= surstock),
  `Condition de conservation`, `Taux de marge` (10–30 %), `Médicament actif`.
  → **`Enregistrer`**.
- **`Taux de marge`** (ikona % na ao amin’ny détail) : misokatra ny *Changer le taux de marge* →
  `Nouveau taux` (10–30 %) + **`Motif de la modification` (voatery)** → aseho ny
  `Prix de vente prévisionnel` sy ny **`Historique des prix`** (izay niova, oviana, nahoana, iza).
  → **`Appliquer le nouveau taux`**.
- **`Désactiver` / `Réactiver`** : ny fanafody tsy amidy intsony; **tsy voafafa mihitsy** (ilaina ny
  tantara). Ny fanafody désactivé dia tsy hita ao amin’ny fikarohana amin’ny vente.
- **`Détail`** : `Coût de revient (CMP)`, `Prix de vente`, marge, ary `Fiche médicament enregistrée.`

### 6.2 Catégories (onglet faharoa)

`Nouvelle catégorie` : `Nom de la catégorie`, `Catégorie active` → `Enregistrer`.
Ampiasaina hanasokajiana ny fanafody (sy ny filtres, ny rapports).

### 6.3 Fournisseurs (onglet fahatelo)

`Nouveau fournisseur` : `Nom`, `Personne à contacter`, `Téléphone`, `E-mail`, `Adresse`,
`NIF / numéro fiscal`, `Note` (délais de livraison, conditions de paiement) → `Enregistrer`.
Ny `Détail` dia mampiseho ny **`Achats récents`** (iza no lafo indrindra, ny vidiny, ny daty) —
ilaina amin’ny fifampiraharahana.

---

## 7. Fizarana « Pilotage »

### 7.1 Rapports

Safidio ny `Type` amin’ireto **12** ireto :
**`Fiche de stock — PHARMACIE`** sy **`Fiche de stock — DÉPÔT`** (io no voalohany, mitovy amin’ny
rejistra papier/Excel : `Date · Médicaments · Stock Initial · Entrée · Sortie · Stock Final` —
ny an’ny pharmacie dia ny **vente** no Sortie, ny an’ny dépôt dia ny **transfert** sy ny perte),
`État du stock`, `Mouvements de stock`, **`Transferts dépôt → pharmacie`**, `Ventes et marges (pharmacie)`,
`Achats et réceptions (dépôt)`, `Pertes et dons`, `Lots à surveiller` (expiration),
`Inventaires et écarts`, `Historique des prix`, `Achats par fournisseur`.
- `Période` : `Aujourd’hui`, `7 jours`, `Ce mois`, na daty tianao (`Du … au …`).
- Ny **`Stock initial` dia miverina ho azy** : ny stock final ny période teo aloha no aseho —
  tsy misy kopie an-tanana.
- Raha `Achats par fournisseur` : ampidiro ny `Identifiant du fournisseur`.
- **`Recalculer`** : mamoaka ny tabilao + ny `Résumé` (total, marge, isan’ny opération).
- **`Export CSV`** : misokatra amin’Excel ny rakitra (mpizara `;`, misy marika UTF-8 —
  tsy manimba ny litera misy accent ary tsy atahorana ny infizie formula).
- **`Imprimer`** : taratasy fanontana misy ny loha-taratasy (anaran’ny officine, daty, période).
- **`Contrôle d’intégrité`** : manamarina fa ny isan’ny lot rehetra dia mitovy amin’ny fitambaran’ny
  mouvements-ny — valiny : *« Aucune anomalie détectée »* na lisitry ny tsy mifanaraka.

### 7.2 Journal d’audit (iza no nanao inona, oviana)

- Lisitra misy `Date`, `Utilisateur`, `Action`, `Élément`, sy ny antsoina hoe *avant/après*
  (ny zava-niova). Ny mot de passe dia aseho `[masqué]` — tsy misy zava-miafina mivoaka.
- **`Rafraîchir`**, **`Précédent`** / **`Suivant`** (fizara pejy 50 isaky ny pejy).
- **`Contrôle d’intégrité`** : toy ny ao amin’ny rapports.

### 7.3 Utilisateurs (admin ihany)

- **`Nouvel utilisateur`** : `Nom et prénom`, `Identifiant de connexion`, `Rôle`
  (**Administrateur / Pharmacien / Gestionnaire du dépôt** — telo ihany izy ireo), `Téléphone`,
  `Mot de passe` (**12 litera farafahakeliny**), `Compte actif`, `Note`.
- **Hanovana** (ikona pensily) : azo ovaina ny anarana, ny rôle, ny statut ; raha tianao
  **havadika ny mot de passe** dia fenoy ny saha `Nouveau mot de passe` (avelao foana raha tsy
  tianao ovaina) → ny session rehetra an’io olona io dia tapaka (tsy maintsy miditra indray izy).
- **`Désactiver`** : tsy afaka miditra intsony ilay olona, **fa tsy voafafa** — ilaina ny tantara
  (ny documents rehetra dia mitondra ny anarany). Izany no atao rehefa misy mpiasa miala.
- Fiarovana : **ny administrateur farany mavitrika dia tsy azo ampidinina na esorina** —
  tsy ho very mihitsy ny fitantanana ny compte.
- Ny tsanganana `Dernière connexion` dia mampiseho izay farany niditra.

### 7.4 Paramètres (admin ihany)

- **Identité de l’officine** : `Nom de la pharmacie`, `Adresse`, `Téléphone`, `Responsable`,
  `Devise`. Io anarana io no miposaka amin’ny tapakila sy ny taratasy rehetra (izay voalaza
  tany amin’ny docs/7 : tsy atao ao amin’ny `.env` izy).
- **`Méthode de valorisation du stock`** : `Coût de revient réel du lot` na `Coût moyen pondéré (CMP)`.
  ⚠️ **Mihidy io safidy io rehefa misy mouvement voarakitra** (marika *Valorisation figée*) :
  tsy azo ovaina intsony raha tsy manomboka amin’ny base vaovao — izany no miaro ny fitovian’ny
  isa (RG10).
- **`Mode de calcul de la marge`** : `Marge sur coût d’achat` (prix = coût × (1 + taux)) na
  `Marge sur prix de vente` (prix = coût ÷ (1 − taux)). Ny prix de vente dia **kajy foana, tsy soratana** (RG05).
- **`Plage de marge autorisée`** : `min` sy `max` (10–30 %). Izay mivoaka aminy dia lavina.
- **`Horizon d’alerte de péremption`** (default 90 andro) : ny lot izay ho lany daty ao anatin’io
  fe-potoana io dia atao *Expiration proche*.
- **`Autoriser exceptionnellement la vente de lots périmés`** : **avelao tsy voamarika** (déconseillé,
  tsy ara-panafody). Raha voamarika dia mety hividy fanafody lany daty ny rindranasa — tsy tokony hatao.
- **`Enregistrer les paramètres`** → *« Paramètres enregistrés. »*

---

## 8. Ny fizotran’ny asa isan’andro (dingana mifanesy)

### A. Fandraisana entana (avy amin’ny grossiste) — **ny dépôt no mahazo**
`Réceptions (dépôt)` → `Nouvelle réception` → fournisseur, facture, frais → n° de lot / quantité /
prix / `Durée de conservation` → `Valider la réception` → `Imprimer le bon`.
*(Ny fanafody rehetra dia mijanona ao amin’ny dépôt amin’izay.)*

### B. Fandefasana any amin’ny pharmacie
`Transferts dépôt → pharmacie` → `Nouveau transfert` → `Motif` + lot(du dépôt) + quantité →
`Valider le transfert` → `Bordereau`.

### C. Vente iray (1 minitra) — **ny pharmacie ihany**
`Historique de vente` → karohy → tsindrio → amboary ny quantité → `Recalculer le total` →
`Valider la vente` → `Imprimer le ticket`.

### D. Entana simba, lany daty, na very
`Pertes et dons` → `Déclarer une perte` → **`Magasin concerné`** + motif + remarque.
(Raha misy lot raisin’ny laboratoire dia izao koa no atao, amin’ny motif `Rappel`.)

### E. Fanisana stock (magasin tsirairay)
`Inventaires` → `Ouvrir un inventaire` → **`Magasin à compter`** → `Compter` (na `Tout conforme`) →
fenoy ny `Justification` amin’ny andalana tsy mitovy → `Valider`.

### F. Fiovana prix (marge)
`Médicaments` → tsindrio ny `Taux de marge` → taux vaovao (10–30 %) + **motif** → `Appliquer`.
Ny `Historique des prix` dia mitahiry ny fiovana rehetra (RG23).

---

## 8 bis. Ny zavatra mandeha ho azy (tsy misoratra intsony)

| Toerana | Izay mameno ho azy | Tsy mila ianao |
|---|---|---|
| **Ventes** | Ny client dia safidiana amin’ny lisitra (izay efa novangiana) na *Client de passage* | manoratra anarana isaky ny vente |
| **Ventes** | Ny `Lot retenu`, ny `Expiration`, ny `Prix unitaire` sy ny `Total` dia avy amin’ny serveur (FEFO) | mikajy na misafidy lot |
| **Transferts** | Ny lisitra dia ny **lot du dépôt ihany** ; ny `Valeur estimée` sy ny total dia kajy avy amin’ny coût du lot | misafidy lot amin’ny magasin hafa na mikajy |
| **Transferts** | Ny `Motif` dia lisitra efa voaomana (tsy mila manoratra andalana lava) | mamorona antony |
| **Réceptions** | Ny `Reçu le` = androany ; ny `Durée de conservation` (6 mois / 1 an / 18 mois / 2 ans / 3 ans) → **ny `Expire le` mivoaka ho azy** | manoratra daty péremption |
| **Réceptions** | Ny `N° de lot` dia atolotra (code + année) raha tsy nosoratanao | manoratra raha tsy ilaina |
| **Réceptions** | Ny `Coût de revient moyen estimé` (frais voazara) sy ny total | manao kajy |
| **Pertes et dons** | Ny `Date du constat` = androany (voarakitra ho azy) ; ny `Motif` dia lisitra ; ny `Stock du lot`, `Coût retenu`, `Coût total` | manoratra daty na mikajy |
| **Inventaires** | `Tout conforme` dia mamerina ny théorique amin’ny andalana rehetra | manoratra isa iray isaky ny andalana |
| **Médicaments** | `Stock maximum` atolotra = 30 × seuil d’alerte ; ny `Forme galénique` sy ny `Condition de conservation` dia lisitra (misy modely efa voaomana) | manoratra texte |
| **Médicaments → marge** | Ny taux dia safidiana amin’ny boutons (10 % … 30 %), ny `Motif` amin’ny lisitra, ny `Prix de vente prévisionnel` kajy | manoratra isa sy teny lava |
| **Utilisateurs** | Bokotra *Proposer un identifiant* : « Rasoanaivo Hery » → `h.rasoanaivo` | mamorona anarana |
| **Paramètres** | Ny plage de marge sy ny horizon de péremption dia lisitra | manoratra isa |

> Izay **tsy maintsy** soratana ihany : ny **isa** (quantité), ny **n° de lot** (izay voasoratra amin’ny boite),
> ny **frais** raha misy, ny **remarque/justification** rehefa takiana amin’ny lalàna (perte, écart d’inventaire,
> annulation, motif de marge), ary ny **anarana** rehefa mamorona fiche vaovao.

## 9. Ny fitsipika tsy azo hozongozonina (hita amin’ny fampiasana)

> Ny toro-lalana **isaky ny role** (asa + fomba + iza no manao raha tsy ianao) dia ao amin’ny
> `docs/9-TORO-LALANA-ISAKY-NY-ROLE.md`.

1. **FEFO** : ny lot akaiky indrindra ny fahalaniany no amidy aloha (RG13).
2. **Tsy amidy ny lot lany daty** na **bloqué** (RG14).
3. **Ny prix de vente dia kajy** (coût + marge) — tsy soratana an-tanana (RG05) ; ny marge
   voafetra ao anatin’ny 10–30 % voafaritra (RG06).
3 bis. **Ny entana rehetra dia mandalo ny dépôt** : réception → dépôt → transfert → pharmacie.
   Ny vente dia tsy maka mihitsy ao amin’ny stock du dépôt.
4. **CMP / coût de revient** no havaozina isaky ny fidirana entana, miaraka amin’ny frais voazara (RG08/RG09).
5. **Tsy misy famafana** : fanafody, fournisseur, catégorie, compte — **désactivation** ihany (RG19).
6. **Ajustement tsy maintsy zava-misy** : perte sy écart d’inventaire dia samy manana motif/remarque
   voatery sy voarakitra (RG16).
7. **Tsy azo ovaina ny lasa** : ny `Mouvements`, ny `Journal d’audit` ary ny `Historique des prix`
   dia fiarovana ara-teknika (append-only).
8. **Tsy avo roa heny ny opération** : raha sendra averina ny baiko (vente, réception, perte,
   retour, inventaire) dia ny iray ihany no tanterahina.

---

## 10. Fahadisoana mahazatra sy ny valiny

| Hafatra | Antony | Vahaolana |
|---|---|---|
| `Stock vendable insuffisant pour …` | tsy ampy ny lot tsy lany daty/tsy bloqué **ao amin’ny pharmacie** | jereo `Lots & stock` (Magasin = Pharmacie) ; raha tsy ampy dia **`Transfert`** avy amin’ny dépôt ; raha lany daty dia `Pertes et dons` |
| `Le lot … n’est pas dans le magasin « Dépôt »` | nanandrana naka lot an’ny pharmacie tamin’ny transfert | safidio lot avy amin’ny dépôt |
| `Le lot … se trouve dans « Pharmacie »` | perte natao tamin’ny magasin diso | ovay ny `Magasin concerné` |
| `Un inventaire est déjà en cours dans « … »` | misy inventaire tsy mbola voavaly amin’io magasin io | `Valider` na `Abandonner` aloha |
| `Session expirée. Reconnectez-vous.` | lasa ny 8 ora na voafafa ny session | midira indray |
| `Trop de tentatives de connexion…` | 20 diso / 15 min | miandry 15 minitra |
| `12 caractères minimum` | fohy loatra ny mot de passe | manao 12+ |
| `Mot de passe actuel incorrect.` | diso ny `Mot de passe actuel` | avereno tsara |
| `Le nouveau mot de passe doit être différent de l’ancien.` | mitovy | manao hafa |
| `Cet identifiant est déjà utilisé.` | efa misy io login io | manao anarana hafa |
| `Vous ne pouvez pas désactiver votre propre compte.` | ianao no mikitika | ataovy amin’ny admin hafa |
| `Le dernier administrateur actif ne peut pas …` | tokony hisy admin iray foana | mamorona admin hafa aloha |
| `Document déjà annulé.` | efa voafafa io document io | — |
| `Vous ne pouvez pas vendre depuis le dépôt.` | kaonty `DEPOT` no ampiasaina | midira amin’ny kaonty pharmacien na admin |
| `Valorisation figée : des mouvements existent déjà.` | efa nisy hetsika | tsy azo ovaina intsony |
| `Données invalides — …` | tsy feno/tsy mety ny saha voalaza | jereo ny anaran’ny saha ao amin’ny hafatra |
| `Origine non autorisée` | adiresy tsy mifanaraka amin’ny `APP_ORIGIN` | jereo ny `.env` (docs/7) |
| `Hors ligne` | tapaka ny fifandraisana | andraso hiverina ny résau |

---

## 11. Fanontaniana matetika

| Fanontaniana | Valiny |
|---|---|
| Afaka manafoana vente diso ve aho? | Eny : `Documents` → `Détail` → `Annuler le document` (+ motif). Miverina amin’ny stock ny entana. Fahefana `cancel` (admin/pharmacien) no ilaina |
| Manao ahoana raha diso ny isan’ny stock? | `Inventaires` : isaina ny tena izy, soratana ny antony, `Valider` |
| Afaka mamafa fanafody efa tsy amidy ve? | Tsy voafafa — `Désactiver` ihany. Mbola hita ao amin’ny tantara |
| Ovaina ve ny prix de vente? | Tsy soratana mivantana : ovaina ny **taux de marge** (misy motif voatery) na ny coût amin’ny réception vaovao |
| Iza no mahita ny marge? | Administrateur sy Pharmacien (`prices`). Ny kaonty **dépôt** dia tsy mahita ny vidin’ny varotra mihitsy |
| Aiza ny tapakila teo aloha? | `Documents` → `Type = Vente` → `Détail` → `Imprimer` |
| Ahoana raha marary ny ordinateur? | Ny angona dia ao amin’ny PostgreSQL : averina ny sauvegarde (docs/5) |
| Misy application finday ve? | Tsy misy application misaraka : ny pejin’ny navigateur ihany no miova ho finday (menu ambany 5) |
| Afaka mivarotra fanafody tsy misy daty ve? | Eny, fa aseho `sans date` ary tafiditra ao amin’ny *Lots à surveiller* |
| Iza no mamorona compte? | Administrateur ihany (`Utilisateurs`). Ny dépôt sy ny pharmacien dia tsy mahita an’io écran io mihitsy |
| Nahoana no tsy afaka mivarotra ny kaonty dépôt? | Ny dépôt dia réserve ihany : ny varotra dia an’ny pharmacie. Mila entana ve? Manaova `Transfert` |
| Ahoana no ahafantarako ny stock an’ny dépôt sy ny an’ny pharmacie? | `Stock → Lots & stock` → `Magasin` ; na `Rapports → Fiche de stock — DÉPÔT` / `— PHARMACIE` |

---

## 12. Fanamarinana isan’andro (5 minitra maraina / 5 minitra hariva)

**Maraina** : `Tableau de bord` — jereo ny alerts mena (ny dépôt : *En rupture* ; ny pharmacie :
*Ventes du jour*) ; `Prochaines péremptions` ; `Derniers transferts dépôt → pharmacie`.

**Ampiasaina mandritra ny andro** : `Historique de vente` isaky ny mpanjifa (ticket amin’ny farany) ;
ny dépôt : `Réceptions` sy `Transferts`.

**Hariva** : `Rapports` → `Ventes et marges (pharmacie)` → jereo ny total sy ny marge ;
`Pertes et dons` raha nisy fahasimbana ; `Documents` → jereo raha misy *En cours* tsy voavaly ;
`Inventaires` raha nisy fanisana.

**Isam-bolana** : sauvegarde (docs/5), `Journal d’audit`, `Achats et réceptions (dépôt)`
(fifampiraharahana amin’ny vidiny), ary ny **fiche de stock roa** (PHARMACIE sy DÉPÔT).

---

## Fanazavana fohy (résumé)

Ny rindranasa dia mandeha toy ny **rejista roa** (dépôt sy pharmacie) : ny entana rehetra
(réception, transfert, vente, perte, ajustement) dia **hetsika** voarakitra tsy azo ovaina. Noho izany :

- tsy manao « correction » mivantana mihitsy ianao, fa **hetsika vaovao voazava** (perte misy antony,
  inventaire misy fanamarinana, annulation misy motif) ;
- isaky ny entana dia misy **iza, oviana, nahoana** — hita ao amin’ny `Journal d’audit` ;
- ny isa rehetra (stock, marge, valeur) dia **kajy foana** avy amin’ny hetsika, ka tsy misy
  « fanamboarana an-tanana » mety hamitaka.

Izany no mahatonga ny fitantanana azy ho tsotra : **tsy mila mahay informatique ianao**,
mila manoratra ny tena zava-mitranga fotsiny (izay rehetra hita maso : nahazo, namidy, simba, very,
niverina, voaisa) — ary ny rindranasa no manao ny kajy rehetra.
