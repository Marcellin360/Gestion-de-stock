// Ventes : proposition FEFO puis validation (§9.10).
import { read, write } from '../utils/transaction.js';
import { quoteSale, createSale } from '../services/sale.service.js';

// La vente se fait au comptoir : seuls ADMIN et PHARMACIST ont la permission
// « sale » (le dépôt n'y a pas accès et ne voit jamais les prix de vente).
export async function quote(req, res) {
  const devis = await read(transaction => quoteSale(req.body, transaction));
  res.json(devis);
}

export async function create(req, res) {
  const { sale, lines } = await write(transaction => createSale(req.body, req.user, transaction));
  res.status(201).json({
    id: sale.id, reference: sale.reference, location: 'PHARMACY',
    total: sale.total, margin: sale.margin, lines
  });
}
