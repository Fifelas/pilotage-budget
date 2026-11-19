# Pilotage budget

Appli du foyer pour le budget, les courses, les prix et les recettes.
Un seul code pour deux versions :

- **Version ordi** : publiée automatiquement sur GitHub Pages — https://fifelas.github.io/pilotage-budget/
- **Appli Android (APK)** : compilée par GitHub Actions et publiée dans les *Releases*. L'appli signale elle-même les nouvelles versions.

## Ce qui fonctionne (version 0.1)

- Comptes individuels (e-mail + mot de passe) et **foyer partagé** avec code d'invitation.
- **Liste de courses partagée en direct** : ce que l'un ajoute ou coche apparaît tout de suite chez l'autre.
- Bandeau « Nouvelle version disponible » dans l'APK.

En cours de migration depuis la version Claude : budget et relevés bancaires (stockés **uniquement sur le téléphone**), prêt, menus, comparateur de prix (Open Prices, Open Food Facts), recettes (TheMealDB traduites sur le téléphone), lecture des tickets de caisse sur le téléphone.

## Mise en route (une seule fois)

### 1. Base de données Supabase
1. Ouvre le projet sur supabase.com, menu **SQL Editor** > **New query**.
2. Colle tout le contenu de `supabase/migrations/001_init.sql` et clique **Run**.
3. Puis fais de même avec `supabase/migrations/002_coffre_caddie_stock.sql` (coffre chiffré, caddie, stock).
3. Menu **Authentication** > **URL Configuration** : mets `https://fifelas.github.io/pilotage-budget/` dans **Site URL** (c'est là que mènent les liens de confirmation d'e-mail).

### 2. Version ordi (GitHub Pages)
Dans le dépôt : **Settings** > **Pages** > *Build and deployment* > **Source : GitHub Actions**.
Chaque modification de `main` met le site à jour en 1 à 2 minutes.

### 3. Clé de signature Android
Dans le dépôt : **Settings** > **Secrets and variables** > **Actions** > **New repository secret**, quatre fois :
`ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEYSTORE_BASE64`
(valeurs fournies à part, jamais dans le dépôt).

## Publier une nouvelle version Android
1. Onglet **Actions** > **Publier une version Android** > **Run workflow**.
2. Saisis le numéro (ex. `0.2.0`, toujours plus grand que le précédent) et les nouveautés.
3. 5 à 10 minutes plus tard, l'APK est dans **Releases**. Sur les téléphones, l'appli propose « Installer ».

Première installation : sur le téléphone, ouvre la page **Releases** du dépôt, télécharge le fichier `.apk`, puis autorise l'installation depuis le navigateur quand Android le demande.

## Développer sur ordi
```
npm install
npm run dev
```

## Données et confidentialité
- Les courses, tickets, prix et menus sont dans Supabase, accessibles **uniquement aux membres du foyer** (règles d'accès RLS).
- Les relevés bancaires ne quittent pas le téléphone.
- La clé Supabase présente dans le code est la clé publique (« publishable »), prévue pour être intégrée dans une appli.

## Sources de données
Open Food Facts, Open Prices, Open Products Facts (licence ODbL) · OpenStreetMap (© contributeurs OpenStreetMap, ODbL) · TheMealDB.
