// Boîte de dialogue « Détail » d'un document (réception, transfert…).
//
// Elle remplace l'ouverture d'un nouvel onglet : le document s'affiche dans une
// fenêtre de l'application (même présentation qu'un formulaire), avec :
//   • l'en-tête (référence, date, état, motif, fournisseur, valeur…),
//   • le tableau des lignes (médicament, lot, expiration, quantité, valeurs),
//   • un bouton « Télécharger » qui enregistre le document tout de suite.
//
// L'appelant fournit une fonction `charger` qui renvoie une structure normalisée :
//   { reference, type, date, statut, infos: [{label, valeur}], lignes: [...], total }
import { Fragment, useEffect, useState } from 'react';
import { Download, Printer, FileText } from 'lucide-react';
import { downloadDocument, openPrintable } from '../api/client.js';
import { Banner, Btn, Empty, Modal, Table } from './ui.jsx';
import { dateTime, integer, money } from '../utils/format.js';

/** Date courte (AAAA-MM-JJ → 01/01/2027) ; « — » si la date n'existe pas. */
const dateCourte = valeur => (valeur
  ? new Date(`${String(valeur).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR')
  : '—');

export default function DocumentModal({ titre, charger, onClose, ajustements = [] }) {
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

  const nomFichier = document?.reference ? `${document.reference}.html` : 'document.html';

  const telecharger = async () => {
    if (!document?.imprimable) return;
    setTelechargement(true);
    setError(null);
    try {
      await downloadDocument(document.imprimable, nomFichier);
    } catch (cause) {
      setError(cause);
    } finally {
      setTelechargement(false);
    }
  };

  return (
    <Modal title={titre || `Détail ${document?.reference || ''}`} onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Fermer</Btn>
        {document?.imprimable ? (
          <Btn icon={Printer} onClick={() => openPrintable(document.imprimable)}>Imprimer</Btn>
        ) : null}
        {document?.imprimable ? (
          <Btn variant="primary" icon={Download} onClick={telecharger} disabled={telechargement}>
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
            <FileText size={14} /> « Télécharger » enregistre le document dans votre dossier
            « Téléchargements » (fichier {nomFichier}) : il s’ouvre ensuite dans le navigateur et
            peut être imprimé ou transformé en PDF. Aucun nouvel onglet ne s’ouvre ici.
          </p>
        </>
      )}
    </Modal>
  );
}