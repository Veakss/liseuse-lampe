# Liseuse à la lampe

Une liseuse qui tient dans une seule page. Ton livre s'ouvre dans une scène peinte qui suit l'heure et le temps : un coin lecture sous la lampe, une cheminée, une forêt, un lac sous la neige, une chambre japonaise, Paris… Chaque scène a son propre son, et le texte se pose sur une feuille, un chevalet, un cadre, un livre relié ou une bulle.

- **Formats** : PDF, ePub, Word, OpenDocument, RTF, texte, Markdown, HTML, FB2, Kindle sans DRM, et les pages scannées ou photographiées (reconnaissance de texte dans l'appli).
- **Bibliothèque** : tes livres sur une table en bois, avec ta page et tes notes pour chacun.
- **Surlignages et notes**, exportables en Markdown.
- **Rien ne sort de ton ordinateur** : tes livres, tes notes et tes réglages restent sur ta machine. Les polices sont dans l'appli, qui ne télécharge rien. Une seule exception : la reconnaissance de texte des pages scannées télécharge son moteur la première fois.

## Télécharger

Le site : **https://exigelabs.fr/liseuse/**. Les fichiers sont joints à chaque [version](https://github.com/Veakss/liseuse-lampe/releases) :

| Système | Fichier |
|---|---|
| Windows 10 et 11 (64 bits) | [l'installateur](https://github.com/Veakss/liseuse-lampe/releases/latest/download/Liseuse-a-la-lampe-1.0.0-win-x64.exe) (`.exe`), ou [la version portable](https://github.com/Veakss/liseuse-lampe/releases/latest/download/Liseuse-a-la-lampe-1.0.0-win-x64.zip) (`.zip`, sans installation) |
| Mac, Linux, ou tout système | [`liseuse.html`](https://github.com/Veakss/liseuse-lampe/releases/latest/download/liseuse.html) : la page seule, à ouvrir dans Chrome ou Edge |

L'application Windows n'est pas encore signée. Au premier lancement, Windows peut afficher « Windows a protégé votre ordinateur » : clique sur « Informations complémentaires », puis sur « Exécuter quand même ». Les empreintes SHA-256 des fichiers sont dans `SHA256SUMS.txt`, joint à chaque version.

## Le dépôt

| Dossier | Contenu |
|---|---|
| `app/` | Les sources de la page : `liseuse.template.html` (interface et lecture), `supports.js` (les supports du texte), `scenes.js` (les scènes peintes), `importers.js` (les formats de fichier), `sounds/` (les sons, créés dans le navigateur), `covers.js` (les couvertures de la bibliothèque), `fonts/` (les polices) |
| `desktop/` | L'application de bureau (Electron) qui embarque la page |
| `site/` | Le site de téléchargement, en pages statiques |

### Construire la page

```bash
cd app
PUBLIC=1 OUT=dist/liseuse.html python3 build.py
```

Il faut seulement Python 3. Le résultat, `app/dist/liseuse.html`, est la page complète : elle s'ouvre directement dans le navigateur, sans serveur.

### Construire l'application Windows

```bash
cd desktop
npm install
npm test
npm run build:win
```

Les fichiers sortent dans `desktop/dist/`. Le détail est dans [`desktop/README.md`](desktop/README.md).

## Licences

- Les polices (Source Serif 4, Literata, Hanken Grotesk, Atkinson Hyperlegible, et Geist pour le site) sont sous licence SIL Open Font License 1.1 : voir `app/fonts/LICENSES.md` et `site/polices/`.
- Le reste (le code de la liseuse, l'application Windows, le site) : licence MIT, voir `LICENSE`. Tu peux le reprendre, le modifier et le redistribuer, en gardant la mention de licence.
