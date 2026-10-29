// Transfert dépôt → pharmacie : c'est LE document qui fait passer la marchandise
// de la réserve au comptoir. On choisit des lots du dépôt, les quantités, et le
// motif. À la validation : sortie au dépôt, entrée en pharmacie, dans une seule
// opération.
//
// Choix du lot — règle FEFO obligatoire (2.7.9) :
//   • pour chaque médicament, SEUL le lot le plus proche de la péremption peut
//     partir vers la pharmacie ; les lots « encore lointains » sont affichés
//     (avec leur date) mais refusés, avec une notification qui dit quel lot
//     il faut envoyer d'abord ;
//   • un lot périmé ne part jamais en pharmacie : il se sort en « Pertes » ;
//   • un lot bloqué ou sans date ne part pas non plus.
// C'est la règle de la péremption (§9.5, RG09) appliquée au réassort : le
// comptoir écoule toujours ce qui expire le plus tôt.
//
// Choix du lot — deux façons, exprès :
//   • la RECHERCHE : on tape quelques lettres (nom, présentation, forme, code
//     interne ou n° de lot) et la liste des lots du dépôt qui correspondent
//     apparaît juste en dessous ; un clic (ou la touche Entrée) sélectionne le
//     lot ;
//   • la LISTE DÉROULANTE : elle reste disponible pour ceux qui préfèrent voir
//     tous les lots du dépôt d'un seul coup.
//
// 2.7.78 — TEXTES ENLEVÉS (demande de l'officine, formulaire épuré) : la
//   consigne « C'est ce motif qui apparaît dans l'historique du dépôt », la
//   bannière bleue FEFO (« Le lot le plus proche de la péremption part en
//   premier… », la règle reste APPLIQUÉE), le badge « Le stock du dépôt
//   diminue dans le même mouvement que celui de la pharmacie » et l'exemple
//   de remarque (« Ex. : besoin du week-end… ») sont RETIRÉS — et le bouton
//   icône « Retirer » de chaque ligne passe en ROUGE plein. La mécanique
//   (FEFO, recherche, liste, envoi) ne change pas.
//
// 2.7.93 — AFFICHAGE PAR PRÉSENTATION (demande du dépôt) : dans la colonne
//   « Médicament / lot du dépôt », ce qui identifie d'abord chaque choix est
//   le MÉDICAMENT avec sa PRÉSENTATION — « Alcool médical — Flacon 250 ml »
//   (productLabel du DataContext, 2.7.85), comme au Catalogue et à la
//   réception (2.7.90). Le n° de lot ne colle PLUS au nom : il descend dans
//   la ligne discrète en dessous (lot · expiration · code · stock du dépôt ·
//   aiguillage FEFO). La recherche entend désormais AUSSI la présentation, la
//   forme galénique et le dosage — plus seulement le nom, le code et le lot.
import { useMemo, useState } from 'react';
import { Plus, Trash2, ArrowRightLeft } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey } from '../api/client.js';
import { Badge, Banner, Btn, ErrorBox, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { today, integer, money } from '../utils/format.js';

export const TRANSFER_REASONS = [
  'Réassort du comptoir',
  'Demande du pharmacien',
  'Produit très demandé',
  'Ouverture d’un second rayon',
  'Retour du surplus au dépôt'
];

// Styles de la liste de suggestions. Elle s'affiche DANS le flux, juste sous la
// case de recherche : elle pousse la ligne vers le bas au lieu de se superposer.
// C'est volontaire — le tableau défile horizontalement au téléphone (overflow),
// une liste en surimpression y serait coupée.
const LISTE = {
  marginTop: 4, marginBottom: 4,
  background: 'var(--white)', border: '1px solid var(--slate-200)',
  borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-sm)',
  maxHeight: 220, overflowY: 'auto'
};
const ITEM = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
  width: '100%', padding: '7px 10px', border: 0, background: 'transparent',
  cursor: 'pointer', textAlign: 'left', font: 'inherit', fontSize: '.86rem'
};
const ITEM_REFUSE = { ...ITEM, opacity: .62, cursor: 'not-allowed' };
const ITEM_VIDE = { padding: '8px 10px', fontSize: '.84rem', color: 'var(--slate-500)' };

export default function TransferForm({ onDone, onCancel }) {
  // 2.7.93 — productLabel (nom + présentation, 2.7.85) remplace productName
  // partout dans cet écran : la présentation identifie la fiche.
  const { lots, products, productLabel, settings } = useData();
  const toast = useToast();
  // 2.7.78 — la consigne « C'est ce motif qui apparaît dans l'historique du
  // dépôt » est retirée (le champ Motif reste, sans texte d'aide).
  const [entete, setEntete] = useState({ reason: TRANSFER_REASONS[0], note: '' });
  const [lignes, setLignes] = useState([{ lotId: '', quantity: 1, recherche: '' }]);
  // Ligne dont la liste de suggestions est ouverte + suggestion surlignée.
  const [ouvert, setOuvert] = useState(null);
  const [surbrillance, setSurbrillance] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const dateJour = today();

  // Seuls les lots du dépôt peuvent partir : c'est la réserve qui approvisionne.
  const lotsDepot = useMemo(
    () => lots.filter(lot => lot.location === 'DEPOT' && Number(lot.quantity) > 0)
      .sort((a, b) => String(a.expiresOn || '9999').localeCompare(String(b.expiresOn || '9999'))),
    [lots]
  );

  // FEFO par médicament : parmi les lots du dépôt (stock > 0, non bloqués, non
  // périmés, datés), le lot transférable est celui qui expire le plus tôt —
  // en cas d'égalité de date, le plus ancien (plus petit identifiant).
  const fefoParProduit = useMemo(() => {
    const carte = new Map();
    for (const lot of lotsDepot) {
      if (lot.status !== 'AVAILABLE' || !lot.expiresOn || lot.expiresOn < dateJour) continue;
      const actuel = carte.get(lot.productId);
      if (!actuel || lot.expiresOn < actuel.expiresOn
        || (lot.expiresOn === actuel.expiresOn && lot.id < actuel.id)) {
        carte.set(lot.productId, lot);
      }
    }
    return carte;
  }, [lotsDepot, dateJour]);

  const codeDe = id => products.find(produit => Number(produit.id) === Number(id))?.code || '—';
  // 2.7.93 — une ligne choisie s'affiche « Nom — Présentation · lot N° » : la
  // présentation vient d'abord, le n° de lot suit pour lever toute ambiguïté.
  const etiquetteLot = lot => `${productLabel(lot.productId)} · lot ${lot.number}`;

  /**
   * Pourquoi un lot ne peut PAS partir (chaîne vide = il peut partir).
   * La phrase est aussi le texte de la notification quand on clique un lot refusé.
   */
  const motifRefus = lot => {
    if (lot.status !== 'AVAILABLE') {
      return `Le lot ${lot.number} est bloqué : il ne peut pas partir vers la pharmacie.`;
    }
    if (!lot.expiresOn) {
      return `Le lot ${lot.number} n'a pas de date d'expiration : un lot sans date ne part pas vers la pharmacie.`;
    }
    if (lot.expiresOn < dateJour) {
      return `Le lot ${lot.number} est périmé (${lot.expiresOn}) : il se sort en « Pertes », jamais vers la pharmacie.`;
    }
    const autorise = fefoParProduit.get(lot.productId);
    if (!autorise) {
      return `Aucun lot transférable pour ce médicament au dépôt (lots bloqués ou périmés) : régularisez d'abord au dépôt.`;
    }
    if (Number(autorise.id) !== Number(lot.id)) {
      return `C'est le lot « ${autorise.number} » (expire le ${autorise.expiresOn}) qui part d'abord : `
        + `il est plus proche de la péremption que le lot « ${lot.number} » (expire le ${lot.expiresOn}). `
        + `Envoyez-le d'abord ; le lot « ${lot.number} » partira ensuite.`;
    }
    return '';
  };

  // 2.7.93 — la recherche entend le NOM, la PRÉSENTATION, la FORME, le DOSAGE,
  // le CODE, le N° DE LOT et la date d'expiration. « flacon 250 » retrouve donc
  // directement la bonne fiche, sans connaître le nom exact du médicament.
  const filtrer = terme => {
    const recherche = String(terme || '').trim().toLowerCase();
    if (!recherche) return lotsDepot;
    return lotsDepot.filter(lot => {
      const produit = products.find(item => Number(item.id) === Number(lot.productId));
      return [produit?.name, produit?.presentation, produit?.form, produit?.dosage,
        codeDe(lot.productId), lot.number, lot.expiresOn]
        .some(valeur => String(valeur || '').toLowerCase().includes(recherche));
    });
  };

  const maj = (index, patch) => setLignes(liste => liste.map((ligne, i) => (i === index ? { ...ligne, ...patch } : ligne)));

  const choisir = (index, lot) => {
    if (!lot) { maj(index, { lotId: '', recherche: '' }); setOuvert(null); return; }
    // Cliquer un lot « encore lointain » ne le sélectionne pas : une
    // notification dit quel lot envoyer d'abord (règle FEFO, 2.7.9).
    const refus = motifRefus(lot);
    if (refus) { toast.warn(refus); return; }
    maj(index, { lotId: String(lot.id), recherche: etiquetteLot(lot) });
    setOuvert(null);
    setSurbrillance(0);
  };

  const valeurEstimee = lignes.reduce((somme, ligne) => {
    const lot = lots.find(item => Number(item.id) === Number(ligne.lotId));
    return somme + (lot ? Number(lot.unitCost) : 0) * Number(ligne.quantity || 0);
  }, 0);

  const soumettre = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const transfert = await stock.createTransfer({
        requestKey: newRequestKey(),
        fromLocation: 'DEPOT',
        toLocation: 'PHARMACY',
        reason: entete.reason,
        note: entete.note,
        lines: lignes.map(ligne => ({ lotId: Number(ligne.lotId), quantity: Number(ligne.quantity) }))
      });
      onDone(transfert);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={soumettre}>
      <ErrorBox error={error} />

      {lotsDepot.length === 0 ? (
        <Banner tone="warn" title="Aucun lot disponible au dépôt">
          Enregistrez d’abord une réception : c’est l’entrée de marchandise dans la réserve.
        </Banner>
      ) : null}

      <div className="grid grid--2">
        <Field label="Motif du transfert">
          <Select value={entete.reason} onChange={e => setEntete({ ...entete, reason: e.target.value })}>
            {TRANSFER_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
          </Select>
        </Field>
        <Field label="Sens du transfert">
          <Input value="Dépôt (réserve) → Pharmacie (comptoir)" readOnly />
        </Field>
      </div>

      {/* 2.7.78 — la bannière explicative FEFO (« Le lot le plus proche de la
          péremption part en premier… ») est RETIRÉE : la règle FEFO reste
          APPLIQUÉE (seul le lot repéré « FEFO » est proposable, un clic sur un
          lot lointain affiche toujours la notification d'aiguillage). */}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Médicament / lot du dépôt</th>
              <th className="num">Stock dépôt</th>
              <th className="num">Quantité à transférer</th>
              <th className="num">Coût de revient</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => {
              const lot = lots.find(item => Number(item.id) === Number(ligne.lotId));
              const suggestions = filtrer(ligne.recherche);
              return (
                <tr key={index}>
                  <td style={{ minWidth: 340 }}>
                    <div>
                      <Input
                        value={ligne.recherche}
                        placeholder="Rechercher : nom, présentation, code ou n° de lot…"
                        autoComplete="off"
                        aria-label="Rechercher un lot du dépôt"
                        onChange={e => { maj(index, { recherche: e.target.value }); setOuvert(index); setSurbrillance(0); }}
                        onFocus={() => { setOuvert(index); setSurbrillance(0); }}
                        onBlur={() => setTimeout(() => setOuvert(actuel => (actuel === index ? null : actuel)), 150)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { setOuvert(null); return; }
                          if (e.key === 'ArrowDown') { e.preventDefault(); setSurbrillance(n => Math.min(n + 1, suggestions.length - 1)); return; }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setSurbrillance(n => Math.max(n - 1, 0)); return; }
                          if (e.key === 'Enter' && ouvert === index && suggestions.length) {
                            e.preventDefault();
                            choisir(index, suggestions[surbrillance] || suggestions[0]);
                          }
                        }}
                      />
                      {ouvert === index ? (
                        <div style={LISTE} role="listbox">
                          {suggestions.length === 0 ? (
                            <div style={ITEM_VIDE}>Aucun lot du dépôt ne correspond à « {ligne.recherche} ».</div>
                          ) : suggestions.slice(0, 8).map((item, rang) => {
                            const refus = motifRefus(item);
                            return (
                              <button type="button" key={item.id} role="option" aria-selected={rang === surbrillance}
                                title={refus
                                  ? `${productLabel(item.productId)} · lot ${item.number} — ce lot n'est PAS proposable : ${refus}`
                                  : `${productLabel(item.productId)} · lot ${item.number} · dépôt : ${integer(item.quantity)} en stock — lot FEFO, à envoyer d’abord (le plus proche de la péremption)`}
                                style={{ ...(refus ? ITEM_REFUSE : ITEM), background: rang === surbrillance ? 'var(--teal-100)' : 'transparent' }}
                                onMouseDown={e => e.preventDefault()}
                                onMouseEnter={() => setSurbrillance(rang)}
                                onClick={() => choisir(index, item)}>
                                <span>
                                  <strong>{productLabel(item.productId)}</strong>
                                  {refus ? '' : <> <Badge tone="ok">FEFO</Badge></>}
                                </span>
                                <span className="muted" style={{ fontSize: '.78rem' }}>
                                  lot {item.number}
                                  {item.expiresOn ? ` · exp. ${item.expiresOn}` : ' · sans date'}
                                  {' · '}{codeDe(item.productId)} · dépôt : {integer(item.quantity)} en stock
                                  {refus
                                    ? ` — ${refus}`
                                    : ' — c’est ce lot qui part en premier (le plus proche de la péremption).'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>

                    <Select value={ligne.lotId} required aria-label="Liste des lots du dépôt"
                      onChange={e => choisir(index, lots.find(item => Number(item.id) === Number(e.target.value)))}>
                      <option value="">— choisir un lot du dépôt —</option>
                      {lotsDepot.map(item => (
                        <option key={item.id} value={item.id}
                          title={`Stock du dépôt pour ce lot : ${integer(item.quantity)} — ${motifRefus(item) ? `pas proposable : ${motifRefus(item)}` : 'lot FEFO, à envoyer d’abord'}`}>
                          {etiquetteLot(item)}{item.expiresOn ? ` (exp. ${item.expiresOn})` : ' (sans date)'}
                          {motifRefus(item) ? ' — pas encore : un lot expire avant' : ' — FEFO, à envoyer d’abord'}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="num">{lot ? integer(lot.quantity) : '—'}</td>
                  <td className="num" style={{ minWidth: 130 }}>
                    <Input type="number" min="1" step="1" max={lot ? Number(lot.quantity) : undefined}
                      value={ligne.quantity} onChange={e => maj(index, { quantity: e.target.value })} required />
                  </td>
                  <td className="num">{money(lot ? Number(lot.unitCost) * Number(ligne.quantity || 0) : 0)}</td>
                  <td className="right">
                    {/* 2.7.78 — le bouton icône « Retirer » passe en ROUGE plein
                        (demande de l'officine). */}
                    <Btn variant="danger" icon={Trash2} disabled={lignes.length === 1}
                      onClick={() => setLignes(liste => liste.filter((_, i) => i !== index))} aria-label="Retirer" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Valeur transférée ({settings.valuation === 'CMP' ? 'CMP' : 'coût du lot'})</td>
              <td className="num">{money(valeurEstimee)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 2.7.78 — le badge « Le stock du dépôt diminue dans le même mouvement
          que celui de la pharmacie » est retiré d'ici. */}
      <div className="row" style={{ marginTop: 10 }}>
        <Btn icon={Plus}
          onClick={() => { setLignes(liste => [...liste, { lotId: '', quantity: 1, recherche: '' }]); setOuvert(lignes.length); }}>
          Ajouter un lot
        </Btn>
      </div>

      {/* 2.7.78 — l'exemple « Ex. : besoin du week-end, rupture au comptoir
          depuis ce matin… » est retiré ; le champ Remarque reste. */}
      <Field label="Remarque (facultative)">
        <Textarea value={entete.note} onChange={e => setEntete({ ...entete, note: e.target.value })} />
      </Field>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <Btn variant="ghost" onClick={onCancel}>Renoncer</Btn>
        <Btn variant="primary" type="submit" icon={ArrowRightLeft} disabled={busy}>
          {busy ? 'Transfert en cours…' : 'Valider le transfert'}
        </Btn>
      </div>
    </form>
  );
}