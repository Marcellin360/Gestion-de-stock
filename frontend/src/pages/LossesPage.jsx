// Pertes et dons : sorties non commerciales au coût retenu, motif imposé et
// remarque justificative obligatoire (RG06, RG07, RG17).
//
// 2.7.73 — nouvelle demande de l'officine :
//   • colonne « ACTION » au-dessus du bouton « Détail », libellé CENTRÉ
//     (Table supporte `center: true` — 2.7.67), cellule centrée pareil ;
//   • le bouton « Fiche » devient « DÉTAIL », en BLEU plein, et ouvre une
//     BOÎTE DE DIALOGUE (même DocumentModal que les transferts, 2.7.72) :
//     référence, motif, remarque, magasin, état, tableau des lignes ;
//   • classe « Télécharger » DANS LA BOÎTE, en VERT plein : il enregistre
//     directement le PDF de la fiche (`?fmt=pdf` → templates/pertesPdf.js) ;
//   • la recherche (LIKE) passe à DROITE de la page.
//
// 2.7.74 — retouche demandée par l'officine : le libellé du champ de
//   recherche se raccourcit en « Recherche » et se colle À GAUCHE du champ,
//   sur la même ligne (la barre reste alignée à droite de la page).
import { useCallback, useState } from 'react';
import { Eye, PackageMinus } from 'lucide-react';
import { documents as documentsApi } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Btn, Card, Empty, ErrorBox, Input, Modal, Table } from '../components/ui.jsx';
import DocumentModal from '../components/DocumentModal.jsx';
import LossForm from '../forms/LossForm.jsx';
import { LOCATION_SHORT, dateTime, money } from '../utils/format.js';
// 2.7.73 — bleu « Détail » : même ton que la vente et les transferts (2.7.67).
import { COULEUR_DETAIL } from '../components/SaleHistoryModal.jsx';

export default function LossesPage() {
  const { documents, refresh, products, lots, productName } = useData();
  const toast = useToast();
  const [creation, setCreation] = useState(false);
  const [error, setError] = useState(null);
  // 2.7.73 — le bouton « Détail » ouvre la boîte de dialogue de la fiche.
  const [detail, setDetail] = useState(null);

  // 2.7.32 — recherche par LIKE (référence, motif, remarque).
  const [recherche, setRecherche] = useState('');
  const pertes = documents
    .filter(doc => doc.kind === 'LOSS')
    .filter(doc => !recherche
      || `${doc.reference} ${doc.reason} ${doc.note}`.toLowerCase().includes(recherche.toLowerCase()));
  const total = pertes.filter(doc => doc.status === 'VALIDATED')
    .reduce((somme, doc) => somme + Number(doc.costTotal || 0), 0);

  const ouvert = perte => {
    setError(null);
    setDetail(perte);
  };

  // 2.7.73 — la boîte « Détail » : même principe que le transfert (2.7.72) —
  // l'API /documents/LOSS/:id renvoie la fiche et ses lignes ; la boîte offre
  // « Télécharger » (VERT) et « Imprimer » qui enregistrent le PDF directement.
  const chargerDetail = useCallback(async () => {
    const fiche = await documentsApi.detail('LOSS', detail.id);
    return {
      reference: fiche.reference,
      type: 'Perte / don — sortie non commerciale',
      date: fiche.date || fiche.createdAt,
      statut: fiche.status === 'VALIDATED' ? 'validée' : 'annulée',
      total: fiche.costTotal,
      imprimable: `/documents/LOSS/${fiche.id}/print`,
      // 2.7.73 — boîte « Détail » : Télécharger/Imprimer enregistrent le PDF.
      pdf: true,
      infos: [
        { label: 'Magasin', valeur: LOCATION_SHORT[fiche.location] || fiche.location || '—' },
        { label: 'Motif', valeur: fiche.reason || '—' },
        { label: 'Remarque justificative', valeur: fiche.note || '—' }
      ],
      lignes: (fiche.lines || []).map(ligne => {
        const lot = (lots || []).find(l => Number(l.id) === Number(ligne.lotId));
        const produit = (products || []).find(p => Number(p.id) === Number(ligne.productId));
        return {
          product: productName ? productName(ligne.productId) : (produit?.name || '—'),
          code: produit?.code || '',
          lot: lot?.number || '—',
          expiresOn: lot?.expiresOn || null,
          quantity: ligne.quantity,
          unitCost: ligne.unitCost,
          value: Number(ligne.unitCost || 0) * ligne.quantity
        };
      })
    };
  }, [detail?.id, lots, products, productName]);

  return (
    <>
      <Card title={`${pertes.length} déclaration(s)`}
        actions={<>
          <Badge tone="warn">Coût total constaté : {money(total)}</Badge>
          <Btn variant="primary" icon={PackageMinus} onClick={() => setCreation(true)}>Déclarer une perte</Btn>
        </>}>
        <ErrorBox error={error} />
        {/* 2.7.74 — libellé raccourci « Recherche », collé À GAUCHE du champ
            sur la même ligne ; la barre reste alignée À DROITE (2.7.73). */}
        <div className="inline-form" style={{ marginBottom: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span style={{ whiteSpace: 'nowrap' }}>Recherche</span>
            <Input value={recherche} onChange={e => setRecherche(e.target.value)} style={{ width: 240 }}
              placeholder="Référence, motif, remarque…" title="Filtrer : une partie de la référence, du motif ou de la remarque suffit" />
          </label>
        </div>
        {pertes.length === 0 ? <Empty>Aucune perte ni don enregistré.</Empty> : (
          <Table columns={[
            { label: 'Référence' }, { label: 'Magasin' }, { label: 'Motif' }, { label: 'Remarque' },
            { label: 'Date' }, { label: 'Coût sorti', num: true }, { label: 'État' },
            // 2.7.73 — « Action » demandée au-dessus de « Détail », CENTRÉE.
            { label: 'Action', center: true }
          ]}>
            {pertes.map(perte => (
              <tr key={perte.id}>
                <td><strong>{perte.reference}</strong></td>
                <td><Badge tone={perte.location === 'DEPOT' ? 'info' : 'default'}>{LOCATION_SHORT[perte.location] || '—'}</Badge></td>
                <td>{perte.reason}</td>
                <td className="wrap">{perte.note}</td>
                <td>{dateTime(perte.date)}</td>
                <td className="num">{money(perte.costTotal)}</td>
                <td>{perte.status === 'VALIDATED' ? <Badge tone="ok">validée</Badge> : <Badge tone="danger">annulée</Badge>}</td>
                {/* 2.7.73 — « Fiche » devient « Détail », en BLEU plein, cellule
                    centrée ; il ouvre la boîte de dialogue (avec Télécharger). */}
                <td className="center nowrap">
                  <Btn variant="ghost" style={COULEUR_DETAIL} icon={Eye}
                    title={`Voir la fiche de perte ${perte.reference} (motif, remarque, lots)`}
                    onClick={() => ouvert(perte)}>Détail</Btn>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {creation ? (
        <Modal title="Déclarer une perte ou un don" onClose={() => setCreation(false)} wide>
          <LossForm onCancel={() => setCreation(false)} onDone={async perte => {
            toast.success(`Perte ${perte.reference} enregistrée : ${money(perte.costTotal)} sortis du stock.`);
            setCreation(false);
            await refresh();
          }} />
        </Modal>
      ) : null}

      {/* 2.7.73 — boîte « Détail » de la fiche : Télécharger (VERT) enregistre
          le PDF de la fiche de perte.
          2.7.78 — le bouton « Imprimer » est RETIRÉ du détail d'une perte
          (prop `sansImprimer`) : seuls « Fermer » (rouge) et « Télécharger »
          (vert) restent au pied de la boîte. */}
      {detail ? (
        <DocumentModal titre={`Fiche de perte ${detail.reference || ''}`.trim()} sansImprimer
          charger={chargerDetail} onClose={() => setDetail(null)} />
      ) : null}
    </>
  );
}