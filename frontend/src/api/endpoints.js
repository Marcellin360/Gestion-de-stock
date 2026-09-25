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
  health: () => api.get('/health')
};

export const referentials = {
  search: term => api.get(`/search?q=${encodeURIComponent(term)}`),
  create: (resource, values) => api.post(`/${resource}`, values),
  update: (resource, id, values) => api.put(`/${resource}/${id}`, values),
  margin: (productId, marginRate, reason) => api.put(`/products/${productId}/margin`, { marginRate: Number(marginRate), reason }),
  priceHistory: productId => api.get(`/products/${productId}/prices`)
};

export const stock = {
  createReceipt: values => api.post('/receipts', values),

  // Transferts dépôt → pharmacie (remplacent les anciennes commandes/retours).
  transfers: () => api.get('/transfers'),
  transfer: id => api.get(`/transfers/${id}`),
  transferLots: location => api.get(`/transfers/lots?location=${location}`),
  createTransfer: values => api.post('/transfers', values),

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

export const documents = {
  list: () => api.get('/documents'),
  detail: (kind, id) => api.get(`/documents/${kind}/${id}`),
  cancel: (kind, id, reason) => api.post(`/documents/${kind}/${id}/cancel`, { reason })
};

export const reports = {
  load: ({ type, from, to, supplierId, location }) => {
    const query = new URLSearchParams({ type, from, to });
    if (supplierId) query.set('supplierId', supplierId);
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
  update: (id, values) => api.put(`/users/${id}`, values)
};
