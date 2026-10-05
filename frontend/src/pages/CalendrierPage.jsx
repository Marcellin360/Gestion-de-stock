// ============================================================================
// 2.7.18 — PAGE « CALENDRIER DES VENTES » : le suivi des ventes n'est plus sur
// le tableau de bord mais dans SON MENU, juste sous « Vente ».
//
// Hanarahana-maso ny varotra isan'andro : calendrier mensuel, chaque jour
// affiche le nombre de ventes et le total encaissé ; un clic sur une date
// ouvre le détail complet du jour (tickets, articles, montants, marges).
// Le composant est le même que celui construit en 2.7.17 — seule sa place
// dans la navigation change.
// ============================================================================
import SalesCalendar from '../components/SalesCalendar.jsx';

export default function CalendrierPage() {
  return <SalesCalendar />;
}