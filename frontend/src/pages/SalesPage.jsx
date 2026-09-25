// Écran de vente (comptoir) : rechercher, composer le panier, contrôler le
// total proposé par le serveur, encaisser, imprimer le ticket.
// Aucun prix n'est calculé ici : le serveur propose, l'écran affiche (RG04, RG08).
//
// Contrat d'appel (ne pas renommer les champs !) :
//   POST /api/sales/quote  { note, lines: [{ productId, quantity }] }
//   POST /api/sales        { requestKey, expectedTotal, customerName, note, lines: idem }
// Un nom de champ étranger (« quantite », « prixUnitaire »…) est refusé par le
// serveur (schéma strict) : c'était la cause du bug corrigé en 2.7.2.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Trash2, Printer, Check, RefreshCw, Plus, Minus } from 'lucide-react';
import { stock } from '../api/endpoints.js';
import { newRequestKey, openPrintable } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Banner, Btn, Card, Empty, ErrorBox, Field, Input, Modal, Textarea } from '../components/ui.jsx';
import { money, integer } from '../utils/format.js';

export default function SalesPage() {
  const { products, sellableStock, refresh, settings, productName, documents } = useData();
  const { can } = useAuth();
  const toast = useToast();

  const searchRef = useRef(null);
  const [term, setTerm] = useState('');
  const [panier, setPanier] = useState([]);
  const [client, setClient] = useState('');
  const [note, setNote] = useState('');
  const [devis, setDevis] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cloture, setCloture] = useState(null);
  const [cle, setCle] = useState(() => newRequestKey());

  const resultats = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return [];
    return products
      .filter(product => product.active && [product.name, product.code, product.ingredient, product.barcode]
        .some(field => String(field || '').toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [term, products]);

  useEffect(() => { setDevis(null); }, [panier, client]);

  // Clients déjà servis : proposés en liste pour éviter la saisie répétée.
  const clientsConnus = useMemo(() => {
    const noms = new Set();
    for (const document of documents || []) {
      const nom = String(document.customerName || '').trim();
      if (nom) noms.add(nom);
    }
    return [...noms].sort((a, b) => a.localeCompare(b)).slice(0, 50);
  }, [documents]);

  // Le panier garde EXACTEMENT les noms de champs attendus par l'API
  // (`lines: [{ productId, quantity }]`) : aucune traduction, donc aucune
  // erreur « champ inconnu » possible à la validation.
  const ajouter = (productId, nombre = 1) => {
    setPanier(lignes => {
      const existante = lignes.find(ligne => ligne.productId === productId);
      if (existante) {
        return lignes.map(ligne => (ligne.productId === productId ? { ...ligne, quantity: ligne.quantity + nombre } : ligne));
      }
      return [...lignes, { productId, quantity: nombre }];
    });
  };

  const modifier = (productId, delta) => {
    setPanier(lignes => lignes
      .map(ligne => (ligne.productId === productId ? { ...ligne, quantity: ligne.quantity + delta } : ligne))
      .filter(ligne => ligne.quantity > 0));
  };

  // Panier prêt pour le serveur : quantités numériques, champs strictement
  // conformes au contrat de l'API (RG04 : aucun calcul de prix côté écran).
  const lignesEnvoyees = () => panier.map(ligne => ({
    productId: Number(ligne.productId),
    quantity: Number(ligne.quantity)
  }));

  const chargerDevis = async () => {
    setBusy(true);
    setError(null);
    try {
      const reponse = await stock.quoteSale({ note, lines: lignesEnvoyees() });
      setDevis(reponse);
      return reponse;
    } catch (cause) {
      setError(cause);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const valider = async () => {
    setBusy(true);
    setError(null);
    try {
      const reponse = await stock.createSale({
        requestKey: cle,
        expectedTotal: devis?.total,
        customerName: client,
        note,
        lines: lignesEnvoyees()
      });
      toast.success(`Vente enregistrée : ${reponse.reference}`);
      setCloture(reponse);
      setPanier([]);
      setClient('');
      setNote('');
      setDevis(null);
      setCle(newRequestKey());
      setTerm('');
      await refresh();
      searchRef.current?.focus();
    } catch (cause) {
      if (cause.status === 409) {
        setError({ message: 'Les prix ou le stock ont changé depuis le calcul : vérifiez le nouveau total puis validez à nouveau.' });
        await chargerDevis();
      } else {
        setError(cause);
      }
    } finally {
      setBusy(false);
    }
  };

  const surEntree = event => {
    if (event.key === 'Enter' && resultats.length) {
      event.preventDefault();
      ajouter(resultats[0].id);
      setTerm('');
    }
  };

  return (
    <div className="pos-grid">
      <div>
        <Card title="Rechercher un médicament au comptoir"
          actions={<Badge tone="info">{settings.marginMode === 'SALE' ? 'marge sur prix de vente' : 'marge sur coût'}</Badge>}>
          <label className="field">
            <span className="field__hint">Nom, code, principe actif ou code-barres — au moins 2 caractères</span>
            <Input ref={searchRef} value={term} onChange={e => setTerm(e.target.value)} onKeyDown={surEntree}
              placeholder="Ex. : amoxicilline, PARA-500…" autoFocus />
          </label>
          {resultats.length ? (
            <div className="suggestions">
              {resultats.map(product => {
                const dispo = sellableStock(product.id);
                return (
                  <button key={product.id} onClick={() => { ajouter(product.id); setTerm(''); }}>
                    <div className="row row--tight">
                      <strong>{product.name}</strong>
                      <small>{product.code}</small>
                      <div className="spacer" />
                      <Badge tone={dispo > 0 ? 'ok' : 'danger'}>{integer(dispo)} en stock vendable</Badge>
                    </div>
                    <small>{product.presentation || product.dosage || product.form || ''} {product.unit ? `· ${product.unit}` : ''}</small>
                  </button>
                );
              })}
            </div>
          ) : null}

          {error ? <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div> : null}

          <div className="row" style={{ marginTop: 14 }}>
            <Btn icon={RefreshCw} onClick={chargerDevis} disabled={!panier.length || busy}>Recalculer le total</Btn>
            <span className="muted" style={{ fontSize: '.84rem' }}>
              Le stock proposé est celui de la PHARMACIE (comptoir) et il sort en FEFO (premier périmé, premier sorti).
              Ce qui reste au dépôt doit d’abord être transféré.
            </span>
          </div>
        </Card>

        <Card title="Panier" flush>
          {panier.length === 0 ? <Empty>Panier vide : recherchez un médicament pour commencer.</Empty> : (
            <div className="table-scroll">
              <table className="data">
                <thead><tr><th>Médicament</th><th className="num">Stock vendable</th><th>Quantité</th><th className="num">Prix unitaire</th><th className="num">Total ligne</th><th /></tr></thead>
                <tbody>
                  {panier.map(ligne => {
                    const produit = devis?.lines?.filter(item => item.productId === ligne.productId) || [];
                    const prix = produit[0]?.unitPrice;
                    return (
                      <tr key={ligne.productId}>
                        <td className="wrap">{productName(ligne.productId)}</td>
                        <td className="num">{integer(sellableStock(ligne.productId))}</td>
                        <td>
                          <div className="counter">
                            <button onClick={() => modifier(ligne.productId, -1)} aria-label="Diminuer"><Minus size={14} /></button>
                            <strong style={{ minWidth: 34, textAlign: 'center' }}>{ligne.quantity}</strong>
                            <button onClick={() => modifier(ligne.productId, 1)} aria-label="Augmenter"><Plus size={14} /></button>
                          </div>
                        </td>
                        <td className="num">{prix ? money(prix) : '—'}</td>
                        <td className="num">{prix ? money(Number(prix) * ligne.quantity) : '—'}</td>
                        <td className="right">
                          <Btn variant="ghost" icon={Trash2} onClick={() => setPanier(l => l.filter(x => x.productId !== ligne.productId))} aria-label="Retirer" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Encaissement">
        <Field label="Client (facultatif)" hint="Choisissez un client déjà servi ou laissez « Client de passage »">
          <Input list="clients-connus" value={client} onChange={e => setClient(e.target.value)} placeholder="Client de passage" />
          <datalist id="clients-connus">
            {clientsConnus.map(nom => <option key={nom} value={nom} />)}
          </datalist>
          {clientsConnus.length ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn size="sm" variant={client === '' ? 'primary' : 'ghost'} onClick={() => setClient('')}>Client de passage</Btn>
              {clientsConnus.slice(0, 4).map(nom => (
                <Btn key={nom} size="sm" variant={client === nom ? 'primary' : 'ghost'} onClick={() => setClient(nom)}>{nom}</Btn>
              ))}
            </div>
          ) : null}
        </Field>
        <Field label="Remarque (facultative)">
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ordonnance, précision de vente…" />
        </Field>

        {devis ? (
          <>
            <div className="table-scroll" style={{ marginBottom: 10 }}>
              <table className="data">
                <thead><tr><th>Lot retenu</th><th>Expiration</th><th className="num">Qté</th><th className="num">PU</th></tr></thead>
                <tbody>
                  {devis.lines.map((ligne, index) => (
                    <tr key={index}>
                      <td>{ligne.lot}</td>
                      <td>{ligne.expiresOn ? new Date(ligne.expiresOn).toLocaleDateString('fr-FR') : 'non daté'}</td>
                      <td className="num">{integer(ligne.quantity)}</td>
                      <td className="num">{money(ligne.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="total-line"><span>Total {integer(devis.lines.reduce((total, ligne) => total + Number(ligne.quantity), 0))} unité(s)</span><strong>{money(devis.total)}</strong></div>
            {can('prices') ? <div className="total-line muted"><span>Coût retenu</span><span>{money(devis.costTotal)}</span></div> : null}
            {can('prices') ? <div className="total-line muted"><span>Marge brute</span><span>{money(devis.margin)}</span></div> : null}
          </>
        ) : (
          <Banner tone="info">Le total est calculé par le serveur à partir du stock réel : appuyez sur « Recalculer le total » ou validez directement.</Banner>
        )}

        <div style={{ marginTop: 12 }}>
          <Btn variant="primary" size="lg" className="btn--block" icon={Check} disabled={!panier.length || busy} onClick={valider}>
            {busy ? 'Enregistrement…' : 'Valider la vente'}
          </Btn>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
            Une vente validée ne se supprime jamais : en cas d’erreur, elle s’annule depuis l’écran Documents
            (trace conservée, stock remis en place).
          </p>
        </div>

        {cloture ? (
          <Banner tone="ok" title={`Vente ${cloture.reference} enregistrée`}>
            <div className="row row--tight" style={{ marginTop: 8 }}>
              <Btn icon={Printer} onClick={() => openPrintable(`/documents/SALE/${cloture.id}/print`)}>Imprimer le ticket</Btn>
              <Btn variant="ghost" onClick={() => setCloture(null)}>Fermer</Btn>
            </div>
          </Banner>
        ) : null}
      </Card>
    </div>
  );
}