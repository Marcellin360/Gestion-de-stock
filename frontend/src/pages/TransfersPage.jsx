// Historique de transfert (2.7.11 — nouveau titre du menu « Transferts dépôt →
// pharmacie ») : l'écran qui remplace les commandes et les retours. Il montre
// ce qui est passé de la réserve au comptoir, quand, par qui et pour quel
// motif — avec le détail complet de chaque transfert (bouton « Détail »).
//
// 2.7.8 — le bouton « Bordereau » est retiré : tout se fait depuis « Détail »,
// qui ouvre une boîte de dialogue (date, valeur, lots, bouton Télécharger).
//
// 2.7.72 — nouvelle demande de l'officine :
//   • INTERFACE EN DEUX SECTIONS, comme le menu « Stock » : carte 1 = titre
//     « Historique de transfert » et saisie ENTRE DEUX DATES (« Du … Au … »),
//     carte 2 = la liste « N transfert(s) sur la période » avec sa recherche ;
//   • colonne « ACTION » demandée au-dessus du bouton « Détail », et le
//     libellé « Action » CENTRÉ (Table supporte `center: true` — 2.7.67) ;
//   • bouton « Détail » en BLEU plein (tons de la vente, COULEUR_DETAIL) ;
//   • dans la boîte « Détail » : « Télécharger » ET « Imprimer » produisent le
//     VRAI PDF du bordereau (`?fmt=pdf` côté serveur, transfertPdf.js) —
//     plus de fichier .html déguisé ni d'erreur au téléchargement.
//
// 2.7.79 — nouvelles demandes de l'officine :
//   ① colonne « Quantité » RENOMMÉE « Quantité transférée » ;
//   ② colonne « Stock Final » ajoutée : le stock actuel du médicament AU
//     COMPTOIR (pharmacie), lu en direct ;
//   ③ bouton « Modifier » (icône crayon) : CORRECTION D'UN TRANSFERT erroné —
//     même discipline que les réceptions (2.7.34, teboka ③) : le dépôt PROPOSE
//     (motif + quantités corrigées), la demande ATTEND, et seul un
//     ADMINISTRATEUR valide ou refuse (carte « Corrections de transfert » en
//     bas). Possible tant qu'aucun lot du transfert n'a bougé depuis.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Eye, Gavel, Search, SquarePen, XCircle } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Table, Textarea } from '../components/ui.jsx';
import DocumentModal from '../components/DocumentModal.jsx';
import TransferForm from '../forms/TransferForm.jsx';
import TransferCorrectionForm from '../forms/TransferCorrectionForm.jsx';
import { dateTime, integer, money } from '../utils/format.js';
// 2.7.72 — bleu « Détail » : même ton que la vente (2.7.67) ;
// 2.7.83 — le « Détail » de l'historique passe en VERT plein (demande du
// dépôt) ; le bouton « Modifier » (correction) conserve le BLEU.
import { COULEUR_DETAIL, COULEUR_IMPRIMER } from '../components/SaleHistoryModal.jsx';

// 2.7.79 — états d'une demande de correction de transfert (badge + action
// admin), mêmes libellés que les corrections de réception (2.7.34).
const ETATS_CORRECTION = {
  PENDING: { label: 'En attente de validation', tone: 'warn' },
  VALIDATED: { label: 'Appliquée', tone: 'ok' },
  REFUSED: { label: 'Refusée', tone: 'danger' }
};

/** ② « Stock Final » : quantités éventuellement DÉCIMALES après des ventes au
    détail (8,3 boîtes) — 3 décimales maximum, virgule française. */
const formatStock = valeur => {
  const nombre = Number(valeur);
  if (Number.isInteger(nombre)) return integer(nombre);
  return String(Number(nombre.toFixed(3))).replace('.', ',');
};

export default function TransfersPage() {
  const { documents, refresh, products, productName, lots } = useData();
  // 2.7.20 — le profil sert à masquer « Nouveau transfert » côté pharmacie.
  const { can, user } = useAuth();
  const toast = useToast();
  const [creation, setCreation] = useState(false);
  const [detail, setDetail] = useState(null);
  // 2.7.72 — la période se choisit désormais ENTRE DEUX DATES (« Du … Au … »,
  // comme le menu « Stock ») et la recherche passe dans la carte de la liste.
  const [filtres, setFiltres] = useState({ de: '', au: '' });
  const [recherche, setRecherche] = useState('');
  const [error, setError] = useState(null);
  // 2.7.79 — ③ CORRECTIONS de transfert : le dépôt propose, l'admin tranche.
  const [corrections, setCorrections] = useState([]);
  const [modifier, setModifier] = useState(null);       // transfert à corriger
  const [trancher, setTrancher] = useState(null);       // correction (détail serveur)
  const [noteDecision, setNoteDecision] = useState('');
  const [busyDecision, setBusyDecision] = useState(false);
  const estAdmin = can(['settings']);

  // Toutes les lignes « transfert » des documents récents, les plus récents d'abord.
  const transferts = useMemo(() => documents
    .filter(doc => doc.kind === 'TRANSFER')
    .filter(doc => { if (!recherche.trim()) return true;
      const produits = (doc.lines || []).map(ligne => productName(ligne.productId)).join(' ');
      return `${doc.reference} ${doc.reason} ${produits}`.toLowerCase().includes(recherche.trim().toLowerCase());
    })
    // 2.7.72 — borne « Du » (incluse) : la date du transfert est à partir de ce jour.
    .filter(doc => (filtres.de ? String(doc.date).slice(0, 10) >= filtres.de : true))
    // 2.7.72 — borne « Au » (incluse) : la date du transfert s'arrête à ce jour.
    .filter(doc => (filtres.au ? String(doc.date).slice(0, 10) <= filtres.au : true)),
    [documents, filtres, recherche, productName]);

  const valides = transferts.filter(doc => doc.status === 'VALIDATED');
  const valeurTotale = valides.reduce((somme, doc) => somme + Number(doc.costTotal || 0), 0);

  // ② 2.7.80 — « Stock Final » = stock ACTUEL du médicament AU DÉPÔT (après
  // le transfert la pharmacie est créditée, mais ce que l'historique veut
  // lire c'est ce qu'il reste à la réserve) ; somme des lots du dépôt.
  const stockFinalDepot = useMemo(() => {
    const somme = new Map();
    for (const lot of lots || []) {
      if (lot.location !== 'DEPOT') continue;
      somme.set(lot.productId, (somme.get(lot.productId) || 0) + Number(lot.quantity || 0));
    }
    return somme;
  }, [lots]);

  const ouvert = transfert => {
    setError(null);
    setDetail(transfert);
  };

  // ③ Demandes de correction (rechargées après chaque action).
  const chargerCorrections = useCallback(async () => {
    try {
      const reponse = await stock.correctionsTransfert();
      setCorrections(reponse.rows || []);
    } catch (cause) {
      setError(cause);
    }
  }, []);
  useEffect(() => { chargerCorrections(); }, [chargerCorrections]);

  // Transfert → correction en attente (badge dans la liste + bouton bloqué).
  const enAttenteDe = new Map(corrections.filter(c => c.status === 'PENDING').map(c => [c.transferId, c]));

  const ouvrirTrancher = async correction => {
    setError(null);
    setNoteDecision('');
    try {
      setTrancher(await stock.correctionTransfertDetail(correction.id));
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
        await stock.validerCorrectionTransfert(trancher.id, noteDecision.trim());
        toast.success(`Correction ${trancher.reference} appliquée : le transfert porte la version corrigée (stock remis au millimètre).`);
      } else {
        await stock.refuserCorrectionTransfert(trancher.id, noteDecision.trim());
        toast.success(`Correction ${trancher.reference} refusée : le transfert reste tel quel.`);
      }
      setTrancher(null);
      await Promise.all([refresh(), chargerCorrections()]);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusyDecision(false);
    }
  };

  // L'API renvoie { transfer, lines } : le transfert (en-tête) et ses lignes déjà
  // mises en forme (médicament, lot, quantité, coût unitaire, valeur).
  const chargerDetail = useCallback(async () => {
    const { transfer, lines } = await stock.transfer(detail.id);
    return {
      reference: transfer.reference,
      type: 'Transfert dépôt → pharmacie',
      date: transfer.createdAt || transfer.date,
      statut: transfer.status === 'VALIDATED' ? 'validé' : 'annulé',
      total: transfer.costTotal,
      imprimable: `/documents/TRANSFER/${transfer.id}/print`,
      // 2.7.72 — boîte « Détail » : Télécharger/Imprimer enregistrent le PDF du bordereau.
      pdf: true,
      infos: [
        { label: 'Sens', valeur: 'Dépôt (réserve) → Pharmacie (comptoir)' },
        { label: 'Motif', valeur: transfer.reason || '—' },
        { label: 'Remarque', valeur: transfer.note || '—' }
      ],
      lignes: (lines || []).map(ligne => ({
        product: ligne.product,
        code: ligne.code === '—' ? '' : ligne.code,
        lot: ligne.lot,
        expiresOn: ligne.expiresOn,
        quantity: ligne.quantity,
        unitCost: ligne.unitCost,
        value: ligne.value
      }))
    };
  }, [detail?.id]);

  return (
    <>
      {/* ── CARTE 1 (2.7.72) : titre + période du/au — comme le menu « Stock ». */}
      <Card title="Historique de transfert"
        actions={<>
          <Badge tone="info">Valeur transférée : {money(valeurTotale)}</Badge>
          {/* 2.7.20 — le seed donne la permission 'transfer' à la pharmacie aussi,
              mais « Nouveau transfert » n'a de sens qu'au DÉPÔT : le bouton est
              MASQUÉ côté pharmacie (sur le Pharmacie ihany), l'historique reste. */}
          {can('transfer') && user?.roleCode !== 'PHARMACIST' ? (
            <Btn variant="primary" icon={ArrowRightLeft} onClick={() => setCreation(true)}>Nouveau transfert</Btn>
          ) : null}
        </>}>
        <ErrorBox error={error} />

        {/* 2.7.72 — la période se filtre ENTRE DEUX DATES, comme « Stock » :
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
            <Btn variant="ghost" onClick={() => setFiltres({ de: '', au: '' })}>Tous les transferts</Btn>
          ) : null}
        </div>
      </Card>

      {/* ── CARTE 2 (2.7.72) : la liste — titre dynamique + recherche + tableau. */}
      <Card title={`${transferts.length} transfert(s) sur la période`}
        actions={<>
          {/* 2.7.72 — la recherche (référence, motif, médicament) monte ici,
              comme la recherche par nom de la fiche de stock. */}
          <div className="row row--tight" style={{ alignItems: 'center' }}>
            <Search size={14} className="muted" />
            <Input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Recherche : référence, motif, médicament…" style={{ width: 260 }}
              aria-label="Recherche sur les transferts" />
          </div>
        </>} flush>
        {transferts.length === 0 ? (
          <Empty>
            Aucun transfert enregistré sur cette période. Le dépôt approvisionne la pharmacie avec le bouton
            « Nouveau transfert » : la marchandise reçue entre d’abord au dépôt, puis rejoint le comptoir
            selon ses besoins.
          </Empty>
        ) : (
          <Table columns={[
            // 2.7.31 — lecture au contenu : « Nom Médicament, Quantité, Prix de
            // vente » ; « Référence, Motif, État » ne s'affichent plus dans la
            // liste (détail accessible par les boutons à droite).
            // 2.7.37 — teboka ① : la colonne « Prix de vente » s'aligne sur
            // son contenu (numérique, à droite) comme les autres chiffres.
            // 2.7.72 — « Action » demandée au-dessus des boutons,
            // libellé CENTRÉ (Table.center), boutons à fond plein.
            // 2.7.79 — ① « Quantité » RENOMMÉE « Quantité transférée » ;
            //          ② « Stock Final » = stock actuel du médicament au
            //             comptoir (pharmacie) ; ③ « Modifier » = correction.
            { label: 'Date' }, { label: 'Médicament(s)' },
            // 2.7.80 — « Quantité transférée » CENTRÉE (demande de l'officine).
            { label: 'Quantité transférée', center: true }, { label: 'Stock Final', num: true },
            { label: 'Prix de vente', num: true }, { label: 'Action', center: true }
          ]}>
            {transferts.map(transfert => {
              const lignes = transfert.lines || [];
              const prixDe = productId => {
                const produit = products.find(p => Number(p.id) === Number(productId));
                return produit?.sellingPrice;
              };
              return (
                <tr key={transfert.id}
                  title={`${transfert.reference} · ${transfert.reason || '—'} · ${transfert.status === 'VALIDATED' ? 'validé' : 'annulé'} — Dépôt → Pharmacie`}>
                  <td className="nowrap">{dateTime(transfert.date)}</td>
                  <td className="wrap">
                    {lignes.map((ligne, i) => (
                      <div key={i}><strong>{productName(ligne.productId)}</strong></div>
                    ))}
                    {lignes.length === 0 ? <span className="muted">—</span> : null}
                  </td>
                  {/* 2.7.80 — « Quantité transférée » CENTRÉE. */}
                  <td className="center">
                    {lignes.map((ligne, i) => <div key={i}>{integer(ligne.quantity)}</div>)}
                  </td>
                  {/* ② 2.7.80 — « Stock Final » = ce qu'il reste AU DÉPÔT pour
                      ce médicament après le transfert (stock de la réserve). */}
                  <td className="num">
                    {lignes.map((ligne, i) => (
                      <div key={i}>{formatStock(stockFinalDepot.get(Number(ligne.productId)) || 0)}</div>
                    ))}
                    {lignes.length === 0 ? <div>—</div> : null}
                  </td>
                  <td className="num">
                    {lignes.map((ligne, i) => {
                      const prix = prixDe(ligne.productId);
                      return <div key={i}>{prix != null ? money(prix) : '—'}</div>;
                    })}
                  </td>
                  <td className="center nowrap">
                    <span className="actes">
                      {/* ③ 2.7.79 — « Modifier » (crayon BLEU) : proposition de
                          correction ; grisé-remplacé par un badge tant qu'une
                          demande est déjà en attente pour ce transfert. */}
                      {transfert.status === 'VALIDATED' && can('transfer') ? (
                        enAttenteDe.has(transfert.id) ? (
                          <Badge tone="warn" title={`Correction ${enAttenteDe.get(transfert.id).reference} en attente de validation par l’administrateur`}>
                            correction en attente
                          </Badge>
                        ) : (
                          <Btn variant="ghost" style={COULEUR_DETAIL} icon={SquarePen}
                            title={`Proposer une correction de ${transfert.reference} — envoyée à l’administrateur qui valide ou refuse (impossible si un lot a déjà bougé)`}
                            onClick={() => setModifier(transfert)}>Modifier</Btn>
                        )
                      ) : null}
                      {/* 2.7.83 — DEMANDE DÉPÔT : « Détail » en VERT plein
                          (le bouton « Modifier » ci-dessus reste BLEU). */}
                      <Btn variant="ghost" style={COULEUR_IMPRIMER} icon={Eye}
                        title={`Voir le bordereau ${transfert.reference} (motif, état, lots)`}
                        onClick={() => ouvert(transfert)}>Détail</Btn>
                    </span>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}

        <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          Le stock du dépôt diminue et celui de la pharmacie augmente en une seule opération, tracée dans les
          mouvements de stock. Un transfert annulé remet les quantités dans le dépôt. « Détail » affiche le
          bordereau dans une fenêtre — ses boutons « Télécharger » et « Imprimer » produisent le PDF.
          « Modifier » envoie une correction à l’administrateur : le stock ne change qu’après sa validation (2.7.79).
        </p>
      </Card>

      {/* ③ 2.7.79 — demandes de correction de transfert : le dépôt suit les
          siennes, l'administrateur tranche celles qui attendent. */}
      {corrections.length ? (
        <Card title={`Corrections de transfert (${corrections.filter(c => c.status === 'PENDING').length} en attente)`}
          actions={<Badge tone={corrections.some(c => c.status === 'PENDING') ? 'warn' : 'ok'}>
            {corrections.some(c => c.status === 'PENDING') ? 'à trancher' : 'à jour'}
          </Badge>}>
          <Table columns={[
            { label: 'Demande' }, { label: 'Transfert' }, { label: 'Motif de la correction' }, { label: 'Proposée par' },
            
            { label: 'État de la demande' }, { label: 'Décision' }, { label: '' }
          ]}>
            {corrections.map(correction => {
              const etat = ETATS_CORRECTION[correction.status] || { label: correction.status, tone: 'default' };
              return (
                <tr key={correction.id}>
                  <td className="nowrap"><strong>{correction.reference}</strong><br />
                    <small className="muted">{dateTime(correction.createdAt)}</small></td>
                  <td className="nowrap">{correction.transferReference}</td>
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
        <Modal title="Nouveau transfert — dépôt vers pharmacie" onClose={() => setCreation(false)} wide>
          <TransferForm onCancel={() => setCreation(false)} onDone={async transfert => {
            toast.success(`Transfert ${transfert.reference} validé : la marchandise est entrée en pharmacie.`);
            setCreation(false);
            await refresh();
          }} />
        </Modal>
      ) : null}

      {/* ③ 2.7.79 — formulaire « Modifier » : contenu actuel pré-rempli,
          demande envoyée à l'administrateur (le stock ne bouge qu'après sa
          validation). */}
      {modifier ? (
        <Modal title={`Proposer une correction — ${modifier.reference}`}
          onClose={() => setModifier(null)} wide>
          <TransferCorrectionForm
            transfert={modifier}
            onCancel={() => setModifier(null)}
            onDone={async () => {
              toast.success('Correction envoyée à l’administrateur : le transfert ne change qu’après sa validation.');
              setModifier(null);
              await chargerCorrections();
            }} />
        </Modal>
      ) : null}

      {/* ③ 2.7.79 — dossier de correction : comparaison actuel vs proposé,
          puis validation ou refus motivé (administrateur). */}
      {trancher ? (
        <Modal wide
          title={`Correction ${trancher.reference} — transfert ${trancher.transferReference}`}
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
                  title="Refuser : le transfert ne change pas ; le motif du refus est renvoyé au dépôt">
                  Refuser
                </Btn>
                <Btn variant="primary" icon={Check} onClick={() => decider('VALIDATE')} disabled={busyDecision}
                  title="Valider : le transfert est remplacé par la version corrigée (défaite sans suppression, puis refaite — mouvements tracés)">
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
                <thead><tr><th>Médicament</th><th>Lot du dépôt</th><th className="num">Quantité</th></tr></thead>
                <tbody>
                  {(trancher.actuelles || []).map((ligne, i) => (
                    <tr key={i}>
                      <td className="wrap">{ligne.product}</td>
                      <td className="wrap">{ligne.lot}</td>
                      <td className="num">{integer(ligne.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: '.82rem' }}>
                Motif actuel : {trancher.transfer?.reason || '—'}.
              </p>
            </div>
            <div>
              <h3>Proposé (version corrigée)</h3>
              <table className="data">
                <thead><tr><th>Médicament</th><th>Lot du dépôt</th><th className="num">Quantité</th></tr></thead>
                <tbody>
                  {(trancher.proposees || []).map((ligne, i) => (
                    <tr key={i}>
                      <td className="wrap">{ligne.product}</td>
                      <td className="wrap">{ligne.lot}</td>
                      <td className="num">{integer(ligne.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: '.82rem' }}>
                Motif corrigé : {trancher.motifCorrige || '—'}
                {trancher.remarqueCorrigee ? ` · remarque : « ${trancher.remarqueCorrigee} »` : ''}.
              </p>
            </div>
          </div>
          {estAdmin && trancher.status === 'PENDING' ? (
            <Field label="Note de décision (facultative pour valider, obligatoire pour refuser)">
              <Textarea value={noteDecision} onChange={e => setNoteDecision(e.target.value)}
                placeholder="Ex. : quantités vérifiées au bon de livraison — ou : le lot a déjà été vendu, correction impossible…" />
            </Field>
          ) : null}
        </Modal>
      ) : null}

      {detail ? (
        <DocumentModal titre={`Transfert ${detail.reference || ''}`.trim()}
          charger={chargerDetail} onClose={() => setDetail(null)} />
      ) : null}
    </>
  );
}