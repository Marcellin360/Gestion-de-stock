// Inventaire physique : on ouvre une session, on saisit les comptages, chaque
// écart doit être justifié (RG17) ; la validation crée un ajustement tracé.
//
// 2.7.79 — le comptage arrive PRÉ-REMPLI avec le stock théorique (« dia feno
//   mifanaraka ») : l'écart est nul tant qu'on ne retouche pas la ligne.
//
// 2.7.80 — demandes de l'officine (dépôt) :
//   ① la LISTE des inventaires affiche DIRECTEMENT ce qui a été compté :
//     colonnes « Médicament · Théorique · Physique (compté) · Écart ·
//     Justification » (une ligne empilée par lot, comme « Historique de
//     transfert ») + « Date » de la session ; « Référence », « Périmètre » et
//     « Lots comptés » QUITTENT l'écran, ainsi que le bouton « Détail » (la
//     boîte d'historique n'est plus nécessaire : tout est déjà sur la liste) ;
//   ② « Ouvrir un inventaire » : la colonne « Lot » quitte le tableau de
//     comptage (le médicament et sa date de réception suffisent) ;
//   ③ « Quantité » / colonnes numériques conservées, justifications obligatoires
//     sur écart (inchangé).
import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Printer, Play, Ban } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey, openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Banner, Btn, Card, Check, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Textarea } from '../components/ui.jsx';
import { LOCATION_SHORT, date, dateTime, integer } from '../utils/format.js';

/** Mois « pharmacie » d'une date (AAAA-MM, bornes à +03:00 comme le serveur). */
const moisPharmacie = valeur => new Date(new Date(valeur).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 7);

const STATUS_LABELS = { DRAFT: 'En cours', VALIDATED: 'Validé', ABANDONED: 'Abandonné' };

export default function InventoriesPage() {
  const { inventories, productName, lot, refresh } = useData();
  const { can, user } = useAuth();
  const toast = useToast();
  const [ouverture, setOuverture] = useState(false);
  // Un inventaire se fait magasin par magasin : la réserve et le comptoir se
  // comptent séparément (chacun a sa fiche de stock).
  const [nouveau, setNouveau] = useState({
    location: user?.roleCode === 'DEPOT' ? 'DEPOT' : 'PHARMACY',
    scope: 'Officine complète', note: ''
  });
  const [comptage, setComptage] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [annulation, setAnnulation] = useState(null);
  const [motif, setMotif] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // 2.7.34 — teboka ⑦ SAISIE RAPIDE : filtre pendant le comptage, affichage
  // « écarts seulement », et touche ENTRÉE qui saute au comptage suivant.
  const [filtreComptage, setFiltreComptage] = useState('');
  const [queEcarts, setQueEcarts] = useState(false);
  const champsPhysique = useRef({});

  const ouvrir = async () => {
    setBusy(true);
    setError(null);
    try {
      const inventaire = await stock.openInventory(nouveau);
      toast.success(`Inventaire ${inventaire.reference} ouvert (${LOCATION_SHORT[nouveau.location]}) : `
        + `${inventaire.linesCount} lot(s) à compter.`);
      setOuverture(false);
      setNouveau({ location: nouveau.location, scope: 'Officine complète', note: '' });
      await charger(inventaire.id);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const charger = async id => {
    setError(null);
    try {
      const detail = await stock.inventory(id);
      setComptage(detail);
      setLignes(detail.lines.map(ligne => ({
        id: ligne.id,
        productId: ligne.productId,
        lotId: ligne.lotId,
        theoretical: Number(ligne.theoretical),
        // 2.7.79 — le comptage arrive PRÉ-REMPLI avec le théorique (« dia feno
        // mifanaraka amin'ny inventaire natao ») : seules les lignes À
        // corriger se retouchent ; un écart apparaît dès qu'on modifie.
        physical: ligne.physical === null || ligne.physical === undefined
          ? ligne.theoretical
          : Number(ligne.physical),
        reason: ligne.reason || ''
      })));
    } catch (cause) {
      setError(cause);
    }
  };

  const valider = async () => {
    setBusy(true);
    setError(null);
    try {
      const reponse = await stock.validateInventory(comptage.id, {
        requestKey: newRequestKey(),
        note: comptage.note || '',
        lines: lignes.map(ligne => ({ id: ligne.id, physical: Number(ligne.physical), reason: ligne.reason }))
      });
      toast.success('Inventaire validé : les écarts justifiés ont ajusté le stock.');
      setComptage(null);
      await refresh();
      return reponse;
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const abandonner = async () => {
    setBusy(true);
    setError(null);
    try {
      await stock.abandonInventory(annulation.id, motif);
      toast.warn('Inventaire abandonné : aucun mouvement de stock créé.');
      setAnnulation(null);
      setMotif('');
      setComptage(null);
      await refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const ecarts = lignes.filter(ligne => ligne.physical !== '' && Number(ligne.physical) !== ligne.theoretical);
  const sansMotif = ecarts.filter(ligne => (ligne.reason || '').trim().length < 3);

  // Teboka ⑦ — RAPPEL MENSUEL DE L'INVENTAIRE DE LA RÉSERVE : tant qu'aucun
  // inventaire du dépôt n'a été validé depuis le 1er du mois (heure de la
  // pharmacie), la bannière le rappelle en haut de l'écran (profils dépôt et
  // administrateur). Identique à l'alerte du tableau de bord (teboka ⑦).
  const dernierDepotValide = (inventories || [])
    .filter(inventaire => inventaire.location === 'DEPOT' && inventaire.status === 'VALIDATED' && inventaire.validatedAt)
    .sort((a, b) => new Date(b.validatedAt) - new Date(a.validatedAt))[0];
  const rappelMensuel = ['DEPOT', 'ADMIN'].includes(user?.roleCode)
    && (!dernierDepotValide || moisPharmacie(dernierDepotValide.validatedAt) !== moisPharmacie(new Date()));

  // Teboka ⑦ — lignes visibles du comptage : filtre (médicament ou lot) puis
  // option « écarts seulement ». La validation envoie TOUJOURS toutes les lignes.
  const lignesVisibles = lignes
    .filter(ligne => {
      if (!filtreComptage) return true;
      const cible = `${productName(ligne.productId)} ${lot(ligne.lotId)?.number || ligne.lotId}`.toLowerCase();
      return cible.includes(filtreComptage.toLowerCase());
    })
    .filter(ligne => (queEcarts
      ? ligne.physical !== '' && Number(ligne.physical) !== ligne.theoretical
      : true));

  /** Teboka ⑦ — Entrée = comptage suivant (saisie rapide, sans la souris). */
  const entreeSuivant = ligneVisibleIndex => event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const suivante = lignesVisibles[ligneVisibleIndex + 1];
    if (suivante) {
      const champ = champsPhysique.current[suivante.id];
      if (champ) { champ.focus(); champ.select(); }
    }
  };

  return (
    <>
      {rappelMensuel ? (
        <Banner tone="warn" title="Rappel inventaire mensuel">
          Aucun inventaire de la réserve n’a été validé depuis le 1er du mois
          {dernierDepotValide ? ` (dernier : ${dateTime(dernierDepotValide.validatedAt)})` : ''} —
          « Ouvrir un inventaire » ci-dessous permet de le boucler.
        </Banner>
      ) : null}
      {/* 2.7.80 — la liste porte désormais DIRECTEMENT les valeurs comptées :
          chaque inventaire = une ligne, avec ses médicaments empilés conjointement
          (Théorique · Physique (compté) · Écart · Justification) et sa date.
          « Référence », « Périmètre », « Lots comptés » et le bouton « Détail »
          ont quitté cet écran (demande de l'officine). */}
      <Card title={`${inventories.length} session(s) d’inventaire`}
        actions={<>
          <Btn variant="primary" icon={ClipboardCheck} onClick={() => setOuverture(true)}>Ouvrir un inventaire</Btn>
        </>}>
        {inventories.length === 0 ? <Empty>Aucun inventaire enregistré pour le moment.</Empty> : (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Médicament</th><th className="num">Théorique</th><th className="num">Physique (compté)</th><th className="num">Écart</th><th>Justification</th><th>Date</th><th style={{ textAlign: 'center' }}>Action</th></tr></thead>
              <tbody>
                {inventories.map(inventaire => {
                  const lignesInv = inventaire.lines || [];
                  return (
                    <tr key={inventaire.id}
                      title={`${inventaire.reference} · ${STATUS_LABELS[inventaire.status] || inventaire.status} · ${LOCATION_SHORT[inventaire.location] || ''}${inventaire.scope ? ` · ${inventaire.scope}` : ''}`}>
                      <td className="wrap">
                        {lignesInv.map((ligne, i) => (
                          <div key={i}><strong>{productName(ligne.productId)}</strong></div>
                        ))}
                        {lignesInv.length === 0 ? <strong>{inventaire.reference}</strong> : null}
                      </td>
                      <td className="num">
                        {lignesInv.map((ligne, i) => <div key={i}>{integer(ligne.theoretical)}</div>)}
                      </td>
                      <td className="num">
                        {lignesInv.map((ligne, i) => (
                          <div key={i}>{ligne.physical === null || ligne.physical === undefined ? '—' : integer(ligne.physical)}</div>
                        ))}
                      </td>
                      <td className="num">
                        {lignesInv.map((ligne, i) => {
                          if (ligne.physical === null || ligne.physical === undefined) return <div key={i}>—</div>;
                          const ecart = Number(ligne.physical) - Number(ligne.theoretical);
                          return <div key={i}>{ecart ? `${ecart > 0 ? '+' : ''}${integer(ecart)}` : '0'}</div>;
                        })}
                      </td>
                      <td className="wrap">
                        {lignesInv.map((ligne, i) => (
                          <div key={i} style={
                            Number(ligne.physical) !== Number(ligne.theoretical)
                            && ligne.physical !== null && ligne.physical !== undefined
                              ? { color: '#b45309', fontWeight: 600 } : undefined
                          }>{ligne.reason || '—'}</div>
                        ))}
                      </td>
                      <td className="nowrap">{dateTime(inventaire.createdAt)}</td>
                      <td className="center nowrap">
                        <span className="actes">
                          {inventaire.status === 'DRAFT' ? (
                            <Btn icon={Play} onClick={() => charger(inventaire.id)}>Compter</Btn>
                          ) : (
                            <Btn variant="ghost" icon={Printer} onClick={() => openPrintable(`/inventories/${inventaire.id}/print`)}>Feuille</Btn>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {ouverture ? (
        <Modal title="Ouvrir une session d’inventaire" onClose={() => { setOuverture(false); setError(null); }}
          footer={<>
            <Btn variant="ghost" onClick={() => setOuverture(false)}>Renoncer</Btn>
            <Btn variant="primary" onClick={ouvrir} disabled={busy}>Ouvrir et compter</Btn>
          </>}>
          <ErrorBox error={error} />
          <p>Le système fige le stock théorique de chaque lot du magasin choisi à cet instant. Aucun mouvement n’est créé tant que vous n’avez pas validé.</p>
          {user?.roleCode === 'DEPOT' ? (
            <Field label="Magasin à compter" hint="Votre profil travaille sur la réserve : l’inventaire se fait au dépôt.">
              <Input value="Dépôt (réserve)" readOnly />
            </Field>
          ) : (
            <Field label="Magasin à compter" hint="Un inventaire par magasin : la réserve et le comptoir se comptent séparément">
              <Select value={nouveau.location} onChange={e => setNouveau({ ...nouveau, location: e.target.value })}>
                <option value="PHARMACY">Pharmacie (comptoir)</option>
                <option value="DEPOT">Dépôt (réserve)</option>
              </Select>
            </Field>
          )}
          <Field label="Périmètre compté" hint="Par exemple : rayon comptoir, réserve, armoire à stupéfiants">
            <Input value={nouveau.scope} onChange={e => setNouveau({ ...nouveau, scope: e.target.value })} />
          </Field>
          <Field label="Remarque (facultative)">
            <Textarea value={nouveau.note} onChange={e => setNouveau({ ...nouveau, note: e.target.value })} />
          </Field>
        </Modal>
      ) : null}

      {comptage ? (
        <Modal title={`Comptage — ${comptage.reference} (${LOCATION_SHORT[comptage.location] || 'magasin'})`}
          onClose={() => setComptage(null)} wide
          footer={<>
            <Btn variant="ghost" onClick={() => setAnnulation(comptage)} icon={Ban}>Abandonner</Btn>
            <div className="spacer" />
            <Btn variant="primary" icon={ClipboardCheck} onClick={valider} disabled={busy || sansMotif.length > 0}>
              {busy ? 'Validation…' : `Valider l’inventaire (${ecarts.length} écart(s))`}
            </Btn>
          </>}>
          <ErrorBox error={error} />
          {sansMotif.length ? (
            <div className="banner banner--warn">
              {sansMotif.length} écart(s) sans justification : indiquez un motif d’au moins 3 caractères pour chaque lot dont le comptage diffère du stock théorique.
            </div>
          ) : null}
          {/* Teboka ⑦ SAISIE RAPIDE : retrouver un article en tapant, ne garder
              que les écarts à justifier, et Entrée pour passer au lot suivant. */}
          {lignes.length > 8 ? (
            <div className="inline-form" style={{ marginBottom: 10 }}>
              <Field label="Rechercher (médicament ou lot)">
                <Input value={filtreComptage} onChange={e => setFiltreComptage(e.target.value)}
                  placeholder="Ex. : amoxicilline, MED-001-2026…" />
              </Field>
              <Check checked={queEcarts} onChange={e => setQueEcarts(e.target.checked)}
                label={`Écarts seulement (${ecarts.length})`} />
              <span className="muted" style={{ alignSelf: 'flex-end', fontSize: '.82rem' }}>
                {lignesVisibles.length} lot(s) affiché(s) sur {lignes.length} — touche Entrée : lot suivant
              </span>
            </div>
          ) : null}
          {/*
            2.7.80 — ② la colonne « Lot » QUITTE le tableau de comptage (demande
            de l'officine) ; le médicament et sa date de réception suffisent à
            reconnaître physiquement chaque paquet compté. Les lignes restent
            identifiées en interne par lotId (invisible).
          */}
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Médicament</th><th>Réception (reçu le)</th><th className="num">Théorique</th><th className="num">Compté</th><th className="num">Écart</th><th>Justification</th></tr></thead>
              <tbody>
                {lignesVisibles.map((ligne, ligneVisibleIndex) => {
                  // La copie de travail utilise l'index DANS la liste complète
                  // (le filtre ne perturbe pas l'enregistrement).
                  const index = lignes.findIndex(item => item.id === ligne.id);
                  const ecart = ligne.physical === '' ? null : Number(ligne.physical) - ligne.theoretical;
                  return (
                    <tr key={ligne.id} style={ecart ? { background: '#fdf1dd' } : undefined}>
                      <td className="wrap">{productName(ligne.productId)}</td>
                      {/* Teboka ⑦ — « l'inventaire contient ce qui est reçu » :
                          la date de RÉCEPTION du lot accompagne le comptage,
                          pour reconnaître physiquement chaque paquet compté. */}
                      <td className="nowrap">{date(lot(ligne.lotId)?.receivedOn)}</td>
                      <td className="num">{integer(ligne.theoretical)}</td>
                      <td className="num" style={{ minWidth: 110 }}>
                        {/* 2.7.12 — décimales permises : après une vente au détail
                            on compte parfois 8,3 boîtes (8 boîtes + 3 plaquettes). */}
                        <Input type="number" min="0" step="0.001" value={ligne.physical}
                          ref={node => { if (node) champsPhysique.current[ligne.id] = node; }}
                          onKeyDown={entreeSuivant(ligneVisibleIndex)}
                          onChange={e => {
                            const copie = [...lignes];
                            copie[index] = { ...ligne, physical: e.target.value };
                            setLignes(copie);
                          }} />
                      </td>
                      <td className="num">{ecart === null ? '—' : `${ecart > 0 ? '+' : ''}${integer(ecart)}`}</td>
                      <td className="wrap" style={{ minWidth: 220 }}>
                        <Input value={ligne.reason}
                          placeholder={ecart ? 'Motif obligatoire' : 'Facultatif'}
                          onChange={e => {
                            const copie = [...lignes];
                            copie[index] = { ...ligne, reason: e.target.value };
                            setLignes(copie);
                          }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Btn variant="ghost" onClick={() => setLignes(lignes.map(ligne => ({ ...ligne, physical: ligne.theoretical })))}>
              Tout conforme
            </Btn>
            <span className="muted">
              2.7.79 — le comptage arrive déjà pré-rempli avec le théorique ;
              cette commande sert à le RÉTABLIR après des retouches.
            </span>
          </div>
        </Modal>
      ) : null}

      {annulation ? (
        <Modal title="Abandonner cet inventaire" onClose={() => { setAnnulation(null); setError(null); }}
          footer={<>
            <Btn variant="ghost" onClick={() => setAnnulation(null)}>Renoncer</Btn>
            <Btn variant="danger" onClick={abandonner} disabled={busy || motif.trim().length < 3}>Abandonner</Btn>
          </>}>
          <ErrorBox error={error} />
          <p>Le comptage est conservé au journal, mais aucun ajustement de stock n’est appliqué.</p>
          <Field label="Motif (3 caractères minimum)">
            <Textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. : erreur de comptage, session interrompue…" />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}