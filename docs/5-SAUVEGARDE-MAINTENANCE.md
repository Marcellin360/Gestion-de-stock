# 5. Sauvegarde, restauration et maintenance

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



## 1. Ce qu’il faut sauvegarder

| Élément | Où | Fréquence |
|---|---|---|
| Base de données PostgreSQL | `pg_dump` du fichier `backup-pharmastock.sh` | quotidienne |
| Fichier de configuration | `/opt/pharmastock/backend/.env` | après chaque modification |
| Documents imprimés archivés | dossier de l’officine, si utilisé | selon l’usage |

Les données de l’application **ne sont jamais supprimées** (ni document, ni mouvement, ni lot, ni ligne
d’audit) : les déclencheurs PostgreSQL l’interdisent. Une sauvegarde quotidienne suffit donc à
retrouver l’état exact de l’officine.

## 2. Sauvegarde manuelle

```bash
sudo /usr/local/bin/backup-pharmastock
ls -lh /var/backups/pharmastock
```

Le script produit un fichier `pharmastock-AAAA-MM-JJ_HHMM.sql.gz`, supprime les sauvegardes de plus de
90 jours et vérifie l’intégrité de l’archive.

## 3. Copie hors du poste (recommandé)

1. Brancher une clé USB, la monter (ou configurer un montage automatique).
2. Ajouter une seconde ligne au cron :

```cron
45 20 * * * rsync -a --delete /var/backups/pharmastock/ /media/sauvegarde/pharmastock/
```

3. Vérifier une fois par mois qu’un fichier récent est présent sur la clé.

## 4. Restauration

```bash
sudo systemctl stop pharmastock
sudo -u postgres psql -c "DROP DATABASE pharmacie_stock;"
sudo -u postgres psql -c "CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING 'UTF8';"
gunzip -c /var/backups/pharmastock/pharmastock-2026-09-19_2030.sql.gz | sudo -u postgres psql -d pharmastock
sudo systemctl start pharmastock
curl -s http://127.0.0.1:3001/api/health
```

> Testez la restauration au moins une fois sur un poste de recette avant d’en avoir besoin.

## 5. Contrôle d’intégrité du stock

Dans l’interface : **Rapports → Contrôle d’intégrité**, ou en ligne de commande :

```bash
cd /opt/pharmastock
sudo -u www-data npm run check:integrity -w backend
```

Le contrôle vérifie, pour chaque lot, que `quantité en stock = somme des mouvements`.
Une anomalie signifie qu’une donnée a été modifiée hors de l’application : restaurez la dernière
sauvegarde saine puis analysez le journal d’audit.

## 6. Bonnes pratiques d’exploitation

- **Inventaire** complet au moins une fois par mois (écarts justifiés et tracés).
- **Alertes** du tableau de bord traitées chaque matin (ruptures, péremptions proches, lots bloqués).
- **Comptes** : un compte par personne, jamais partagé ; compte désactivé dès le départ d’un salarié.
- **Mots de passe** : 12 caractères minimum, modifiés au moins deux fois par an.
- **Journal d’audit** conservé au moins 10 ans (exigence réglementaire la plus courante) — il ne
  peut pas être modifié, seulement consulté.
- **Mises à jour** du système : `sudo apt update && sudo apt upgrade -y`, puis redémarrage du service.

## 7. Journal du service et diagnostic

```bash
systemctl status pharmastock --no-pager
journalctl -u pharmastock -n 100 --no-pager     # dernières lignes
journalctl -u pharmastock --since "1 hour ago"
tail -50 /var/log/pharmastock-backup.log
```

## 8. Fiche d’identité à remplir le jour de l’installation

| Information | Valeur |
|---|---|
| Adresse IP du poste | |
| Nom de la base / utilisateur | `pharmastock` / `pharmastock` |
| Mot de passe PostgreSQL | (registre sécurisé de l’officine) |
| Compte administrateur | |
| Dossier des sauvegardes | `/var/backups/pharmastock` |
| Clé USB de copie | |
| Date du dernier test de restauration | |
