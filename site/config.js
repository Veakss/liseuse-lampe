/* config.js : TOUS les liens de téléchargement et de GitHub du site sont ici, et nulle part ailleurs.

   Les pages gardent des boutons sans adresse (data-lien="…"), et ce fichier leur donne la leur au chargement.
   Le dépôt : github.com/Veakss/liseuse-lampe. Pour une nouvelle version : change le numéro et le nom des fichiers.

   - « versions » / « derniere » : la page des versions du dépôt ; les fichiers joints à une version GitHub
     s'adressent en  …/releases/latest/download/<nom du fichier>  (toujours la dernière version).
   - Le nom des fichiers doit être exactement celui des fichiers joints à la version.
   - tailles : texte libre affiché à côté du bouton (« 85 Mo »). Laisse '' pour ne rien afficher. */
window.LISEUSE = {
  version: '1.0.0',

  depot: 'https://github.com/Veakss/liseuse-lampe',

  liens: {
    // Windows 10 et 11 (64 bits)
    windowsInstalleur: 'https://github.com/Veakss/liseuse-lampe/releases/latest/download/Liseuse-a-la-lampe-1.0.0-win-x64.exe',
    windowsPortable: 'https://github.com/Veakss/liseuse-lampe/releases/latest/download/Liseuse-a-la-lampe-1.0.0-win-x64.zip',
    // Mac et Linux : la page seule, à ouvrir dans Chrome ou Edge
    pageHtml: 'https://github.com/Veakss/liseuse-lampe/releases/latest/download/liseuse.html',
    // GitHub
    depot: 'https://github.com/Veakss/liseuse-lampe',
    sources: 'https://github.com/Veakss/liseuse-lampe',
    versions: 'https://github.com/Veakss/liseuse-lampe/releases',
    problemes: 'https://github.com/Veakss/liseuse-lampe/issues',
  },

  tailles: {
    windowsInstalleur: '106\u00a0Mo',
    windowsPortable: '149\u00a0Mo',
    pageHtml: '7\u00a0Mo',
  },

  // La ligne de crédit du pied de page.
  credit: 'Un projet indépendant de Victor Dumanois · 2026',
};
