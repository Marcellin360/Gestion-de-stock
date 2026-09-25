// Les données de santé et de stock ne doivent jamais être mises en cache par un intermédiaire.
export function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
}
