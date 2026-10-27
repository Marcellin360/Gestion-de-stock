// ============================================================================
// 2.7.35 + 2.7.36 — HÔPITAL-PHARMACIE : référentiels du carnet.
//
//   • PATIENTS : nom/service/remarque, DATE D'ADMISSION (début du séjour) et
//     employé enregistreur ; un patient « actif » apparaît dans le choix de la
//     caisse, un patient « sorti » reste dans l'historique ;
//   • PERSONNEL (médecins / sages-femmes) : rôle, téléphone, et 2.7.38 —
//     UNE PÉRIODE DE GARDE PAR DATES OBLIGATOIRE directement sur la fiche
//     (duty_start_on → duty_end_on ; le « jour de semaine » et la table des
//     périodes multiples ne sont plus utilisés) ;
//   • ACTIVITÉ d'un prescripteur : ses carnets, ses patients, leurs médicaments ;
//   • SÉJOURS : la vue « Clients hôpital » de l'historique de vente — pour
//     chaque patient : ses achats dans l'ordre du séjour, ses prescripteurs,
//     et le TOTAL PAR MÉDICAMENT (c'est ce total que l'ordonnance de séjour
//     imprime : UNE seule ordonnance suit le patient jour après jour).
// ============================================================================
import { MedicalStaff, Patient, Sale, SaleLine, Product, User } from '../models/index.js';
import { ensure } from '../utils/errors.js';
// 2.7.82 — « Servi par » sur l'ordonnance de séjour : chaque carnet emporte
// son serveur dans la note (marqueur ⟦Servi par : X⟧, utils/serviPar.js) —
// la personne qui sert change d'une délivrance à l'autre, l'ordonnance les
// cite tous.
import { serviParDe } from '../utils/serviPar.js';

export const STAFF_ROLES = ['DOCTOR', 'MIDWIFE'];

const aujourdHui = () => new Date().toISOString().slice(0, 10);

/** 2.7.42 — une date de garde EST « AAAA-MM-JJ » : tronque tous les habillages
    (horaire, fuseau) qui pouvaient décaler UN JOUR l'affichage et casser le
    TDR dès que la période dépassait deux jours. */
const jourSeul = valeur => {
  if (!valeur) return null;
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  return String(valeur).slice(0, 10);
};

/** Nom de l'employé utilisateur par identifiant (« — » si inconnu). */
async function nomsUtilisateurs(ids, transaction) {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!uniques.length) return new Map();
  const utilisateurs = await User.findAll({ where: { id: uniques }, transaction });
  return new Map(utilisateurs.map(u => [u.id, u.name]));
}

// ------------------------------------------------------------------------ staff

/** Liste le personnel (actifs d'abord, puis le nom). */
export async function listerStaff(transaction) {
  return (await MedicalStaff.findAll({ order: [['active', 'DESC'], ['name', 'ASC']], transaction }))
    .map(row => row.toJSON ? row.toJSON() : row)
    // 2.7.42 — dates de garde toujours nettoyées : une garde d'UN, DEUX,
    // TROIS jours ou plus s'affiche pareil, sans décalage de fuseau horaire.
    .map(row => ({ ...row, dutyStartOn: jourSeul(row.dutyStartOn), dutyEndOn: jourSeul(row.dutyEndOn) }));
}

/** 2.7.38 — la fin de garde ne peut jamais précéder le début. */
function verifierPeriode(debut, fin) {
  if (debut && fin) {
    ensure(fin >= debut, 'La fin de garde est AVANT le début : vérifiez les deux dates.', 422);
  }
}

export async function creerStaff(values, transaction) {
  const doublon = await MedicalStaff.findOne({ where: { name: values.name }, transaction });
  ensure(!doublon, `« ${values.name} » est déjà enregistré (rôle ${doublon?.role || ''}). Choisissez-le plutôt.`, 409);
  verifierPeriode(values.dutyStartOn, values.dutyEndOn);
  return MedicalStaff.create(values, { transaction });
}

export async function patchStaff(id, values, transaction) {
  const staff = await MedicalStaff.findByPk(id, { transaction });
  ensure(staff, 'Employé introuvable.', 404);
  if (values.name && values.name !== staff.name) {
    const doublon = await MedicalStaff.findOne({ where: { name: values.name }, transaction });
    ensure(!doublon, `« ${values.name} » est déjà enregistré.`, 409);
  }
  // Cohérence mêlant anciennes et nouvelles valeurs (modification partielle).
  verifierPeriode(values.dutyStartOn ?? staff.dutyStartOn, values.dutyEndOn ?? staff.dutyEndOn);
  await staff.update(values, { transaction });
  return staff;
}

// ------------------------------------------------------------------------ patients

/** Liste les patients (actifs d'abord) avec le nom de l'employé enregistreur. */
export async function listerPatients(transaction) {
  const patients = await Patient.findAll({ order: [['active', 'DESC'], ['name', 'ASC']], transaction });
  const parNom = await nomsUtilisateurs(patients.map(p => p.createdBy), transaction);
  return patients.map(patient => ({
    ...patient.toJSON(),
    createdByName: patient.createdBy ? (parNom.get(patient.createdBy) || '—') : '—'
  }));
}

export async function creerPatient(values, user, transaction) {
  // Les homonymes existent : le refus n'existe que si le même couple
  // nom + service est déjà présent et actif.
  const doublon = await Patient.findOne({ where: { name: values.name, service: values.service || '' }, transaction });
  ensure(!doublon,
    `Ce patient (« ${values.name} »${values.service ? `, ${values.service}` : ''}) est déjà enregistré : choisissez-le plutôt.`, 409);
  return Patient.create({
    name: values.name,
    service: values.service || '',
    note: values.note || '',
    // 2.7.79 — motif de l'hospitalisation (ex. « Fièvre »).
    motif: values.motif || '',
    admittedOn: values.admittedOn || aujourdHui(),
    createdBy: user ? user.id : null
  }, { transaction });
}

export async function patchPatient(id, values, transaction) {
  const patient = await Patient.findByPk(id, { transaction });
  ensure(patient, 'Patient introuvable.', 404);
  // 2.7.59 — la « SORTIE du service » grave la date de sortie de l'hôpital
  // (dischargedOn : imprimée sur les ordonnances) : posée quand « actif »
  // passe à faux, effacée si le patient revient au service.
  const sorties = { ...values };
  if (values.active === false && patient.active !== false) {
    sorties.dischargedOn = values.dischargedOn || aujourdHui();
  } else if (values.active === true && patient.active === false) {
    sorties.dischargedOn = null;
  }
  await patient.update(sorties, { transaction });
  return patient;
}

// ------------------------------------------------------------------------ séjours & activité

/** Charge et regroupe les ventes VALIDATED liées à un carnet (patientId non nul). */
async function ventesAvecCarnet(transaction) {
  const ventes = await Sale.findAll({
    where: { status: 'VALIDATED' },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    transaction
  });
  return ventes.filter(vente => vente.patientId);
}

/**
 * Résumés de séjour : UNE LIGNE PAR PATIENT ayant pris des médicaments à la
 * pharmacie — utilisé par l'historique de vente, onglet « Clients hôpital ».
 * Chaque ligne : patient (nom, service, admission), prescripteurs (noms
 * distincts), dates première/dernière délivrance, nombre de carnets, total.
 */
export async function sejours(transaction) {
  const ventes = await ventesAvecCarnet(transaction);
  const [personnels, patients] = await Promise.all([
    MedicalStaff.findAll({ transaction }),
    Patient.findAll({ where: { id: [...new Set(ventes.map(v => v.patientId))] }, transaction })
  ]);
  const personnelParId = new Map(personnels.map(p => [p.id, p]));
  const patientParId = new Map(patients.map(p => [p.id, p]));
  const resultat = new Map();
  for (const vente of ventes) {
    let ligne = resultat.get(vente.patientId);
    if (!ligne) {
      const patient = patientParId.get(vente.patientId);
      ligne = {
        patientId: vente.patientId,
        patient: patient ? patient.name : (vente.customerName || '—'),
        service: patient?.service || '',
        admittedOn: patient?.admittedOn || null,
        active: patient ? patient.active : true,
        prescribers: [],
        firstSaleAt: vente.createdAt,
        lastSaleAt: vente.createdAt,
        saleCount: 0,
        total: 0
      };
      resultat.set(vente.patientId, ligne);
    }
    ligne.saleCount += 1;
    ligne.total += Number(vente.total || 0);
    if (!ligne.firstSaleAt || vente.createdAt < ligne.firstSaleAt) ligne.firstSaleAt = vente.createdAt;
    if (!ligne.lastSaleAt || vente.createdAt > ligne.lastSaleAt) ligne.lastSaleAt = vente.createdAt;
    const prescripteur = vente.medicalStaffId ? personnelParId.get(vente.medicalStaffId) : null;
    if (prescripteur && !ligne.prescribers.some(p => p.id === prescripteur.id)) {
      ligne.prescribers.push({ id: prescripteur.id, name: prescripteur.name, role: prescripteur.role });
    }
  }
  return [...resultat.values()].sort((a, b) => String(a.patient).localeCompare(String(b.patient), 'fr'));
}

/**
 * Détail COMPLET du séjour d'un patient (bouton « Détail » de l'historique) :
 * mombamoba ny marary (nom, service, admission, enregistré par), les
 * prescripteurs, chaque achat DANS L'ORDRE du séjour (continuité jour après
 * jour), et le total PAR MÉDICAMENT — exactement ce que l'ordonnance résumée
 * imprime (une seule ordonnance pour toute l'hospitalisation).
 */
/**
 * Détail COMPLET du séjour d'un patient (bouton « Détail » de l'historique) :
 * mombamoba ny marary (nom, service, admission, enregistré par), les
 * prescripteurs, chaque achat DANS L'ORDRE du séjour (continuité jour après
 * jour), et le total PAR MÉDICAMENT avec PRIX et MONTANT — c'est cela que
 * l'ordonnance résumée imprime (une seule ordonnance, du/au facultatif pour
 * restreindre la période).
 * @param {object} periode {du, au} facultatif, au format AAAA-MM-JJ.
 */
export async function sejourDetail(id, periode, transaction) {
  const patient = await Patient.findByPk(id, { transaction });
  ensure(patient, 'Patient introuvable.', 404);
  let ventes = (await ventesAvecCarnet(transaction)).filter(v => v.patientId === id);
  // 2.7.37 — teboka ⑤ : on peut restreindre le séjour « entre deux dates »
  // (le/la docteur(e) qui accompagne n'imprime que sa fenêtre).
  const { du = null, au = null } = periode || {};
  if (du || au) {
    ventes = ventes.filter(v => {
      const jour = new Date(v.createdAt).toISOString().slice(0, 10);
      return (!du || jour >= du) && (!au || jour <= au);
    });
  }
  const ligneRows = ventes.length
    ? await SaleLine.findAll({ where: { saleId: ventes.map(v => v.id) }, order: [['id', 'ASC']], transaction })
    : [];
  const [personnels, produits] = await Promise.all([
    MedicalStaff.findAll({ transaction }),
    Product.findAll({ where: { id: [...new Set(ligneRows.map(l => l.productId))] }, transaction })
  ]);
  const personnelParId = new Map(personnels.map(p => [p.id, p]));
  const produitParId = new Map(produits.map(p => [p.id, p]));
  const parNom = await nomsUtilisateurs([patient.createdBy], transaction);

  const lignesParVente = new Map();
  const medecines = new Map(); // « produit|unité » → total dans l'unité + montants
  for (const ligne of ligneRows) {
    const unite = ligne.saleUnit || 'BOX';
    const quantiteUnite = ligne.saleQuantity != null ? Number(ligne.saleQuantity) : Number(ligne.quantity);
    const produit = produitParId.get(ligne.productId);
    const montantLigne = quantiteUnite * Number(ligne.unitPrice || 0);
    const entree = {
      product: produit?.name || `#${ligne.productId}`,
      saleQuantity: ligne.saleQuantity != null ? Number(ligne.saleQuantity) : null,
      quantity: Number(ligne.quantity),
      saleUnit: unite
    };
    const cible = lignesParVente.get(ligne.saleId) || [];
    cible.push(entree);
    lignesParVente.set(ligne.saleId, cible);
    // Continuité du séjour : MÊME produit + MÊME unité → addition des jours.
    // 2.7.37 — teboka ⑤ : les montants suivent quantité (prix unitaire moyen
    // s'il a bougé d'une journée à l'autre).
    const cle = `${ligne.productId}|${unite}`;
    const totale = medecines.get(cle) || {
      product: entree.product, saleUnit: unite, saleQuantity: 0, totalAmount: 0
    };
    totale.saleQuantity += quantiteUnite;
    totale.totalAmount += montantLigne;
    medecines.set(cle, totale);
  }
  // Prix unitaire affiché sur l'ordonnance : le montant divisé par la quantité
  // cumulée (exact si le prix n'a jamais bougé, moyenne sinon).
  for (const totale of medecines.values()) {
    totale.unitPrice = totale.saleQuantity > 0
      ? (totale.totalAmount / totale.saleQuantity).toFixed(6)
      : '0.000000';
    totale.totalAmount = totale.totalAmount.toFixed(6);
  }

  const prescribers = [];
  for (const vente of ventes) {
    const prescripteur = vente.medicalStaffId ? personnelParId.get(vente.medicalStaffId) : null;
    if (prescripteur && !prescribers.some(p => p.id === prescripteur.id)) {
      prescribers.push({ id: prescripteur.id, name: prescripteur.name, role: prescripteur.role });
    }
  }

  // 2.7.82 — serveurs du séjour : le nom « Servi par » saisi À CHAQUE carnet
  // voyage dans la note (marqueur ⟦…⟧) ; l'ordonnance de séjour les cite tous
  // (une délivrance du matin n'est pas servie par la même personne que celle
  // du soir).
  const serveurs = [];
  for (const vente of ventes) {
    const nom = serviParDe(vente.note);
    if (nom && !serveurs.includes(nom)) serveurs.push(nom);
  }

  return {
    patient: {
      ...patient.toJSON(),
      createdByName: patient.createdBy ? (parNom.get(patient.createdBy) || '—') : '—'
    },
    prescribers,
    // 2.7.82 — noms « Servi par » distincts, dans l'ordre du séjour.
    serveurs,
    medecines: [...medecines.values()],
    ventes: ventes.map(vente => {
      const prescripteur = vente.medicalStaffId ? personnelParId.get(vente.medicalStaffId) : null;
      return {
        saleId: vente.id,
        reference: vente.reference,
        date: vente.createdAt,
        total: vente.total,
        prescriber: prescripteur ? prescripteur.name : '',
        prescriberRole: prescripteur ? prescripteur.role : '',
        lignes: lignesParVente.get(vente.id) || []
      };
    })
  };
}

/**
 * Activité d'un prescripteur : carnets (ventes validées) les plus récents
 * d'abord, avec le patient et les médicaments de chaque carnet.
 */
export async function activiteStaff(id, transaction) {
  const staff = await MedicalStaff.findByPk(id, { transaction });
  ensure(staff, 'Employé introuvable.', 404);
  const ventes = await Sale.findAll({
    where: { medicalStaffId: id, status: 'VALIDATED' },
    order: [['createdAt', 'DESC']], limit: 60,
    transaction
  });
  const patientIds = [...new Set(ventes.map(v => v.patientId).filter(Boolean))];
  const ligneRows = ventes.length
    ? await SaleLine.findAll({ where: { saleId: ventes.map(v => v.id) }, transaction })
    : [];
  const [patients, produits] = await Promise.all([
    patientIds.length ? Patient.findAll({ where: { id: patientIds }, transaction }) : [],
    (async () => {
      const ids = [...new Set(ligneRows.map(l => l.productId))];
      return ids.length ? Product.findAll({ where: { id: ids }, transaction }) : [];
    })()
  ]);
  const patientsParId = new Map(patients.map(p => [p.id, p]));
  const produitsParId = new Map(produits.map(p => [p.id, p]));
  const lignesParVente = new Map();
  for (const ligne of ligneRows) {
    const cible = lignesParVente.get(ligne.saleId) || [];
    cible.push({
      product: produitsParId.get(ligne.productId)?.name || `#${ligne.productId}`,
      saleQuantity: ligne.saleQuantity != null ? Number(ligne.saleQuantity) : null,
      quantity: Number(ligne.quantity),
      saleUnit: ligne.saleUnit || 'BOX'
    });
    lignesParVente.set(ligne.saleId, cible);
  }
  return {
    staff: staff.toJSON(),
    ventes: ventes.map(vente => {
      const patient = vente.patientId ? patientsParId.get(vente.patientId) : null;
      return {
        saleId: vente.id,
        reference: vente.reference,
        date: vente.createdAt,
        patient: patient ? (patient.name || '') : '(sans patient enregistré)',
        service: patient?.service || '',
        total: vente.total,
        lignes: lignesParVente.get(vente.id) || []
      };
    })
  };
}