# Liseuse à la lampe — version bureau

Enveloppe Electron de la page `liseuse.html` (une seule page HTML, aucune dépendance distante hors polices et OCR déjà prévus par la page). Cible de publication : **Windows 10/11 x64**. Le build macOS arm64 ne sert qu'à tester ici (pas de licence développeur Apple).

Le dossier ne modifie jamais les sources de la page : il en **copie** `liseuse.html` dans `app/index.html` à chaque build.

## Ce que fait l'enveloppe

- La page est servie par un schéma privilégié `app://liseuse/index.html` (standard, sécurisé, `fetch` permis), jamais en `file://`. L'origine est stable : `localStorage` et IndexedDB survivent aux redémarrages et aux mises à jour.
- Données utilisateur : `%APPDATA%\Liseuse-a-la-lampe` sous Windows (`~/Library/Application Support/Liseuse-a-la-lampe` sous macOS). Une désinstallation ne les efface pas.
- Fenêtre : titre « Liseuse à la lampe », fond sombre jusqu'à `ready-to-show`, minimum 960 × 600, taille/position/maximisée/plein écran mémorisées (`window-state.json`), F11 (Ctrl+Cmd+F sur Mac) bascule le plein écran, une seule instance.
- Pas de barre de menu sous Windows. Menu minimal sous macOS (copier, coller, tout sélectionner, annuler, quitter).
- Verrouillage : `contextIsolation` actif, `nodeIntegration` coupé, preload minuscule, fenêtre sandboxée, navigation hors de l'app refusée, liens `http(s)` ouverts dans le navigateur par défaut, correcteur orthographique coupé, permissions refusées sauf `clipboard-sanitized-write` et le plein écran (l'ambiance de la page l'utilise). Fusibles Electron : `runAsNode` et les options Node coupés, `onlyLoadAppFromAsar` actif.
- Téléchargements (export des notes) : boîte « Enregistrer sous » proposée dans Documents, nom suggéré gardé.
- « Ouvrir avec » : Windows (`.epub .pdf .fb2 .mobi .azw3 .txt .docx .odt .rtf .cbz`, dans « Ouvrir avec » seulement : l'app ne devient **pas** lecteur par défaut des `.pdf` ou `.txt`), macOS (`open-file`). Un second lancement avec un fichier l'envoie à la fenêtre déjà ouverte. Le preload remet le fichier à la page comme le fait le bouton « Ouvrir » : un `File` dans `#file`, puis un événement `change`.

## Prérequis pour construire

- Node 22 ou plus, npm.
- Python 3 et Google Chrome (seulement pour refaire les icônes : `npm run icons`).
- Aucun wine : les métadonnées et l'icône de l'exe Windows sont posées par `resedit` (JavaScript pur). Voir « Limites ».

```bash
cd desktop    # le dossier de l’application de bureau dans le dépôt
npm install
node node_modules/electron/install.js    # seulement si npm ne télécharge pas le binaire Electron (cache npm en lecture seule)
```

## Construire

La page copiée vient par défaut de `../liseuse-lampe-src/dist/liseuse.html`, la version publique ; `LISEUSE_HTML=/chemin/liseuse.html` l'écrase. La copie refuse une page qui n'est pas la version publique.

| Commande | Résultat |
| --- | --- |
| `npm run build:win` | `dist/Liseuse-a-la-lampe-1.0.0-win-x64.exe` (installateur NSIS), `dist/Liseuse-a-la-lampe-1.0.0-win-x64.zip` (portable), `dist/SHA256SUMS.txt` |
| `npm run build:mac` | `dist/mac-arm64/Liseuse-a-la-lampe.app` (test local, signature ad hoc) |
| `npm run prepare:page` | copie seulement la page dans `app/` |
| `npm start` | lance l'app depuis les sources (Electron non empaqueté) |
| `npm run inspect:win` | lit l'exe Windows (icône, version, signé ou non) |
| `npm run icons` | refait `build/icon.ico`, `build/icon.icns`, `build/icon.png` depuis le symbole `i-lamp` de la page |

**Après un changement de la page :** reconstruire la version publique dans `liseuse-lampe-src` (`PUBLIC=1 OUT=dist/liseuse.html python3 build.py`), puis `npm run build:win` (la copie dans `app/` est refaite à chaque build, `app/page.json` garde la source, la taille et le SHA-256 de la page embarquée). Pour une nouvelle version : changer `version` dans `package.json` et dans `RELEASE.md`.

L'installateur NSIS : par utilisateur (pas de droits administrateur), choix du dossier, raccourcis bureau et menu Démarrer, en français. Le zip contient un dossier `Liseuse-a-la-lampe-1.0.0-win-x64/` avec un `LISEZMOI.txt`.

## Tester

```bash
npm run build:mac && npm test
```

`test/run.mjs` lance quatre fois l'app (profil neuf, puis le même profil) avec `--remote-debugging-port`, pilote la page par CDP, et ne tue que les processus qu'il a lancés (par PID). Il vérifie : page chargée sans erreur console, contexte sécurisé et isolé, titre et taille minimum, `localStorage` et IndexedDB conservés après un arrêt complet, fenêtre restaurée, second lancement avec un fichier (instance unique), import d'un `.txt` et d'un `.md` factices, ouverture à froid avec un fichier, export des notes enregistré sans boîte de dialogue, liens externes sortis, navigation refusée, permissions, son démarré sans erreur (volume 0, processus muet), F11 et plein écran mémorisé. Les textes de test sont des phrases factices écrites pour les tests, jamais un vrai livre. Le résultat est écrit dans `test/last-run.json` (dernier essai : 41 réussis, 0 échec, 1 note). Les deux lancements en plein écran prennent l'écran du Mac quelques secondes.

Variables d'environnement de test (sans effet en usage normal) :

- `LISEUSE_TEST_DOWNLOAD_DIR` : les téléchargements sont enregistrés là sans boîte de dialogue.
- `LISEUSE_TEST_LOG` : fichier JSON-lines où l'app note ce qu'elle fait (fenêtre montrée, liens externes, navigation refusée, permissions refusées, téléchargements). Avec cette variable, les liens externes sont notés et non ouverts, la fenêtre s'affiche sans prendre le focus et le Dock macOS est masqué.
- `LISEUSE_BIN` : exécutable à tester pour `npm test` (par exemple `dist/win-unpacked/Liseuse-a-la-lampe.exe` sous Windows).

## Limites connues

- **Pas de signature** : le `.exe` n'est pas signé (pas de certificat). Windows SmartScreen affiche un avertissement au premier lancement : voir `RELEASE.md`.
- **Sans wine** : le build Windows se fait sur le Mac, sans wine (non installé). L'exe de l'app reçoit son icône et ses métadonnées (nom, version, description, copyright) par `resedit`, en JavaScript pur ; l'installateur NSIS est produit par le `makensis` fourni avec electron-builder et porte lui aussi l'icône et ses métadonnées. `npm run inspect:win` les relit (vérifié : x64, icône 16 à 256 px, version 1.0.0, nom « Liseuse à la lampe »). Limite : rien de tout cela n'a pu être **exécuté** ici (pas de Windows). L'installateur est vérifié par son contenu (interface en français seulement, installation par utilisateur, écritures de registre « Ouvrir avec » pour les 10 extensions et aucune pour le programme par défaut), pas par un essai d'installation.
- **Accent sur macOS** : le nom de produit accentué fait planter Electron 45 sur macOS (noms de fichiers en Unicode décomposé dans le `.app`). C'est pourquoi `build:mac` force `--config.productName=Liseuse-a-la-lampe`. Sous Windows, le nom accentué est gardé (raccourcis, désinstallation) et l'exe est `Liseuse-a-la-lampe.exe`.
- Les polices Google de la page se chargent par le réseau ; hors ligne, la page garde ses polices de secours.
- La page n'a pas de CSP (elle a besoin de scripts en ligne) ; Electron l'avertit en mode développement seulement.
- La maximisation restaurée et tout ce qui est propre à Windows (associations, raccourcis, SmartScreen) n'ont pas pu être essayés sur ce Mac.
