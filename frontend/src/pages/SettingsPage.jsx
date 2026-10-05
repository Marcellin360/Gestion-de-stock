// Paramètres de l'officine : identité, valorisation du stock, mode et plage de
// marge, horizon d'alerte de péremption. La valorisation est figée dès le
// premier mouvement (RG10, RG22).
import { useState } from 'react';
import { Save, Info } from 'lucide-react';
import { settings as settingsApi } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Banner, Btn, Card, Check, ErrorBox, Field, Input, Select } from '../components/ui.jsx';
import { money, percent } from '../utils/format.js';

export default function SettingsPage() {
  const { settings, stats, refresh } = useData();
  const toast = useToast();
  const [values, setValues] = useState(() => ({
    pharmacyName: settings.pharmacyName || '',
    address: settings.address || '',
    phone: settings.phone || '',
    managerName: settings.managerName || '',
    currency: settings.currency || 'Ar',
    valuation: settings.valuation || 'LOT',
    pricingBasis: settings.pricingBasis || 'CMP',
    marginMode: settings.marginMode || 'COST',
    minMargin: Number(settings.minMargin ?? 10),
    maxMargin: Number(settings.maxMargin ?? 30),
    expiryDays: Number(settings.expiryDays ?? 90),
    allowExpiredSale: Boolean(settings.allowExpiredSale)
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const maj = patch => setValues(etat => ({ ...etat, ...patch }));

  const enregistrer = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const enregistre = await settingsApi.save({
        ...values,
        minMargin: Number(values.minMargin),
        maxMargin: Number(values.maxMargin),
        expiryDays: Number(values.expiryDays)
      });
      toast.success('Paramètres enregistrés.');
      maj({
        minMargin: Number(enregistre.minMargin),
        maxMargin: Number(enregistre.maxMargin),
        expiryDays: Number(enregistre.expiryDays)
      });
      await refresh();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const stockValorise = Number(stats.stockValue || 0);

  return (
    <form onSubmit={enregistrer} className="grid grid--2">
      <ErrorBox error={error} />

      <Card title="Identité de l’officine">
        <Field label="Nom de la pharmacie"><Input value={values.pharmacyName} onChange={e => maj({ pharmacyName: e.target.value })} required /></Field>
        <Field label="Adresse"><Input value={values.address} onChange={e => maj({ address: e.target.value })} /></Field>
        <Field label="Téléphone"><Input value={values.phone} onChange={e => maj({ phone: e.target.value })} /></Field>
        <Field label="Responsable (pharmacien titulaire)"><Input value={values.managerName} onChange={e => maj({ managerName: e.target.value })} /></Field>
        <Field label="Devise" hint="Le montant est affiché avec cette unité sur tous les écrans et documents.">
          <Input value={values.currency} onChange={e => maj({ currency: e.target.value })} maxLength={8} required />
        </Field>
      </Card>

      <Card title="Valorisation et marges">
        <Banner tone={stockValorise > 0 ? 'warn' : 'info'}
          title={stockValorise > 0 ? 'Valorisation figée' : 'Valorisation encore modifiable'}>
          <div className="row row--tight">
            <span>
              {stockValorise > 0
                ? 'Des mouvements existent déjà : la méthode de valorisation ne peut plus changer sans migration comptable.'
                : 'Aucun mouvement enregistré : la méthode peut encore être choisie librement.'}
            </span>
          </div>
          <small>Stock actuel valorisé : {money(stats.stockValue)}</small>
        </Banner>

        <Field label="Méthode de valorisation du stock"
          hint="LOT : coût de revient réel du lot (recommandé pour une officine). CMP : coût moyen pondéré du médicament.">
          <Select value={values.valuation} onChange={e => maj({ valuation: e.target.value })}>
            <option value="LOT">Coût de revient réel du lot</option>
            <option value="CMP">Coût moyen pondéré (CMP)</option>
          </Select>
        </Field>

        <Field label="Prix de vente calculé sur"
          hint="Coût moyen pondéré (CMP) : les réceptions du même médicament sont additionnées puis moyennées — conseillé en officine. Dernier lot : le prix suit la dernière livraison.">
          <Select value={values.pricingBasis} onChange={e => maj({ pricingBasis: e.target.value })}>
            <option value="CMP">Coût moyen pondéré (CMP) — la moyenne des réceptions</option>
            <option value="LOT">Coût du dernier lot reçu</option>
          </Select>
        </Field>

        <Field label="Mode de calcul de la marge" hint="Le prix de vente est toujours calculé, jamais saisi (RG05).">
          <Select value={values.marginMode} onChange={e => maj({ marginMode: e.target.value })}>
            <option value="COST">Marge sur coût d’achat : prix = coût × (1 + taux)</option>
            <option value="SALE">Marge sur prix de vente : prix = coût ÷ (1 − taux)</option>
          </Select>
        </Field>

        <div className="grid grid--2">
          <Field label="Taux de marge minimum (%)" hint="Choisissez dans la liste">
            <Select value={values.minMargin} onChange={e => maj({ minMargin: e.target.value })}>
              {[10, 12, 15, 20, 25, 30].map(taux => <option key={taux} value={taux}>{taux} %</option>)}
            </Select>
          </Field>
          <Field label="Taux de marge maximum (%)" hint="Choisissez dans la liste">
            <Select value={values.maxMargin} onChange={e => maj({ maxMargin: e.target.value })}>
              {[15, 20, 25, 30, 35, 40, 50].map(taux => <option key={taux} value={taux}>{taux} %</option>)}
            </Select>
          </Field>
        </div>
        <p className="muted" style={{ fontSize: '.82rem' }}>
          Plage appliquée à tous les médicaments : de {percent(values.minMargin)} à {percent(values.maxMargin)}.
          Toute valeur hors plage est refusée, à la création comme à la modification d’une fiche.
        </p>
      </Card>

      <Card title="Alertes de péremption">
        <Field label="Horizon d’alerte (jours)"
          hint="Un lot est signalé « expiration proche » lorsqu’il expire dans ce délai.">
          <Select value={values.expiryDays} onChange={e => maj({ expiryDays: e.target.value })}>
            {[30, 60, 90, 120, 180].map(jours => (
              <option key={jours} value={jours}>{jours} jours{jours === 90 ? ' (conseillé)' : ''}</option>
            ))}
          </Select>
        </Field>
        <Check label="Autoriser exceptionnellement la vente de lots périmés (déconseillé)"
          checked={values.allowExpiredSale} onChange={e => maj({ allowExpiredSale: e.target.checked })} />
        <Banner tone="warn" title="Sécurité sanitaire">
          <span>
            Laisser cette case décochée : un lot périmé est exclu de la vente et de la proposition FEFO (RG09).
            Cette autorisation est journalisée dès qu’elle est activée.
          </span>
        </Banner>
      </Card>

      <Card title="Enregistrement">
        <div className="row">
          <Info size={18} />
          <span className="muted">Toute modification est tracée dans le journal d’audit (anciennes et nouvelles valeurs).</span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Btn variant="primary" type="submit" icon={Save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer les paramètres'}</Btn>
        </div>
      </Card>
    </form>
  );
}