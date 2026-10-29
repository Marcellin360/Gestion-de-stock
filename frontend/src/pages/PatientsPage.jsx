// ============================================================================
// 2.7.35 + 2.7.36 + 2.7.38 + … + 2.7.45 — HÔPITAL : carnets des patients et du personnel.
//
//   Onglet « Patients hospitalisés » : nom, service, DATE D'ADMISSION et
//   employé enregistreur (la colonne « Remarque » n'est PLUS affichée, sauf
//   quand on ouvre le patient pour modification). Un patient « actif » peut
//   être choisi à la caisse ; un patient « sorti » reste dans l'historique.
//
//   Onglet « Personnel et tour de garde » : médecins et sages-femmes. 2.7.38 —
//   la GARDE est une PÉRIODE DE DATES OBLIGATOIRE directement dans la fiche :
//   « du … au … » (début ET fin). Le « Jour de semaine (TDR) » et la gestion
//   des « Périodes de garde » multiples sont SUPPRIMÉS : une période par
//   employé, affichée dans la liste. 2.7.39 — le « Tour de garde de la
//   semaine » est un EMPLOI DU TEMPS propre, du LUNDI au DIMANCHE : chaque
//   RANGÉE d'employés est séparée par UN TRAIT CONTINU tout du long du
//   tableau (2.7.41). 2.7.42 — les dates du bornage sont TOUJOURS ramenées à
//   « AAAA-MM-JJ » (ne plus subir le décalage d'un jour de certains fuseaux) :
//   une garde d'UN, DEUX, TROIS jours ou plus fonctionne pareil. 2.7.45 —
//   RÈGLE DÉFINITIVE décidée : LE TABLEAU COUVRE LES 7 PROCHAINS JOURS à
//   partir d'aujourd'hui (fenêtre GLISSANTE, plus seulement la semaine
//   calendaire — un garde qui déborde sur la semaine suivante est enfin
//   visible entièrement) et, sous chaque nom, la DATE DU JOUR de la colonne
//   (17/10 sous Samedi, 18/10 sous Dimanche, 19/10 sous Lundi…).
//
//   « Activité » affiche, médecin par médecin, les carnets prescrits
//   (patients préinscrits + médicaments délivrés — voir 2.7.35).
//
//   2.7.69 — ergonomie des listes (fanatsarana interface) : colonne
//   « Action » CENTRÉE au-dessus des boutons ; petit espace RÉGULIER entre
//   eux (.actes) ; CODE COULEUR plein (même palette que l'historique 2.7.67)
//   — Modifier = BLEU, Activité/Réactiver = VERT, Retirer du TDR / Sortie =
//   ROUGE. Le long paragraphe explicatif sous l'emploi du temps est RETIRÉ
//   (la date sous chaque nom et les traits parlent d'eux-mêmes).
//
//   Rien ne se supprime : on « sort » un patient, on « retire » un employé.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Activity } from 'lucide-react';
import { hopital } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Table, Tabs, Textarea } from '../components/ui.jsx';
import { money, today, integer } from '../utils/format.js';
// 2.7.84 — unités de vente libres (chaîne de conditionnement) : ml, cm…
import { libelleQuantiteUnite } from '../utils/unites.js';

// 2.7.45 — JOURS DE SEMAINE par numéro de getDay() (0 = dimanche).
const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const ROLE_LABEL = code => (code === 'DOCTOR' ? 'Médecin' : code === 'MIDWIFE' ? 'Sage-femme' : code || '—');
const dateFr = valeur => (valeur ? String(valeur).slice(0, 10).split('-').reverse().join('/') : '—');

// 2.7.69 — code couleur des actions (même palette que l'historique 2.7.67) :
//   boutons ENTIÈREMENT colorés — Modifier = BLEU, Activité/Réactiver = VERT,
//   Retirer du TDR / Sortie du service = ROUGE.
const COULEUR_MODIFIER = { background: '#1d4ed8', borderColor: '#1d4ed8', color: '#fff' };
const COULEUR_ACTION_OK = { background: '#15803d', borderColor: '#15803d', color: '#fff' };
const COULEUR_RETIRER = { background: '#b91c1c', borderColor: '#b91c1c', color: '#fff' };

/** 2.7.45 — FENÊTRE GLISSANTE : les 7 prochains jours à partir d'AUJOURD'HUI
    (+0 … +6), chacun = { iso, nom, aujourd }. La table n'appartient plus à
    une semaine calendaire : une garde qui franchit le week-end et la semaine
    suivante s'y lit entièrement, jour par jour. */
const fenetre7Jours = () => Array.from({ length: 7 }, (_, i) => {
  const jour = new Date();
  jour.setDate(jour.getDate() + i);
  const iso = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;
  return { iso, nom: NOMS_JOURS[jour.getDay()], aujourd: i === 0 };
});

// 2.7.79 — « motif » : la RAISON de l'hospitalisation (ex. « Fièvre ») est un
// champ à part des fiches patient (migration 014, colonne patients.motif).
const vitePatient = { name: '', service: '', note: '', motif: '', admittedOn: '' };
const viteStaff = { name: '', role: 'DOCTOR', dutyStartOn: today(), dutyEndOn: today(), phone: '' };

export default function PatientsPage() {
  const toast = useToast();
  const [onglet, setOnglet] = useState('patients');
  const [patients, setPatients] = useState(null);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(null);
  const [editPatient, setEditPatient] = useState(null); // null | 'nouveau' | objet
  const [editStaff, setEditStaff] = useState(null);
  const [activite, setActivite] = useState(null);

  const charger = async () => {
    setError(null);
    try {
      const [listePatients, listeStaff] = await Promise.all([hopital.patients(), hopital.staff()]);
      setPatients(listePatients);
      setStaff(listeStaff);
    } catch (cause) {
      setError(cause);
    }
  };
  useEffect(() => { charger(); }, []);

  /** Tour de garde (2.7.45, RÈGLE DÉFINITIVE) : les 7 PROCHAINS JOURS à
      partir d'aujourd'hui (fenêtre GLISSANTE bien que le titre dise
      « semaine »). Pour chaque jour : les employés actifs dont la garde
      COUVRE ce jour — sous chaque nom, la DATE DU JOUR de la colonne
      (Samedi = 17/10, Dimanche = 18/10, Lundi = 19/10…), conforme à la
      maquette demandée. Les bornes sont purgées « AAAA-MM-JJ » (2.7.42). */
  const tdr = useMemo(() => {
    if (!staff) return [];
    return fenetre7Jours().map((fenetre, index) => {
      const isoJour = fenetre.iso;
      const personnes = [];
      for (const membre of staff) {
        if (!membre.active) continue;
        const debut = membre.dutyStartOn ? String(membre.dutyStartOn).slice(0, 10) : '';
        const fin = membre.dutyEndOn ? String(membre.dutyEndOn).slice(0, 10) : '';
        if (debut && fin && debut <= isoJour && fin >= isoJour) {
          personnes.push({
            nom: `${membre.name} (${ROLE_LABEL(membre.role)})`,
            dateJour: dateFr(isoJour)
          });
        }
      }
      return { jour: fenetre.nom, index, isoJour, aujourd: fenetre.aujourd, personnes };
    });
  }, [staff]);

  const basculerPatient = async patient => {
    try {
      await hopital.updatePatient(patient.id, { active: !patient.active });
      toast.success(patient.active ? `Patient « ${patient.name} » sorti du service.` : `Patient « ${patient.name} » réactivé.`);
      await charger();
    } catch (cause) { setError(cause); }
  };

  const basculerStaff = async membre => {
    try {
      await hopital.updateStaff(membre.id, { active: !membre.active });
      toast.success(membre.active ? `« ${membre.name} » retiré du tour de garde.` : `« ${membre.name} » de nouveau actif.`);
      await charger();
    } catch (cause) { setError(cause); }
  };

  return (
    <div className="stack">
      <Tabs
        items={[
          { value: 'patients', label: 'Patients hospitalisés' },
          { value: 'personnel', label: 'Personnel et tour de garde' }
        ]}
        value={onglet} onChange={setOnglet}
      />
      {error ? <ErrorBox error={error} /> : null}

      {onglet === 'patients' ? (
        <Card title={`${patients?.length ?? 0} patient(s)`}
          actions={<Btn variant="primary" icon={Plus} onClick={() => setEditPatient('nouveau')}>Nouveau patient</Btn>}>
          {patients === null ? <Spinner page /> : patients.length === 0 ? (
            <Empty>Aucun patient enregistré : créez le premier pour qu’il apparaisse à la caisse (vente « Carnet hôpital »).</Empty>
          ) : (
            // 2.7.36 — la colonne « Remarque » est remplacée par l'EMPLOYÉ
            // enregistreur ; la remarque reste dans la fiche du patient.
            // 2.7.69 — colonne « Action » CENTRÉE + espaces (apparaity).
            <Table columns={[
              // 2.7.79 — colonne « Motif » : la raison d'hospitalisation se
              // lit directement dans la liste des patients.
              // 2.7.82 — demande officine : la DATE DE SORTIE est rendue en
              // colonne (automatique : posée par « Sortie du service »), juste
              // à droite de l'admission.
              { label: 'Patient' }, { label: 'Service' }, { label: 'Motif' }, { label: 'Date d’admission' },
              { label: 'Date de sortie' },
              { label: 'Enregistré par' }, { label: 'État' }, { label: 'Action', center: true }
            ]}>
              {patients.map(patient => (
                <tr key={patient.id}>
                  <td><strong>{patient.name}</strong></td>
                  <td>{patient.service || '—'}</td>
                  <td className="wrap">{patient.motif || '—'}</td>
                  <td>{dateFr(patient.admittedOn)}</td>
                  <td>{dateFr(patient.dischargedOn)}</td>
                  <td>{patient.createdByName || '—'}</td>
                  <td>{patient.active ? <Badge tone="ok">en service</Badge> : <Badge tone="danger">sorti</Badge>}</td>
                  <td className="center">
                    <div className="actes">
                      <Btn size="sm" variant="ghost" icon={Pencil} style={COULEUR_MODIFIER} onClick={() => setEditPatient(patient)} aria-label="Modifier" />
                      <Btn size="sm" variant="ghost" style={patient.active ? COULEUR_RETIRER : COULEUR_ACTION_OK}
                        onClick={() => basculerPatient(patient)}>
                        {patient.active ? 'Sortie du service' : 'Réactiver'}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ) : (
        <>
          {/* TOUR DE GARDE — EMPLOI DU TEMPS des 7 PROCHAINS JOURS (2.7.45) :
              la fenêtre GLISSE chaque jour (plus de semaine fixe qui coupait
              les longues gardes) ; sous chaque nom, la DATE DU JOUR de la
              colonne ; chaque RANGÉE est séparée par UN trait continu. */}
          <Card title="Tour de garde de la semaine (les 7 prochains jours)">
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    {tdr.map(jour => (
                      <th key={jour.index} style={jour.aujourd ? { color: '#0b6b5b' } : undefined}>
                        {jour.jour}{jour.aujourd ? ' (aujourd’hui)' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* 2.7.41 — UNE RANGÉE <tr> PAR « ÉTAGE » D'EMPLOYÉS : le trait
                      de séparation court CONTINU du début à la fin du tableau
                      (plus les petits traits coupés case par case de la 2.7.40). */}
                  {Array.from({ length: Math.max(1, ...tdr.map(jour => jour.personnes.length)) }).map((_, rang) => (
                    <tr key={rang}>
                      {tdr.map(jour => {
                        const personne = jour.personnes[rang];
                        return (
                          <td key={jour.index}
                            style={{
                              verticalAlign: 'top',
                              ...(rang > 0 ? { borderTop: '1px solid #94a3b8' } : {})
                            }}>
                            {personne ? (
                              <div>
                                <Badge tone={jour.aujourd ? 'ok' : 'info'}>{personne.nom}</Badge>
                                {/* 2.7.45 — sous le nom : la DATE DU JOUR de
                                    la colonne (Samedi = 17/10, Dimanche =
                                    18/10, Lundi = 19/10…) — la maquette. */}
                                <div className="muted" style={{ fontSize: '.78rem', marginTop: 2 }}>
                                  {personne.dateJour}
                                </div>
                              </div>
                            ) : (rang === 0 ? <span className="muted">—</span> : null)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 2.7.69 — le long paragraphe explicatif « Emploi du temps des 7
                prochains jours, glissant jour après jour… » est RETIRÉ à la
                demande : la lecture par jour est devenue évidente à l'écran. */}
          </Card>

          <Card title={`${staff?.length ?? 0} employé(s)`}
            actions={<Btn variant="primary" icon={Plus} onClick={() => setEditStaff('nouveau')}>Nouvel employé</Btn>}>
            {staff === null ? <Spinner page /> : staff.length === 0 ? (
              <Empty>Aucun employé enregistré : créez un médecin ou une sage-femme pour les carnets de la caisse.</Empty>
            ) : (
              /* 2.7.69 — « Action » CENTRÉE, espace régulier entre les boutons
                 (.actes) et code couleur : Modifier = BLEU, Activité/Réactiver
                 = VERT, Retirer du TDR = ROUGE. */
              <Table columns={[
                { label: 'Employé' }, { label: 'Rôle' }, { label: 'Garde (du … au …)' },
                { label: 'Téléphone' }, { label: 'État' }, { label: 'Action', center: true }
              ]}>
                {staff.map(membre => (
                  <tr key={membre.id}>
                    <td><strong>{membre.name}</strong></td>
                    <td><Badge tone="info">{ROLE_LABEL(membre.role)}</Badge></td>
                    {/* 2.7.38 — dates de début et de fin de la garde, visibles en liste. */}
                    <td>
                      {membre.dutyStartOn && membre.dutyEndOn
                        ? `du ${dateFr(String(membre.dutyStartOn).slice(0, 10))} au ${dateFr(String(membre.dutyEndOn).slice(0, 10))}`
                        : <span className="muted">—</span>}
                    </td>
                    <td>{membre.phone || '—'}</td>
                    <td>{membre.active ? <Badge tone="ok">actif</Badge> : <Badge tone="danger">retiré</Badge>}</td>
                    <td className="center">
                      <div className="actes">
                        <Btn size="sm" variant="ghost" icon={Activity} style={COULEUR_ACTION_OK} onClick={() => setActivite(membre)}>Activité</Btn>
                        <Btn size="sm" variant="ghost" icon={Pencil} style={COULEUR_MODIFIER} onClick={() => setEditStaff(membre)} aria-label="Modifier" />
                        <Btn size="sm" variant="ghost" style={membre.active ? COULEUR_RETIRER : COULEUR_ACTION_OK}
                          onClick={() => basculerStaff(membre)}>
                          {membre.active ? 'Retirer du TDR' : 'Réactiver'}
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      {editPatient ? (
        <FormulairePatient
          initial={editPatient === 'nouveau' ? vitePatient : editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={async () => { setEditPatient(null); await charger(); }}
        />
      ) : null}
      {editStaff ? (
        <FormulaireStaff
          initial={editStaff === 'nouveau' ? viteStaff : editStaff}
          onClose={() => setEditStaff(null)}
          onSaved={async () => { setEditStaff(null); await charger(); }}
        />
      ) : null}
      {activite ? <ModalActivite membre={activite} onClose={() => setActivite(null)} /> : null}
    </div>
  );
}

/** Création / modification d'un patient hospitalisé. */
function FormulairePatient({ initial, onClose, onSaved }) {
  const toast = useToast();
  const edition = Boolean(initial.id);
  const [valeurs, setValeurs] = useState({
    name: initial.name || '', service: initial.service || '', note: initial.note || '',
    motif: initial.motif || '',           // 2.7.79 — raison de l'admission
    admittedOn: initial.admittedOn || today()
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const changer = cle => e => setValeurs(v => ({ ...v, [cle]: e.target.value }));

  const enregistrer = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const milay = { name: valeurs.name, service: valeurs.service, note: valeurs.note, motif: valeurs.motif, admittedOn: valeurs.admittedOn };
      if (edition) {
        await hopital.updatePatient(initial.id, milay);
        toast.success(`Patient « ${valeurs.name} » modifié.`);
      } else {
        await hopital.createPatient(milay);
        toast.success(`Patient « ${valeurs.name} » enregistré.`);
      }
      await onSaved();
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };

  return (
    <Modal title={edition ? `Modifier le patient — ${initial.name}` : 'Nouveau patient hospitalisé'} onClose={onClose}
      footer={<Btn variant="primary" disabled={busy} onClick={enregistrer}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>}>
      <form onSubmit={enregistrer} className="stack">
        <ErrorBox error={error} />
        <Field label="Nom du patient" hint="2 caractères au moins ; les homonymes se distinguent par le Service.">
          <Input value={valeurs.name} onChange={changer('name')} required autoFocus maxLength={180} />
        </Field>
        <Field label="Service (chambre, consultation…)" hint="Ex. : « Impt », « Maternité B », « Réa »…">
          <Input value={valeurs.service} onChange={changer('service')} maxLength={120} />
        </Field>
        {/* 2.7.79 — MOTIF d'hospitalisation : la raison qui a conduit le
            patient à l'hôpital (ex. « Fièvre ») ; elle repasse sur la liste
            des patients et sur les ordonnances de séjour. */}
        <Field label="Motif d’hospitalisation"
          hint="La raison de l’admission — ex. : Fièvre, Grippe, Suivi post-opératoire… (facultatif, 255 caractères)">
          <Input value={valeurs.motif} onChange={changer('motif')} maxLength={255} />
        </Field>
        {/* 2.7.36 — date d'admission à l'hôpital : début du séjour. */}
        <Field label="Date d’admission à l’hôpital"
          hint="Le jour de l'entrée du patient ; l'ordonnance de séjour la mentionne.">
          <Input type="date" value={valeurs.admittedOn} onChange={changer('admittedOn')} />
        </Field>
        <Field label="Remarque (facultative, interne)"
          hint="Cette remarque ne figure plus dans la liste des patients ; elle reste visible ici.">
          <Textarea value={valeurs.note} onChange={changer('note')} maxLength={255} />
        </Field>
      </form>
    </Modal>
  );
}

/** Création / modification d'un médecin ou d'une sage-femme. */
function FormulaireStaff({ initial, onClose, onSaved }) {
  const toast = useToast();
  const edition = Boolean(initial.id);
  const [valeurs, setValeurs] = useState({
    name: initial.name || '', role: initial.role || 'DOCTOR',
    // 2.7.38 — garde = PÉRIODE DE DATES OBLIGATOIRE (début ET fin).
    dutyStartOn: initial.dutyStartOn ? String(initial.dutyStartOn).slice(0, 10) : '',
    dutyEndOn: initial.dutyEndOn ? String(initial.dutyEndOn).slice(0, 10) : '',
    phone: initial.phone || ''
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const changer = cle => e => setValeurs(v => ({ ...v, [cle]: e.target.value }));

  const enregistrer = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!valeurs.dutyStartOn || !valeurs.dutyEndOn) {
        throw new Error('La PÉRIODE DE GARDE est obligatoire : choisissez la date de début ET la date de fin.');
      }
      if (valeurs.dutyEndOn < valeurs.dutyStartOn) {
        throw new Error('La fin de garde est AVANT le début : vérifiez les deux dates.');
      }
      const milay = {
        name: valeurs.name,
        role: valeurs.role,
        phone: valeurs.phone,
        dutyStartOn: valeurs.dutyStartOn,
        dutyEndOn: valeurs.dutyEndOn
      };
      if (edition) {
        await hopital.updateStaff(initial.id, milay);
        toast.success(`Employé « ${valeurs.name} » modifié.`);
      } else {
        await hopital.createStaff(milay);
        toast.success(`Employé « ${valeurs.name} » enregistré.`);
      }
      await onSaved();
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };

  return (
    <Modal title={edition ? `Modifier l’employé — ${initial.name}` : 'Nouveau médecin / sage-femme'} onClose={onClose}
      footer={<Btn variant="primary" disabled={busy} onClick={enregistrer}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>}>
      <form onSubmit={enregistrer} className="stack">
        <ErrorBox error={error} />
        <Field label="Nom de l’employé" hint="Médecin ou sage-femme qui arrive avec le carnet.">
          <Input value={valeurs.name} onChange={changer('name')} required autoFocus maxLength={120} />
        </Field>
        <Field label="Rôle">
          <Select value={valeurs.role} onChange={changer('role')}>
            <option value="DOCTOR">Médecin</option>
            <option value="MIDWIFE">Sage-femme</option>
          </Select>
        </Field>
        {/* 2.7.38 — OBLIGATOIRE : le début ET la fin de sa période de garde. */}
        <Field label="Début de la période de garde (obligatoire)"
          hint="Premier jour où cet employé tient la garde.">
          <Input type="date" value={valeurs.dutyStartOn} onChange={changer('dutyStartOn')} required />
        </Field>
        <Field label="Fin de la période de garde (obligatoire)"
          hint="Dernier jour de garde (compris) — ne peut pas être antérieur au début.">
          <Input type="date" value={valeurs.dutyEndOn} onChange={changer('dutyEndOn')} min={valeurs.dutyStartOn || undefined} required />
        </Field>
        <Field label="Téléphone (facultatif)">
          <Input value={valeurs.phone} onChange={changer('phone')} maxLength={40} />
        </Field>
      </form>
    </Modal>
  );
}

/** Vue « Activité » d'un prescripteur : ses carnets, ses patients, ses médicaments. */
function ModalActivite({ membre, onClose }) {
  const [donnees, setDonnees] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    hopital.activiteStaff(membre.id).then(setDonnees).catch(setError);
  }, [membre.id]);

  return (
    <Modal wide title={`Activité de ${membre.name} — carnets prescrits`} onClose={onClose}>
      {error ? <ErrorBox error={error} /> : null}
      {donnees === null && !error ? <Spinner page /> : null}
      {donnees && donnees.ventes.length === 0 ? (
        <Empty>Aucun carnet délivré pour cet employé pour l’instant.</Empty>
      ) : null}
      {donnees && donnees.ventes.length ? (
        <div className="stack">
          <p className="muted" style={{ fontSize: '.85rem' }}>
            {donnees.ventes.length} carnet(s) récent(s) — les 60 derniers, du plus récent au plus ancien.
          </p>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th><th>Référence</th><th>Patient</th>
                  <th>Médicaments du carnet</th><th className="num">Montant (interne)</th>
                </tr>
              </thead>
              <tbody>
                {donnees.ventes.map(vente => (
                  <tr key={vente.saleId}>
                    <td>{vente.date ? new Date(vente.date).toLocaleString('fr-FR') : '—'}</td>
                    <td>{vente.reference}</td>
                    <td><strong>{vente.patient}</strong>{vente.service ? <Badge tone="info" style={{ marginLeft: 6 }}>{vente.service}</Badge> : null}</td>
                    <td className="wrap">
                      {vente.lignes.map((ligne, index) => (
                        <div key={index}>
                          {ligne.product} — <strong>{ligne.saleQuantity ?? ligne.quantity}</strong>{' '}
                          {/* 2.7.84 — unité vendue quelconque (chaîne) + codes legacy. */}
                          {libelleQuantiteUnite(ligne.saleUnit || 'BOX', Number(ligne.saleQuantity ?? ligne.quantity))}
                        </div>
                      ))}
                    </td>
                    <td className="num">{money(vente.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: '.8rem' }}>
            Rappel : l’ordonnance imprimée remise au patient N’AFFICHE PAS de montant ;
            la colonne ci-dessus sert seulement au suivi interne de la pharmacie.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}