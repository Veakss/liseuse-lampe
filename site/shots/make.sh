#!/bin/zsh
# shots/make.sh [capture…] : refait les captures d'écran de l'application pour le site, en une commande.
#
#   ./shots/make.sh                  toutes les captures
#   ./shots/make.sh scene-lake       une seule (voir les noms dans shots/plan.mjs)
#   APP=/chemin/vers/liseuse.html ./shots/make.sh     une autre version de l'application
#
# Lit liseuse.html en lecture seule et la pilote avec drive.mjs (un seul Chrome sans fenêtre à la fois, profil jetable
# dans shots/.chrome-prof). Le texte affiché est celui du livre d'exemple de l'application : jamais un livre réel.
# Sorties : img/<nom>.webp (chacune sous 250 Ko) et img/<nom>-s.webp (1000 px, ~80 Ko), plus img/partage.jpg (1200 × 630, aperçus de liens) tiré de alpes-bulle.
#
# Variables : SRC dossier des sources (où vit drive.mjs), APP la page à capturer, DPR (2), LARGEUR / HAUTEUR (1440 × 900),
#             TAILLE_MAX en octets (250000), LARGEUR_WEBP (2000 : la capture, réduite, avant l'export),
#             GARDER=1 pour garder les PNG pleine taille dans shots/.tmp.
set -u
HERE="${0:A:h}"
SITE="${HERE:h}"
# Les sources de la liseuse : app/ à côté du site dans le dépôt, sinon le dossier de travail liseuse-lampe-src à côté.
if [[ -z "${SRC:-}" ]]; then
  if [[ -f "${SITE:h}/app/build.py" ]]; then SRC="${SITE:h}/app"; else SRC="${SITE:h}/liseuse-lampe-src"; fi
fi
APP="${APP:-$SRC/dist/liseuse.html}"   # la version publique (PUBLIC=1 OUT=dist/liseuse.html python3 build.py)
DPR="${DPR:-2}"
LARGEUR="${LARGEUR:-1440}"
HAUTEUR="${HAUTEUR:-900}"
TAILLE_MAX="${TAILLE_MAX:-250000}"
LARGEUR_WEBP="${LARGEUR_WEBP:-2000}"
IMG="$SITE/img"
TMP="$HERE/.tmp"

[[ -f "$APP" ]] || { echo "Page introuvable : $APP" >&2; exit 1; }
[[ -f "$SRC/drive.mjs" ]] || { echo "drive.mjs introuvable dans $SRC" >&2; exit 1; }
command -v cwebp >/dev/null || { echo "cwebp manque (brew install webp)" >&2; exit 1; }
command -v node >/dev/null || { echo "node manque" >&2; exit 1; }

NOMS=("$@")
# Par défaut : toutes les images de la page (l'ouverture à cinq moments, les douze scènes, les supports, la bibliothèque,
# les réglages). HEROS : la scène de l'ouverture.
HEROS="${HEROS:-lake}"
[[ ${#NOMS[@]} -eq 0 ]] && NOMS=(heure-$HEROS-sun heure-$HEROS-golden heure-$HEROS-sunset heure-$HEROS-night heure-$HEROS-rain
  scene-nook scene-hearth scene-forest scene-lake scene-snow scene-washitsu scene-fuji scene-onsen scene-plage scene-alpes scene-cote scene-paris
  alpes-bulle fuji-jour paris-jour bibliotheque reglages)

# drive.mjs compose « dossier courant + / + PROF » : le profil se donne donc relatif au dossier des sources.
PROF="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$HERE/.chrome-prof" "$SRC")"

mkdir -p "$IMG" "$TMP"
statut=0
for nom in $NOMS; do
  png="$TMP/$nom.png"
  etapes="$(node "$HERE/plan.mjs" "$nom" "$png")" || { statut=1; continue; }
  echo "→ $nom"
  rm -f "$png"
  # les vignettes de la galerie (scene-…) : en 1 × et plus légères ; le reste en 2 ×
  d="$DPR"; lw="$LARGEUR_WEBP"; tm="$TAILLE_MAX"
  if [[ "$nom" == scene-* ]]; then d=1; lw=1400; tm=140000; fi
  sortie="$(cd "$SRC" && DPR="$d" PROF="$PROF" node drive.mjs "file://$APP" "$etapes" "$LARGEUR" "$HAUTEUR" 2>&1)"
  if [[ ! -s "$png" ]]; then echo "  échec : pas de capture" >&2; echo "$sortie" >&2; statut=1; continue; fi
  # Rien d'autre qu'un silence dans la console n'est accepté.
  if ! print -r -- "$sortie" | grep -q -- '--- no console output ---'; then
    echo "  la console n'est pas vide :" >&2; print -r -- "$sortie" | sed -n '/--- console ---/,$p' >&2; statut=1
  fi
  # Réduite à LARGEUR_WEBP de large, puis exportée au plus fin qui tienne sous TAILLE_MAX (cwebp -size vise la taille sans
  # la garantir : on resserre la cible jusqu'à passer dessous).
  cible="$tm"; essais=0
  while true; do
    cwebp -quiet -resize "$lw" 0 -size "$cible" -m 6 -pass 8 "$png" -o "$IMG/$nom.webp" || { statut=1; break; }
    taille="$(stat -f%z "$IMG/$nom.webp")"
    (( taille <= tm )) && break
    (( ++essais >= 6 )) && { echo "  trop lourde malgré tout : $taille octets" >&2; statut=1; break; }
    cible=$(( cible * 95 / 100 ))
  done
  echo "  ${taille:-?} octets  img/$nom.webp"
  # La même en 1000 px de large, pour les écrans étroits (srcset de la page).
  cwebp -quiet -resize 1000 0 -size 80000 -m 6 -pass 8 "$png" -o "$IMG/$nom-s.webp" || statut=1
  echo "  $(stat -f%z "$IMG/$nom-s.webp") octets  img/$nom-s.webp"
done

# L'image de partage (1200 × 630) : la scène de l'ouverture au coucher du soleil, recadrée.
if [[ -f "$TMP/heure-$HEROS-sunset.png" ]] && command -v magick >/dev/null; then
  magick "$TMP/heure-$HEROS-sunset.png" -resize 1200x -gravity center -crop 1200x630+0+0 +repage -quality 84 "$IMG/partage.jpg" && echo "→ img/partage.jpg $(stat -f%z "$IMG/partage.jpg") octets"
fi

rm -rf "$HERE/.chrome-prof"
[[ -n "${GARDER:-}" ]] || rm -rf "$TMP"   # GARDER=1 : garde les PNG en pleine taille dans shots/.tmp
pgrep -fl "user-data-dir=.*liseuse-site" >/dev/null && echo "Un Chrome du site reste ouvert : pgrep -fl \"user-data-dir=.*liseuse-site\", puis kill <pid>." >&2
exit $statut
