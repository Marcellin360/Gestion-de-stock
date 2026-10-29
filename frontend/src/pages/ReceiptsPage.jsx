// Réceptions : entrée de marchandise, création des lots, frais répartis,
// recalcul du coût de revient (CMP) et du prix de vente.
//
// 2.7.8 — le bouton « Bon » devient « Détail » : le document s'ouvre dans une
// boîte de dialogue de l'application (et non dans un nouvel onglet) avec un
// bouton « Télécharger » immédiat.
//
// 2.7.78 — nouvelle demande de l'officine (ergonomie du dépôt) :
//   • INTERFACE EN DEUX SECTIONS, même forme que « Historique de transfert » :
//     carte 1 = titre « Réceptions (dépôt) » + saisie ENTRE DEUX DATES
//     (« Du … Au … ») ; carte 2 = la liste « N réception(s) sur la période » ;
//   • la RECHERCHE monte dans la carte de la liste, À DROITE, avec le libellé
//     « Recherche » tout court devant le champ (la mention « (LIKE) » disparaît) ;
//   • colonne « Action » au-dessus des boutons, CENTRÉE : « Modifier » en
//     BLEU plein, « Détail » en VERT plein, petit espace régulier entre eux ;
//   • la boîte « Détail » n'a PLUS de bouton « Imprimer » : « Télécharger »
//     seul enregistre DIRECTEMENT le PDF du bon (`?fmt=pdf`, serveur 2.7.78) ;
//   • le paragraphe explicatif sous la liste (« "Détail" ouvre le bon… ») est
//     SUPPRIMÉ, comme les autres textes d'aide déjà retirés.
import { useCallback, useEffect, useState } from 'react';
import { PackagePlus, Eye, SquarePen, Gavel, Check, XCircle } from 'lucide-react';
import { documents as documentsApi, stock } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Table, Textarea } from '../components/ui.jsx';
import DocumentModal from '../components/DocumentModal.jsx';
import ReceiptForm from '../forms/ReceiptForm.jsx';
import { dateTime, integer, money } from '../utils/format.js';
// 2.7.78 — code couleur plein (mêmes tons que la vente, 2.7.67) :
// « Modifier » = BLEU, « Détail » = VERT.
import { COULEUR_DETAIL, COULEUR_IMPRIMER } from '../components/SaleHistoryModal.jsx';

// 2.7.34 — teboka ③ : états d'une demande de correction (badge + action admin).
const ETATS_CORRECTION = {
  PENDING: { label: 'En attente de validation', tone: 'warn' },
  VALIDATED: { label: 'Appliquée', tone: 'ok' },
  REFUSED: { label: 'Refusée', tone: 'danger' }
};

export default function ReceiptsPage() {
  // 2.7.85 — productLabel = nom + présentation (« Alcool médical — Flacon 250 ml »)
  // 2.7.86 — product : présentation empilée SOUS le nom
  const { documents, product, productName, productLabel, supplierName, lotNumber, refresh } = useData();
  const { can } = useAuth();
  const toast = useToast();
  const [creation, setCreation] = useState(false);
  // Détail ouvert : { id, ajustements } — les ajustements ne sont renseignés
  // qu'après une nouvelle réception (numéro de lot déjà utilisé).
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  // 2.7.34 — teboka ③ : workflow de correction (dépôt propose → admin tranche).
  const [corrections, setCorrections] = useState([]);
  const [modifier, setModifier] = useState(null);      // { receipt, lignes }
  const [trancher, setTrancher] = useState(null);      // correction (détail serveur)
  const [noteDecision, setNoteDecision] = useState('');
  const [busyDecision, setBusyDecision] = useState(false);
  const estAdmin = can(['settings']);

  // 2.7.32 — recherche (médicament, référence, fournisseur, date) ; 2.7.78 —
  // la période se filtre ENTRE DEUX DATES (« Du … Au … »), comme le menu
  // « Historique de transfert », et la recherche passe à droite de la liste.
  const [filtres, setFiltres] = useState({ de: '', au: '' });
  const [recherche, setRecherche] = useState('');
  const receptions = documents
    .filter(doc => doc.kind === 'RECEIPT')
    .filter(doc => {
      if (!recherche) return true;
      const produits = (doc.lines || []).map(ligne => productLabel(ligne.productId)).join(' ');   // 2.7.85 : la recherche voit aussi la présentation
      const cible = `${doc.reference} ${supplierName(doc.supplierId)} ${produits} ${dateTime(doc.date)}`.toLowerCase();
      return cible.includes(recherche.toLowerCase());
    })
    // 2.7.78 — borne « Du » (incluse) : la réception est à partir de ce jour.
    .filter(doc => (filtres.de ? String(doc.date).slice(0, 10) >= filtres.de : true))
    // 2.7.78 — borne « Au » (incluse) : la réception s'arrête à ce jour.
    .filter(doc => (filtres.au ? String(doc.date).slice(0, 10) <= filtres.au : true));

  // Le contenu du détail vient de l'API : une seule source pour la liste et la
  // boîte de dialogue (quantités, coûts, dates d'expiration, mouvements).
  const chargerDetail = useCallback(async () => {
    const doc = await documentsApi.detail('RECEIPT', detail.id);
    return {
      reference: doc.reference,
      type: 'Réception (entrée au dépôt)',
      date: doc.date,
      statut: doc.status === 'VALIDATED' ? 'validé' : 'annulé',
      total: doc.costTotal,
      imprimable: `/documents/RECEIPT/${doc.id}/print`,
      // 2.7.78 — boîte « Détail » de la réception : « Télécharger » enregistre
      // DIRECTEMENT le PDF du bon (`?fmt=pdf` servi par le serveur, 2.7.78).
      pdf: true,
      infos: [
        { label: 'Fournisseur', valeur: supplierName(doc.supplierId) },
        { label: 'Destination', valeur: 'Dépôt (réserve)' },
        { label: 'Frais de la facture', valeur: money(doc.fees) },
        { label: 'Remarque', valeur: doc.note || '—' }
      ],
      lignes: (doc.lines || []).map(ligne => ({
        product: productLabel(ligne.productId),   // 2.7.85 — présentation affichée
        code: ligne.code || '',
        lot: ligne.number || lotNumber(ligne.lotId),
        expiresOn: ligne.expiresOn,
        quantity: ligne.quantity,
        unitCost: ligne.unitCost,
        // « value » reste un NOMBRE : c'est DocumentModal qui le formate en Ar.
        // (Avant la 2.7.10, money() était appliqué ici puis une seconde fois dans
        // la boîte de dialogue → « NaN Ar » dans la colonne Valeur.)
        value: Number(ligne.unitCost || 0) * Number(ligne.quantity || 0)
      }))
    };
  }, [detail?.id, productName, supplierName, lotNumber]);

  // Teboka ③ : demandes de correction (rechargées après chaque action).
  const chargerCorrections = useCallback(async () => {
    try {
      const reponse = await stock.corrections();
      setCorrections(reponse.rows || []);
    } catch (cause) {
      setError(cause);
    }
  }, []);
  useEffect(() => { chargerCorrections(); }, [chargerCorrections]);

  // Réception → correction en attente (badge dans la liste + bouton bloqué).
  const enAttenteDe = new Map(corrections.filter(c => c.status === 'PENDING').map(c => [c.receiptId, c]));

  // Teboka ③ : « Modifier » — le dépôt prépare une demande sur la réception
  // VALIDÉE, pré-remplie avec son contenu actuel (lignes complètes via l'API).
  const ouvrirModification = async reception => {
    setError(null);
    try {
      const doc = await documentsApi.detail('RECEIPT', reception.id);
      setModifier({ receipt: doc, lignes: doc.lines || [] });
    } catch (cause) {
      setError(cause);
    }
  };

  // Teboka ③ : ouverture du dossier (comparaison « actuel » vs « proposé »).
  const ouvrirTrancher = async correction => {
    setError(null);
    setNoteDecision('');
    try {
      setTrancher(await stock.correctionDetail(correction.id));
    } catch (cause) {
      setError(cause);
    }
  };

  const decider = async decision => {
    if (decision === 'REFUSE' && noteDecision.trim().length < 3) {
      setError({ message: 'Expliquez le refus au dépôt (3 caractères minimum).' });
      return;
    }
    setBusyDecision(true);
    setError(null);
    try {
      if (decision === 'VALIDATE') {
        await stock.validerCorrection(trancher.id, noteDecision.trim());
        toast.success(`Correction ${trancher.reference} appliquée : la réception a été remplacée par la version corrigée.`);
      } else {
        await stock.refuserCorrection(trancher.id, noteDecision.trim());
        toast.success(`Correction ${trancher.reference} refusée : la réception reste telle quelle.`);
      }
      setTrancher(null);
      await Promise.all([refresh(), chargerCorrections()]);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusyDecision(false);
    }
  };

  return (
    <>
      {/* ── CARTE 1 (2.7.78) : titre + période du/au — même forme que le menu
          « Historique de transfert » (2.7.72). ── */}
      <Card title="Réceptions (dépôt)"
        actions={<Btn variant="primary" icon={PackagePlus} onClick={() => setCreation(true)}>Nouvelle réception</Btn>}>
        <ErrorBox error={error} />

        {/* 2.7.78 — la période se filtre ENTRE DEUX DATES, comme « Transfert » :
            chaque borne est un calendrier ; les deux bornes sont incluses. */}
        <div className="row row--tight" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '.85rem', fontWeight: 600 }} aria-hidden="true">Du</span>
          <Input type="date" value={filtres.de} max={filtres.au}
            onChange={e => setFiltres(f => ({ ...f, de: e.target.value }))}
            style={{ width: 150 }} aria-label="Du (début de la période)" />
          <span className="muted" style={{ fontSize: '.85rem', fontWeight: 600 }} aria-hidden="true">Au</span>
          <Input type="date" value={filtres.au} min={filtres.de || undefined}
            onChange={e => setFiltres(f => ({ ...f, au: e.target.value }))}
            style={{ width: 150 }} aria-label="Au (fin de la période)" />
          {filtres.de || filtres.au ? (
            <Btn variant="ghost" onClick={() => setFiltres({ de: '', au: '' })}>Toutes les réceptions</Btn>
          ) : null}
        </div>
      </Card>

      {/* ── CARTE 2 (2.7.78) : la liste — titre dynamique + recherche À DROITE,
          libellé « Recherche » court devant le champ (plus de « (LIKE) »). ── */}
      <Card title={`${receptions.length} réception(s) sur la période`}
        actions={<div className="row row--tight" style={{ alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '.85rem', fontWeight: 600 }}>Recherche</span>
          <Input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Médicament, référence REC-…, fournisseur, date…" style={{ width: 260 }}
            aria-label="Recherche sur les réceptions"
            title="Filtrer : une partie du médicament, de la référence, du fournisseur ou de la date suffit" />
        </div>} flush>
        {receptions.length === 0 ? <Empty>Aucune réception sur cette période (changez les dates ou la recherche).</Empty> : (
          <Table columns={[
            // 2.7.31 — la liste se lit au contenu : plus de « Référence /
            // Fournisseur / Destination » mais « Médicament, Quantité,
            // Coût unitaire » (la référence reste dans le Détail et le bon).
            // 2.7.78 — « Action » demandée au-dessus des boutons, CENTRÉE.
            { label: 'Date' }, { label: 'Médicament(s)' }, { label: 'Fabriquant' },   // 2.7.49
            { label: 'Quantité', num: true },
            { label: 'Coût unitaire' }, { label: 'Coût total', num: true }, { label: 'Action', center: true }
          ]}>
            {receptions.map(reception => {
              const lignes = reception.lines || [];
              return (
                <tr key={reception.id} title={`${reception.reference} · ${supplierName(reception.supplierId)} — entrée au dépôt (réserve)`}>
                  <td className="nowrap">{dateTime(reception.date)}</td>
                  <td className="wrap">
                    {lignes.map((ligne, i) => (
                      <div key={i}>
                        {/* 2.7.86 — nom en gras, présentation JUSTE EN DESSOUS */}
                        <strong>{productName(ligne.productId)}</strong>
                        {product(ligne.productId)?.presentation
                          ? <div className="muted" style={{ fontSize: '.8rem' }}>{product(ligne.productId).presentation}</div>
                          : null}
                      </div>
                    ))}
                    {lignes.length === 0 ? <span className="muted">—</span> : null}
                  </td>
                  {/* 2.7.49 — fabricant saisi à la réception, affiché lot par lot */}
                  <td className="wrap">
                    {lignes.map((ligne, i) => <div key={i}>{ligne.manufacturer || '—'}</div>)}
                  </td>
                  <td className="num">
                    {lignes.map((ligne, i) => <div key={i}>{integer(ligne.quantity)}</div>)}
                  </td>
                  <td className="num">
                    {lignes.map((ligne, i) => <div key={i}>{money(ligne.unitCost)}</div>)}
                  </td>
                  <td className="num">{money(reception.costTotal)}</td>
                  <td className="center nowrap">
                    {/* 2.7.78 — « Modifier » en BLEU plein, « Détail » en VERT
                        plein, petit espace régulier entre les deux (.actes). */}
                    <span className="actes">
                      {/* Teboka ③ : bouton « Modifier » (dépôt propose → admin tranche).
                          Grisé tant qu'une correction est déjà en attente. */}
                      {reception.status === 'VALIDATED' ? (
                        enAttenteDe.has(reception.id) ? (
                          <Badge tone="warn" title={`Correction ${enAttenteDe.get(reception.id).reference} en attente de validation par l’administrateur`}>
                            correction en attente
                          </Badge>
                        ) : (
                          <Btn variant="ghost" style={COULEUR_DETAIL} icon={SquarePen} title={`Proposer une correction de ${reception.reference} — envoyée à l’administrateur qui valide ou refuse (impossible si un lot a déjà bougé)`}
                            onClick={() => ouvrirModification(reception)}>Modifier</Btn>
                        )
                      ) : null}
                      <Btn variant="ghost" style={COULEUR_IMPRIMER} icon={Eye} title={`Voir le bon ${reception.reference} (fenêtre, téléchargement PDF immédiat)`}
                        onClick={() => setDetail({ id: reception.id, ajustements: [] })}>Détail</Btn>
                    </span>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        {/* 2.7.78 — le paragraphe explicatif qui suivait la liste
            (« "Détail" ouvre le bon dans une fenêtre… ») est SUPPRIMÉ. */}
      </Card>

      {/* Teboka ③ : demandes de correction — le dépôt suit les siennes,
          l'administrateur tranche celles qui attendent. */}
      {corrections.length ? (
        <Card title={`Corrections de réception (${corrections.filter(c => c.status === 'PENDING').length} en attente)`}
          actions={<Badge tone={corrections.some(c => c.status === 'PENDING') ? 'warn' : 'ok'}>
            {corrections.some(c => c.status === 'PENDING') ? 'à trancher' : 'à jour'}
          </Badge>}>
          <Table columns={[
            { label: 'Demande' }, { label: 'Réception' }, { label: 'Motif' }, { label: 'Proposée par' },
            { label: 'État' }, { label: 'Décision' }, { label: '' }
          ]}>
            {corrections.map(correction => {
              const etat = ETATS_CORRECTION[correction.status] || { label: correction.status, tone: 'default' };
              return (
                <tr key={correction.id}>
                  <td className="nowrap"><strong>{correction.reference}</strong><br />
                    <small className="muted">{dateTime(correction.createdAt)}</small></td>
                  <td className="nowrap">{correction.receiptReference}</td>
                  <td className="wrap">{correction.reason}</td>
                  <td className="wrap">{correction.proposedByName}</td>
                  <td><Badge tone={etat.tone}>{etat.label}</Badge></td>
                  <td className="wrap">
                    {correction.decidedAt
                      ? <>{dateTime(correction.decidedAt)} par {correction.decidedByName || '—'}
                        {correction.decisionNote ? <><br /><small className="muted">« {correction.decisionNote} »</small></> : null}</>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="right">
                    <Btn variant="ghost" icon={estAdmin && correction.status === 'PENDING' ? Gavel : Eye}
                      title={estAdmin && correction.status === 'PENDING'
                        ? 'Comparer la version actuelle et la version corrigée, puis valider ou refuser'
                        : 'Voir le dossier de la correction'}
                      onClick={() => ouvrirTrancher(correction)}>
                      {estAdmin && correction.status === 'PENDING' ? 'Trancher' : 'Voir'}
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      ) : null}

      {creation ? (
        <Modal title="Nouvelle réception" onClose={() => setCreation(false)} wide>
          <ReceiptForm onCancel={() => setCreation(false)} onDone={async reception => {
            toast.success(`Réception ${reception.reference} enregistrée.`);
            setCreation(false);
            // La boîte de dialogue de détail s'ouvre sur la réception qui vient d'être
            // créée, en signalant les numéros de lot réutilisés s'il y en a.
            setDetail({ id: reception.id, ajustements: reception.ajustements || [] });
            await refresh();
          }} />
        </Modal>
      ) : null}

      {/* 2.7.78 — boîte « Détail » du bon : « Télécharger » seul, en vert, qui
          enregistre DIRECTEMENT le PDF ; plus de bouton « Imprimer » ici. */}
      {detail ? (
        <DocumentModal titre={`Réception ${receptions.find(r => r.id === detail.id)?.reference || ''}`.trim()}
          charger={chargerDetail} ajustements={detail.ajustements} sansImprimer onClose={() => setDetail(null)} />
      ) : null}

      {/* Teboka ③ : formulaire « Modifier » — même formulaire que la création,
          pré-rempli, adressé à l'administrateur avec un motif. */}
      {modifier ? (
        <Modal title={`Proposer une correction — ${modifier.receipt.reference}`}
          onClose={() => setModifier(null)} wide>
          <ReceiptForm
            correction={{ receipt: modifier.receipt, lignes: modifier.lignes }}
            onCancel={() => setModifier(null)}
            onDone={async correction => {
              toast.success(`Correction ${correction.reference || ''} envoyée à l’administrateur : la réception ne change qu’après sa validation.`);
              setModifier(null);
              await chargerCorrections();
            }} />
        </Modal>
      ) : null}

      {/* Teboka ③ : dossier de correction — comparaison actuel vs proposé,
          puis validation ou refus motivé (administrateur). */}
      {trancher ? (
        <Modal wide
          title={`Correction ${trancher.reference} — réception ${trancher.receiptReference}`}
          onClose={() => setTrancher(null)}
          footer={<>
            <div className="muted" style={{ alignSelf: 'center' }}>
              Proposée par {trancher.proposedByName} le{' '}
              {new Date(trancher.createdAt).toLocaleDateString('fr-FR')} — motif : « {trancher.reason} »
            </div>
            <div className="spacer" />
            {estAdmin && trancher.status === 'PENDING' ? (
              <>
                <Btn variant="danger" icon={XCircle} onClick={() => decider('REFUSE')}
                  disabled={busyDecision || noteDecision.trim().length < 3}
                  title="Refuser : la réception ne change pas ; le motif du refus est renvoyé au dépôt">
                  Refuser
                </Btn>
                <Btn variant="primary" icon={Check} onClick={() => decider('VALIDATE')} disabled={busyDecision}
                  title="Valider : la réception est remplacée par la version corrigée (mouvements, lots et prix recalculés)">
                  Valider la correction
                </Btn>
              </>
            ) : (
              <Btn variant="primary" onClick={() => setTrancher(null)}>Fermer</Btn>
            )}
          </>}>
          <ErrorBox error={error} />
          {trancher.status !== 'PENDING' ? (
            <div className={`banner banner--${trancher.status === 'VALIDATED' ? 'ok' : 'warn'}`}>
              {trancher.status === 'VALIDATED'
                ? `Correction appliquée le ${new Date(trancher.decidedAt).toLocaleDateString('fr-FR')} par ${trancher.decidedByName || '—'}.`
                : `Correction refusée le ${new Date(trancher.decidedAt).toLocaleDateString('fr-FR')} par ${trancher.decidedByName || '—'}${trancher.decisionNote ? ` : « ${trancher.decisionNote} »` : '.'}`}
            </div>
          ) : null}
          <div className="grid grid--2" style={{ alignItems: 'start' }}>
            <div>
              <h3>Actuel (en vigueur)</h3>
              <table className="data">
                <thead><tr><th>Médicament</th><th>Lot</th><th className="num">Quantité</th><th className="num">Prix d’achat</th></tr></thead>
                <tbody>
                  {(trancher.actuelles || []).map((ligne, i) => (
                    <tr key={i}>
                      <td className="wrap">
                        {/* 2.7.86 — nom en gras, présentation JUSTE EN DESSOUS */}
                        <strong>{productName(ligne.productId)}</strong>
                        {product(ligne.productId)?.presentation
                          ? <div className="muted" style={{ fontSize: '.8rem' }}>{product(ligne.productId).presentation}</div>
                          : null}
                      </td>
                      <td className="wrap">{ligne.number}</td>
                      <td className="num">{integer(ligne.quantity)}</td>
                      <td className="num">{money(ligne.purchasePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: '.82rem' }}>
                Frais : {money(trancher.receipt?.fees || 0)} · fournisseur actuel conservé sauf si corrigé.
              </p>
            </div>
            <div>
              <h3>Proposé (version corrigée)</h3>
              <table className="data">
                <thead><tr><th>Médicament</th><th>Lot</th><th className="num">Quantité</th><th className="num">Prix d’achat</th></tr></thead>
                <tbody>
                  {(trancher.payload?.lines || []).map((ligne, i) => (
                    <tr key={i}>
                      <td className="wrap">
                        {/* 2.7.86 — nom en gras, présentation JUSTE EN DESSOUS */}
                        <strong>{productName(ligne.productId)}</strong>
                        {product(ligne.productId)?.presentation
                          ? <div className="muted" style={{ fontSize: '.8rem' }}>{product(ligne.productId).presentation}</div>
                          : null}
                      </td>
                      <td className="wrap">{ligne.number}</td>
                      <td className="num">{integer(ligne.quantity)}</td>
                      <td className="num">{money(ligne.purchasePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: '.82rem' }}>
                Frais : {money(trancher.payload?.fees || 0)} · nouveau fournisseur : {supplierName(trancher.payload?.supplierId) || 'inchangé'}.
              </p>
            </div>
          </div>
          {estAdmin && trancher.status === 'PENDING' ? (
            <Field label="Note de décision (facultative pour valider, obligatoire pour refuser)">
              <Textarea value={noteDecision} onChange={e => setNoteDecision(e.target.value)}
                placeholder="Ex. : prix vérifié sur le bon du fournisseur — ou : les quantités ne correspondent pas au bon, refusé…" />
            </Field>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}