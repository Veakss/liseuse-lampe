# Publier la version Windows (GitHub Release)

Version : **1.0.0**. Dépôt : https://github.com/Veakss/liseuse-lampe (les fichiers se joignent à la Release avec `gh release create` ou `gh release upload`).

## Fichiers à joindre à la Release

Dans `dist/` après `npm run build:win` :

| Fichier | À quoi il sert | Taille |
| --- | --- | --- |
| `Liseuse-a-la-lampe-1.0.0-win-x64.exe` | Installateur (par utilisateur, sans droits administrateur, dossier au choix, raccourcis bureau et menu Démarrer) | 105,1 Mo (105 088 439 octets) |
| `Liseuse-a-la-lampe-1.0.0-win-x64.zip` | Version portable (dézipper, lancer `Liseuse-a-la-lampe.exe`) | 147,9 Mo (147 936 327 octets) |
| `liseuse.html` | La page seule, pour Mac et Linux (Chrome ou Edge) : la même que celle de l'application | environ 7 Mo |
| `SHA256SUMS.txt` | Empreintes SHA-256 des trois fichiers ci-dessus | quelques lignes |

Ne pas joindre : `win-unpacked/`, `mac-arm64/`, `*.blockmap`, `builder-debug.yml`.

Empreintes SHA-256 de cette version (à recalculer si on reconstruit : `npm run build:win` réécrit `SHA256SUMS.txt`) :

```
f169769454ee958970b2607e1b5ef5a9f249be6e847de36510e5456089de7809  Liseuse-a-la-lampe-1.0.0-win-x64.exe
1a13a7374f89146272cd7691ff58687ede0575345cb977a8ba310aacaf0a9aff  Liseuse-a-la-lampe-1.0.0-win-x64.zip
04fcaa78c8912eafd48512ccfc524843eae6e58fbcfe2ff6b11a3e23bd3caf61  liseuse.html
```

Vérifier sous Windows (PowerShell) : `Get-FileHash .\Liseuse-a-la-lampe-1.0.0-win-x64.exe -Algorithm SHA256`. Vérifier sous macOS ou Linux : `shasum -a 256 -c SHA256SUMS.txt`.

## Texte proposé pour la Release (à coller)

> **Liseuse à la lampe 1.0.0 pour Windows**
>
> Une liseuse qui suit l'heure et la météo : scènes peintes, sons d'ambiance, bibliothèque en table de bois, surlignages et notes. Tout reste sur ton ordinateur.
>
> - `Liseuse-a-la-lampe-1.0.0-win-x64.exe` : l'installateur (Windows 10 ou 11, 64 bits).
> - `Liseuse-a-la-lampe-1.0.0-win-x64.zip` : la version portable, sans installation.
> - `liseuse.html` : la page seule, pour Mac et Linux, à ouvrir dans Chrome ou Edge.
> - `SHA256SUMS.txt` : les empreintes pour vérifier ton téléchargement.
>
> Windows peut afficher un avertissement au premier lancement, parce que l'application n'est pas signée : voir « Si Windows affiche un avertissement » ci-dessous.

## Si Windows affiche un avertissement (texte pour les lecteurs)

Au premier lancement, Windows peut afficher **« Windows a protégé votre ordinateur »** (SmartScreen). Ce n'est pas un virus : cet écran apparaît pour toute application qui n'a pas de signature payante et que peu de personnes ont déjà lancée. La Liseuse n'est pas signée, parce qu'un certificat de signature coûte cher chaque année.

Pour continuer :

1. Clique sur **« Informations complémentaires »** (le petit lien sous le message).
2. Clique sur **« Exécuter quand même »**.

Tu ne le fais qu'une fois par fichier téléchargé. Si tu préfères vérifier avant, compare l'empreinte SHA-256 du fichier avec celle de `SHA256SUMS.txt` (commande ci-dessus). Si les deux ne sont pas identiques, ne lance pas le fichier et télécharge-le de nouveau.

Navigateur : Edge ou Chrome peuvent aussi dire que le fichier « n'est pas téléchargé couramment ». Choisis **« Conserver »** (le menu « … » à côté du téléchargement).

Antivirus : un antivirus très prudent peut mettre l'installateur en quarantaine par erreur (faux positif courant pour les programmes non signés). Dans ce cas, ajoute une exception pour le fichier ou utilise la version portable.

## Ce qu'il faut pour l'installer

- Windows 10 ou Windows 11, **64 bits** (x64), à jour. Pas de version pour Windows 7 ou 8. Sur un PC à processeur ARM, l'installateur et l'appli passent par l'émulation x64 de Windows 11 (non essayé).
- Environ 330 Mo d'espace disque une fois installée (le téléchargement fait environ 105 Mo).
- Aucun droit d'administrateur : l'installation est faite pour ton compte seulement (dossier par défaut : `%LOCALAPPDATA%\Programs\Liseuse à la lampe`).
- Pas besoin d'Internet pour lire. Seules les polices de la page et le module de reconnaissance de texte (OCR) vont les chercher en ligne.

## Où sont tes données, et comment les garder

Tes réglages, ta bibliothèque, tes notes et ta place dans chaque livre sont dans `%APPDATA%\Liseuse-a-la-lampe`. Une mise à jour ou une désinstallation **ne les efface pas**. Pour les sauvegarder, copie ce dossier (appli fermée).

## « Ouvrir avec »

L'installateur ajoute la Liseuse à la liste « Ouvrir avec » des fichiers `.epub .pdf .fb2 .mobi .azw3 .txt .docx .odt .rtf .cbz`. Elle **ne remplace pas** ton lecteur habituel (elle ne devient pas l'application par défaut des `.pdf` ou `.txt`). Pour la choisir une fois pour toutes : clic droit sur un fichier, « Ouvrir avec », « Choisir une autre application », puis coche « Toujours utiliser cette application ». La version portable n'ajoute rien à Windows.

## Désinstaller

Paramètres, Applications, « Liseuse à la lampe », Désinstaller. Les données (ci-dessus) restent, au cas où tu la réinstalles.

## Pour toi, avant de publier

1. Dans `liseuse-lampe-src` : `PUBLIC=1 OUT=dist/liseuse.html python3 build.py` (la version publique), puis ici `npm run build:win` (la page est recopiée de `../liseuse-lampe-src/dist/liseuse.html`).
2. Contrôler `dist/SHA256SUMS.txt` et la taille des deux fichiers.
3. Sur un Windows : installer, lancer, ouvrir un livre, fermer, relancer (la bibliothèque est gardée), « Ouvrir avec » sur un `.txt`, désinstaller. Ce parcours n'a **pas** pu être fait ici (pas de Windows : voir `README.md`, « Limites connues »).
4. Créer la Release sur GitHub, joindre les quatre fichiers de `dist/` (`.exe`, `.zip`, `liseuse.html`, `SHA256SUMS.txt`), coller le texte ci-dessus.
5. Si tu obtiens un jour un certificat de signature (ou Azure Trusted Signing), la signature se règle dans `package.json` (`build.win`) : l'avertissement SmartScreen disparaît alors peu à peu.
