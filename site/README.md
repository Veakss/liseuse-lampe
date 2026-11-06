# Site de « Liseuse à la lampe »

Une page statique (HTML, CSS, un peu de JavaScript), sans framework ni service extérieur. Elle était prévue pour **https://exigelabs.fr/liseuse/** ; cette adresse ouvre finalement la liseuse elle-même (voir `web/` à la racine du dépôt), et ce site n'est pas en ligne pour l'instant. Les chemins sont relatifs : le dossier peut aussi aller à la racine d'un autre domaine.

## Ce qu'il faut changer pour une nouvelle version

- `config.js` : le numéro de version, le nom des fichiers joints à la version GitHub, leurs tailles. C'est le seul endroit des liens de téléchargement et de GitHub.
- Ailleurs que sur exigelabs.fr/liseuse/ : les adresses complètes de l'en-tête de `index.html` (`canonical`, `og:url`, `og:image`, `twitter:image`), la ligne `<base href="/liseuse/">` de `404.html` et la ligne `ErrorDocument` de `.htaccess`.

## Refaire les captures d'écran

```
./shots/make.sh                    # les captures de base
./shots/make.sh coin-nuit          # une seule
APP=/chemin/liseuse.html ./shots/make.sh   # une autre version de l'application
```

Les galeries : `scene-<clé>` (une scène seule, sans texte) et `heure-<clé>-<météo>` (la scène à un moment, avec le texte). Les clés et les étapes sont dans `shots/plan.mjs`. Il faut `node`, `cwebp` et Google Chrome. Les captures montrent le livre d'exemple de l'application, jamais un livre réel.

## Fichiers

`index.html`, `404.html`, `.htaccess` (la page 404 sur Apache), `site.css`, `site.js`, `config.js`, `favicon.svg` / `.ico`, `apple-touch-icon.png`, `img/` (captures `.webp`, `partage.jpg`), `polices/` (Literata et Geist, licence OFL).
