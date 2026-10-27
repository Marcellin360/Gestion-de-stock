// ============================================================================
// Toutes les routes de l'API regroupées par module : l'interface n'appelle
// jamais fetch directement, ce qui garde un seul contrat lisible.
// ============================================================================
import { api } from './client.js';

export const auth = {
  login: (login, password) => api.post('/auth/login', { login, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  password: values => api.post('/auth/password', values)
};

export const dashboard = {
  data: () => api.get('/data'),
  health: () => api.get('/health'),
  // 2.7.17 — calendrier des ventes (totaux jour par jour d'un mois).
  salesCalendar: month => api.get(`/data/sales-calendar?month=${month}`),
  // 2.7.18 — histogramme du tableau de bord (totaux mois par mois, 12 mois).
  salesMonthly: () => api.get('/data/sales-monthly'),
  // 2.7.20 — dépôt : calendrier des stock (J/J) et flux mensuels entrées/sorties.
  stockCalendar: month => api.get(`/data/stock-calendar?month=${month}`),
  stockFlowMonthly: () => api.get('/data/stock-flow-monthly')
};

export const referentials = {
  search: term => api.get(`/search?q=${encodeURIComponent(term)}`),
  create: (resource, values) => api.post(`/${resource}`, values),
  update: (resource, id, values) => api.put(`/${resource}/${id}`, values),
  /** Suppression (fournisseurs uniquement : les autres référentiels sont cités par l'historique). */
  remove: (resource, id) => api.delete(`/${resource}/${id}`),
  margin: (productId, marginRate, reason) => api.put(`/products/${productId}/margin`, { marginRate: Number(marginRate), reason }),
  priceHistory: productId => api.get(`/products/${productId}/prices`)
};

export const stock = {
  createReceipt: values => api.post('/receipts', values),
  // 2.7.34 — teboka ③ : corrections de réception (dépôt propose → admin tranche).
  proposerCorrection: (receiptId, values) => api.post(`/receipts/${receiptId}/corrections`, values),
  corrections: status => api.get(`/receipt-corrections${status ? `?status=${status}` : ''}`),
  correctionDetail: id => api.get(`/receipt-corrections/${id}`),
  validerCorrection: (id, note) => api.post(`/receipt-corrections/${id}/validate`, { note }),
  refuserCorrection: (id, note) => api.post(`/receipt-corrections/${id}/refuse`, { note }),

  // Transferts dépôt → pharmacie (remplacent les anciennes commandes/retours).
  transfers: () => api.get('/transfers'),
  transfer: id => api.get(`/transfers/${id}`),
  transferLots: location => api.get(`/transfers/lots?location=${location}`),
  createTransfer: values => api.post('/transfers', values),
  // 2.7.79 — corrections de transfert (dépôt propose → admin tranche), même
  // workflow que les corrections de réception.
  proposerCorrectionTransfert: (transferId, values) => api.post(`/transfers/${transferId}/corrections`, values),
  correctionsTransfert: status => api.get(`/transfer-corrections${status ? `?status=${status}` : ''}`),
  correctionTransfertDetail: id => api.get(`/transfer-corrections/${id}`),
  validerCorrectionTransfert: (id, note) => api.post(`/transfer-corrections/${id}/validate`, { note }),
  refuserCorrectionTransfert: (id, note) => api.post(`/transfer-corrections/${id}/refuse`, { note }),

  quoteSale: values => api.post('/sales/quote', values),
  createSale: values => api.post('/sales', values),

  createLoss: values => api.post('/losses', values),

  lots: location => api.get(`/lots${location ? `?location=${location}` : ''}`),
  lotMovements: id => api.get(`/lots/${id}/movements`),
  setLotStatus: (id, status, reason) => api.put(`/lots/${id}/status`, { status, reason }),

  inventories: () => api.get('/inventories'),
  inventory: id => api.get(`/inventories/${id}`),
  openInventory: values => api.post('/inventories', values),
  validateInventory: (id, values) => api.post(`/inventories/${id}/validate`, values),
  abandonInventory: (id, reason) => api.post(`/inventories/${id}/abandon`, { reason })
};

// 2.7.35 + 2.7.36 — hôpital : carnets (patients + prescripteurs), TDR par
// périodes de dates, et SÉJOURS (historique « Clients hôpital » + ordonnance
// récapitulative unique par hospitalisation).
export const hopital = {
  patients: () => api.get('/patients'),
  createPatient: values => api.post('/patients', values),
  updatePatient: (id, values) => api.put(`/patients/${id}`, values),
  staff: () => api.get('/staff'),
  createStaff: values => api.post('/staff', values),
  updateStaff: (id, values) => api.put(`/staff/${id}`, values),
  activiteStaff: id => api.get(`/staff/${id}/activite`),
  sejours: () => api.get('/patients/sejours'),
  sejour: id => api.get(`/patients/${id}/sejour`)
};

export const documents = {
  list: () => api.get('/documents'),
  detail: (kind, id) => api.get(`/documents/${kind}/${id}`),
  cancel: (kind, id, reason) => api.post(`/documents/${kind}/${id}/cancel`, { reason })
};

export const reports = {
  load: ({ type, from, to, supplierId, productId, location }) => {
    const query = new URLSearchParams({ type, from, to });
    if (supplierId) query.set('supplierId', supplierId);
    if (productId) query.set('productId', productId);
    if (location) query.set('location', location);
    return api.get(`/reports?${query}`);
  },
  audit: page => api.get(`/audit?page=${page}`),
  integrity: () => api.get('/audit/integrity'),
  queryString: ({ type, from, to, supplierId, location }) => {
    const query = new URLSearchParams({ type, from, to });
    if (supplierId) query.set('supplierId', supplierId);
    if (location) query.set('location', location);
    return query.toString();
  }
};

export const settings = {
  load: () => api.get('/settings'),
  save: values => api.put('/settings', values)
};

export const users = {
  list: () => api.get('/users'),
  roles: () => api.get('/users/roles'),
  create: values => api.post('/users', values),
  update: (id, values) => api.put(`/users/${id}`, values),
  // 2.7.29 — suppression définitive (bouton corbeille de l'administration).
  supprimer: id => api.delete(`/users/${id}`)
};