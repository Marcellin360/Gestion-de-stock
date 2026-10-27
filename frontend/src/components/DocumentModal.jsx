// Boîte de dialogue « Détail » d'un document (réception, transfert…).
//
// Elle remplace l'ouverture d'un nouvel onglet : le document s'affiche dans une
// fenêtre de l'application (même présentation qu'un formulaire), avec :
//   • l'en-tête (référence, date, état, motif, fournisseur, valeur…),
//   • le tableau des lignes (médicament, lot, expiration, quantité, valeurs),
//   • les boutons « Télécharger » et « Imprimer ».
//
// 2.7.72 — pour les documents PDF (transfert : l'appelant renvoie `pdf: true`),
//   « Télécharger » ET « Imprimer » enregistrent DIRECTEMENT le fichier PDF
//   (plus de .html déguisé ni d'onglet à imprimer à la main) — même repli
//   « navigateur » que la vente quand la protection web locale bloque le fetch.
//
// 2.7.74 — « Fermer » passe au ROUGE plein (variante « danger », comme dans
//   l'historique des ventes et le détail de séjour de l'hôpital).
//
// 2.7.78 — nouvelle prop `sansImprimer` (demande de l'officine) : quand elle
//   est passée par l'écran appelant (réceptions, pertes), le bouton
//   « Imprimer » n'est PAS affiché — le détail ne garde que « Fermer » (rouge)
//   et « Télécharger » (vert). La fonction d'impression reste en place : les
//   autres documents ne changent rien.
//
// L'appelant fournit une fonction `charger` qui renvoie une structure normalisée :
//   { reference, type, date, statut, infos: [{label, valeur}], lignes: [...],
//     total, imprimable, pdf? }
import { Fragment, useEffect, useState } from 'react';
import { Download, Printer, FileText } from 'lucide-react';
import { downloadDocument, downloadPdf, openPrintable } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { Banner, Btn, Empty, Modal, Table } from './ui.jsx';
import { dateTime, integer, money } from '../utils/format.js';
import { COULEUR_IMPRIMER, MESSAGE_PDF_NAVIGATEUR } from './SaleHistoryModal.jsx';

/** Date courte (AAAA-MM-JJ → 01/01/2027) ; « — » si la date n'existe pas. */
const dateCourte = valeur => (valeur
  ? new Date(`${String(valeur).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR')
  : '—');

export default function DocumentModal({ titre, charger, onClose, ajustements = [], sansImprimer = false }) {
  const toast = useToast();
  const [document, setDocument] = useState(null);
  const [error, setError] = useState(null);
  const [telechargement, setTelechargement] = useState(false);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const contenu = await charger();
        if (actif) setDocument(contenu);
      } catch (cause) {
        if (actif) setError(cause);
      }
    })();
    return () => { actif = false; };
  }, [charger]);

  // 2.7.72 — documents PDF (transfert, réception dès la 2.7.78) : le
  // téléchargement produit le VRAI PDF (chez qui le bouton « Imprimer »,
  // quand il est affiché, l'enregistre aussi, comme le menu Stock).
  const estPdf = Boolean(document?.pdf);
  const nomFichier = document?.reference ? `${document.reference}.${estPdf ? 'pdf' : 'html'}` : `document.${estPdf ? 'pdf' : 'html'}`;

  // Chemin du PDF : `?fmt=pdf` ajouté proprement (le chemin peut déjà porter des paramètres).
  const cheminPdf = () => `${document.imprimable}${document.imprimable.includes('?') ? '&' : '?'}fmt=pdf`;

  const telecharger = () => {
    if (!document?.imprimable) return;
    setTelechargement(true);
    setError(null);
    const termine = () => setTelechargement(false);
    if (estPdf) {
      downloadPdf(cheminPdf(), nomFichier)
        .then(result => {
          if (result?.via === 'navigateur') toast.warn(MESSAGE_PDF_NAVIGATEUR);
        })
        .catch(cause => { setError(cause); toast.error(cause.message || 'Téléchargement du PDF impossible.'); })
        .finally(termine);
      return;
    }
    downloadDocument(document.imprimable, nomFichier)
      .catch(cause => setError(cause))
      .finally(termine);
  };

  // 2.7.72 — « Imprimer » d'un document PDF : télécharge directement le PDF
  // (comportement uniforme avec la vente et le menu « Stock », 2.7.71) ;
  // les autres documents gardent l'impression navigateur classique.
  // 2.7.78 — le bouton n'est plus AFFICHÉ quand `sansImprimer` est passé
  // (réceptions, pertes) ; la fonction reste disponible ici.
  const imprimer = () => {
    if (estPdf) telecharger();
    else if (document?.imprimable) openPrintable(document.imprimable);
  };

  return (
    <Modal title={titre || `Détail ${document?.reference || ''}`} onClose={onClose} wide
      footer={<>
        {/* 2.7.74 — « Fermer » en ROUGE plein (même convention que l'historique
            des ventes et le détail de séjour). */}
        <Btn variant="danger" onClick={onClose}>Fermer</Btn>
        {/* 2.7.78 — écrans « sans Imprimer » (réceptions, pertes) : seuls
            « Fermer » et « Télécharger » restent au pied de la boîte. */}
        {!sansImprimer && document?.imprimable ? (
          <Btn variant={estPdf ? 'ghost' : 'default'} {...(estPdf ? { style: COULEUR_IMPRIMER } : {})}
            icon={Printer} onClick={imprimer} disabled={telechargement}>Imprimer</Btn>
        ) : null}
        {document?.imprimable ? (
          // 2.7.73 — en mode PDF, « Télécharger » aussi passe au VERT plein
          // (famille téléchargement/impression, à la demande de l'officine).
          <Btn variant={estPdf ? 'ghost' : 'primary'} {...(estPdf ? { style: COULEUR_IMPRIMER } : {})}
            icon={Download} onClick={telecharger} disabled={telechargement}>
            {telechargement ? 'Téléchargement…' : 'Télécharger'}
          </Btn>
        ) : null}
      </>}>
      {error ? <Banner tone="error" title="Lecture impossible">{String(error.message || error)}</Banner> : null}

      {ajustements.length ? (
        <Banner tone="warn" title="Numéro de lot déjà utilisé">
          <ul style={{ margin: '4px 0 0 16px' }}>
            {ajustements.map((ajustement, index) => <li key={index}>{ajustement.message}</li>)}
          </ul>
        </Banner>
      ) : null}

      {!document ? (
        error ? null : <Empty>Chargement du document…</Empty>
      ) : (
        <>
          <dl className="kv">
            <dt>Type</dt><dd>{document.type}</dd>
            <dt>Référence</dt><dd><strong>{document.reference}</strong></dd>
            <dt>Date</dt><dd>{dateTime(document.date)}</dd>
            <dt>État</dt><dd>{document.statut}</dd>
            {(document.infos || []).map(info => (
              <Fragment key={info.label}>
                <dt>{info.label}</dt><dd>{info.valeur}</dd>
              </Fragment>
            ))}
            <dt>Valeur</dt><dd><strong>{money(document.total)}</strong></dd>
          </dl>

          {(document.lignes || []).length === 0 ? <Empty>Aucune ligne sur ce document.</Empty> : (
            <div style={{ marginTop: 12 }}>
              <Table columns={[
                { label: 'Médicament' }, { label: 'Lot' }, { label: 'Expiration' },
                { label: 'Quantité', num: true }, { label: 'Coût unitaire', num: true }, { label: 'Valeur', num: true }
              ]}>
                {document.lignes.map((ligne, index) => (
                  <tr key={index}>
                    <td className="wrap">
                      <strong>{ligne.product || '—'}</strong>
                      {ligne.code ? <div className="muted" style={{ fontSize: '.78rem' }}>{ligne.code}</div> : null}
                    </td>
                    <td>{ligne.lot || '—'}</td>
                    <td>{dateCourte(ligne.expiresOn)}</td>
                    <td className="num">{integer(ligne.quantity)}</td>
                    <td className="num">{money(ligne.unitCost)}</td>
                    {/* La valeur arrive en nombre depuis la page appelante ; ne jamais
                        la reformater une seconde fois (sinon « NaN Ar », bug vu en 2.7.9). */}
                    <td className="num">{money(ligne.value ?? Number(ligne.unitCost || 0) * Number(ligne.quantity || 0))}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}

          <p className="muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
            {estPdf ? (
              <><FileText size={14} /> « Télécharger » enregistre le PDF dans votre dossier
                « Téléchargements » (fichier {nomFichier})
                {/* 2.7.78 — la phrase sur « Imprimer » ne s'affiche que si le
                    bouton est affiché (pas en réception ni en perte). */}
                {sansImprimer ? ' — ouvrez-le et imprimez-le depuis votre lecteur PDF.' : <> ; « Imprimer » l’enregistre pareil —
                  ouvrez-le et imprimez-le depuis votre lecteur PDF.</>} Aucun nouvel onglet ne s’ouvre ici.</>
            ) : (
              <><FileText size={14} /> « Télécharger » enregistre le document dans votre dossier
                « Téléchargements » (fichier {nomFichier}) : il s’ouvre ensuite dans le navigateur et
                peut être imprimé ou transformé en PDF. Aucun nouvel onglet ne s’ouvre ici.</>
            )}
          </p>
        </>
      )}
    </Modal>
  );
}