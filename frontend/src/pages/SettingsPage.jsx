// Paramètres de l'officine : identité, valorisation du stock, formule du prix
// de vente (unique sur coût, 2.7.47), frais d'achat automatiques (% du PA,
// 2.7.47), taux de marge UNIQUE (2.7.48), horizon d'alerte de péremption. La
// valorisation est figée dès le premier mouvement (RG10, RG22).
// 2.7.30 — libellés expliqués (horizon d'alerte, valorisation figée) et page
// épurée : la bannière verbeuse « Valorisation figée » devient une ligne, et
// le bloc dangereux « vente de lots périmés » (case + note sécurité) quitte
// l'écran. `allowExpiredSale` reste dans `values` : il est renvoyé TEL QUEL à
// l'enregistrement (la valeur stockée en base n'est jamais modifiée ici).
import { useState } from 'react';
import { Save, Info } from 'lucide-react';
import { settings as settingsApi } from '../api/endpoints.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Btn, Card, ErrorBox, Field, Input, Select } from '../components/ui.jsx';
import { money, percent } from '../utils/format.js';

// 2.7.29 — liste de taux continue de `debut` à `fin` (pas de 1 %). Si la valeur
// enregistrée est hors de cette plage (ancien paramétrage 35 %, 40 %, 50 %…),
// elle est AJOUTÉE triée pour rester visible au lieu d'être écrasée.
const taux = (debut, fin, actuelle) => {
  const liste = [];
  for (let t = debut; t <= fin; t += 1) liste.push(t);
  const valeur = Number(actuelle);
  if (!liste.includes(valeur) && Number.isFinite(valeur)) {
    liste.push(valeur);
    liste.sort((a, b) => a - b);
  }
  return liste;
};

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
    // 2.7.47 — mode de marge UNIQUE sur coût : la valeur est conservée dans
    // l'objet (renvoyée au serveur) mais n'est plus proposée au choix.
    marginMode: settings.marginMode || 'COST',
    minMargin: Number(settings.minMargin ?? 10),
    maxMargin: Number(settings.maxMargin ?? 30),
    // 2.7.47 — taux des frais d'achat automatiques, % du PA (10 % par défaut).
    feesRate: Number(settings.feesRate ?? 10),
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
        feesRate: Number(values.feesRate),
        expiryDays: Number(values.expiryDays)
      });
      toast.success('Paramètres enregistrés.');
      maj({
        minMargin: Number(enregistre.minMargin),
        maxMargin: Number(enregistre.maxMargin),
        feesRate: Number(enregistre.feesRate ?? values.feesRate),
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
        {/* 2.7.30 — bannière verbeuse remplacée par UNE ligne d'information. */}
        <Field label="Méthode de valorisation du stock"
          hint={"Comment le coût d'un médicament est évalué : LOT = le vrai prix de chaque réception est gardé, lot par lot (conseillé en officine). CMP = un seul prix moyen, recalculé à chaque réception."}>
          <Select value={values.valuation} onChange={e => maj({ valuation: e.target.value })}>
            <option value="LOT">Coût de revient réel du lot</option>
            <option value="CMP">Coût moyen pondéré (CMP)</option>
          </Select>
        </Field>
        <p className="muted" style={{ fontSize: '.82rem' }}>
          {/* « Valorisation figée » en une phrase : la méthode se bloque dès le
              premier mouvement enregistré, sinon les coûts déjà calculés
              deviendraient faux. */}
          Stock actuel valorisé : <strong>{money(stats.stockValue)}</strong>
          {' — '}
          {stockValorise > 0
            ? 'des mouvements existent déjà : la méthode est figée (RG10), tout changement demanderait une reprise comptable complète.'
            : 'aucun mouvement enregistré pour l’instant : la méthode peut encore être choisie librement.'}
        </p>

        <Field label="Prix de vente calculé sur"
          hint="Coût moyen pondéré (CMP) : les réceptions du même médicament sont additionnées puis moyennées — conseillé en officine. Dernier lot : le prix suit la dernière livraison.">
          <Select value={values.pricingBasis} onChange={e => maj({ pricingBasis: e.target.value })}>
            <option value="CMP">Coût moyen pondéré (CMP) — la moyenne des réceptions</option>
            <option value="LOT">Coût du dernier lot reçu</option>
          </Select>
        </Field>

        {/* 2.7.47 — formule unique du prix de vente : PV = coût × (1 + taux).
            L'ancien mode « marge sur prix de vente » (coût ÷ (1−taux)) n'est
            plus proposé ; l'information reste lisible ici. */}
        <p className="muted" style={{ fontSize: '.82rem' }}>
          Formule du prix de vente : <strong>PV = coût × (1 + taux)</strong> — marge calculée sur coût ;
          le prix de vente est toujours calculé, jamais saisi (RG05).
        </p>

        {/* 2.7.47 — taux des FRAIS automatiques, % du prix d'achat (CU = PA ×
            (1 + taux/100)), modifiable à tout moment : s'applique aux
            réceptions suivantes, sans écraser les lots déjà reçus. */}
        <Field label="Frais d'achat (% du prix d'achat)"
          hint={`Frais appliqués automatiquement à chaque réception : coût unitaire = PA × (1 + ${values.feesRate} / 100). Par défaut 10 % : modifiable ici selon le besoin.`}>
          <Input type="number" min="0" max="99.99" step="0.01" value={values.feesRate}
            onChange={e => maj({ feesRate: e.target.value })} required />
        </Field>

        <div className="grid grid--2">
          {/* 2.7.48 — « Taux de marge » UNIQUE (fin de la plage min/max dans
              l'interface) : un seul champ, liste déroulante de 10 % à 30 %
              (liste continue, 2.7.29) ; le taux retenu est appliqué par le
              serveur à TOUS les médicaments (PV = coût × (1 + taux)). */}
          <Field label="Taux de marge (%)" hint="Un seul taux pour tous les médicaments — il s'applique à tout le catalogue à l'enregistrement (prix recalculés tout de suite)">
            <Select value={values.minMargin}
              onChange={e => { const t = Number(e.target.value); maj({ minMargin: t, maxMargin: t }); }}>
              {taux(10, 30, values.minMargin).map(t => <option key={t} value={t}>{t} %</option>)}
            </Select>
          </Field>
        </div>
        <p className="muted" style={{ fontSize: '.82rem' }}>
          Taux appliqué à tous les médicaments : {percent(values.minMargin)}.
          Le prix de vente de chaque médicament est recalculé dès l’enregistrement (PV = coût × (1 + taux)).
        </p>
      </Card>

      <Card title="Alertes de péremption">
        {/* 2.7.30 — libellé auto-explicatif : c'est le nombre de jours AVANT la
            date d'expiration où le lot commence à être signalé. */}
        <Field label="Alerte de péremption — jours avant l’expiration"
          hint="Nombre de jours AVANT la date d'expiration où le lot apparaît déjà dans les alertes (« expire bientôt ») et sur le tableau de bord. Exemple : 90 jours ≈ vous êtes prévenu environ 3 mois avant l'expiration, pour avoir le temps de vendre ou de traiter le lot.">
          <Select value={values.expiryDays} onChange={e => maj({ expiryDays: e.target.value })}>
            {[30, 60, 90, 120, 180].map(jours => (
              <option key={jours} value={jours}>
                {jours} jours{jours === 30 ? ' (≈ 1 mois)' : jours === 60 ? ' (≈ 2 mois)' : jours === 90 ? ' (≈ 3 mois, conseillé)' : jours === 120 ? ' (≈ 4 mois)' : ' (≈ 6 mois)'}
              </option>
            ))}
          </Select>
        </Field>
        <p className="muted" style={{ fontSize: '.82rem' }}>
          Un lot périmé n'est JAMAIS vendable : il est exclu de la vente et de la proposition FEFO (RG09).
          Il reste visible dans les rapports pour être traité (retour, destruction).
        </p>
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