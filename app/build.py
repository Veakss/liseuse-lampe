# Builds the app from liseuse.template.html: the full v20 build with its scenes.js + supports.js cut out at /*@@SCENES@@*/.
# (assemble.py's own inputs, the v3 page and the ui-* sources, were purged from the temp folder; the template carries them,
# sup-folio included.) Env: SCENES (another copy of the scenes), SUPPORTS (of the supports), OUT (the page to write), TEMPLATE.
import os
T = open(os.environ.get('TEMPLATE', 'liseuse.template.html'), encoding='utf-8').read()
core = open(os.environ.get('SCENES', 'scenes.js'), encoding='utf-8').read().rstrip() + '\n' + open(os.environ.get('SUPPORTS', 'supports.js'), encoding='utf-8').read().rstrip() + '\n'
assert T.count('/*@@SCENES@@*/\n') == 1
# importers.js (every file format the reader opens), at /*@@IMPORT@@*/ when the template has the marker. Env: IMPORT.
if '/*@@IMPORT@@*/\n' in T: T = T.replace('/*@@IMPORT@@*/\n', open(os.environ.get('IMPORT', 'importers.js'), encoding='utf-8').read().rstrip() + '\n')

# The scene sounds: sounds/sound-kit.js (window.SOUND_KIT) and one pack per scene (sounds/<key>.js, on window.SCENE_SOUNDS),
# at /*@@SOUNDS@@*/ when the template has it, each pack in a try of its own (one broken pack leaves the others). Env: SOUNDS
# (the folder).
if '/*@@SOUNDS@@*/\n' in T:
    sd = os.environ.get('SOUNDS', 'sounds')
    keys = ['nook', 'hearth', 'forest', 'lake', 'snow', 'washitsu', 'fuji', 'onsen', 'plage', 'alpes', 'cote', 'paris']
    parts = [open(os.path.join(sd, 'sound-kit.js'), encoding='utf-8').read().rstrip()]
    for k in keys:
        f = os.path.join(sd, k + '.js')
        if os.path.exists(f): parts.append('// ---- sounds: %s ----\ntry {\n%s\n} catch (e) { console.error("sounds %s", e); }' % (k, open(f, encoding='utf-8').read().rstrip(), k))
    js = '\n'.join(parts) + '\n'
    assert '</script' not in js.lower(), 'a closing script tag in the sounds'
    T = T.replace('/*@@SOUNDS@@*/\n', js)
    print('sounds: %d packs, %.0f Ko' % (len(parts) - 1, len(js) / 1024))

# Library covers: the fragment work/vo-covers/inline.py writes (« const COVERS = [...] », images as data URIs), in place of
# the line « const COVERS = /*@@COVERS@@*/[]; » when the template has it. Env: COVERS (the fragment; default covers.js when it
# is there). Without one, the page keeps its drawn covers only.
CM = '  const COVERS = /*@@COVERS@@*/[];\n'
if CM in T and os.path.exists(os.environ.get('COVERS', 'covers.js')):
    frag = open(os.environ.get('COVERS', 'covers.js'), encoding='utf-8').read()
    assert frag.count('const COVERS = [') == 1 and '</script' not in frag.lower(), 'not a covers fragment'
    T = T.replace(CM, ''.join(('  ' + l) if l.strip() else l for l in frag.rstrip().splitlines(True)) + '\n')
    print('covers: %s, %.0f Ko' % (os.environ.get('COVERS', 'covers.js'), len(frag) / 1024))
# The reading fonts, embedded (fonts/fonts.css, written by fonts/make_css.py), at /*@@FONTS@@*/ when the template has it. Env: FONTS.
if '/*@@FONTS@@*/\n' in T:
    fc = open(os.environ.get('FONTS', 'fonts/fonts.css'), encoding='utf-8').read()
    assert '</style' not in fc.lower()
    T = T.replace('/*@@FONTS@@*/\n', fc.rstrip() + '\n')
    print('fonts: %.0f Ko' % (len(fc) / 1024))
# PUBLIC=1 (the GitHub file, the Windows app, the site): the key-word table prepared for one private book (word positions,
# matched by a fingerprint) is emptied; the « Lecture » section then stays hidden for every book, as it already does for
# any other book. The claude.ai build keeps it.
if os.environ.get('PUBLIC') == '1':
    import re
    T, n = re.subn(r'^(\s*const EMPHASIS = )\[.*\];$', r'\1[];', T, count=1, flags=re.M)
    assert n == 1, 'EMPHASIS line not found'
    print('public: key-word table emptied')
# A whole document (standards mode, the page's language): the template starts at its <meta charset>.
if not T.lstrip().lower().startswith('<!doctype'): T = '<!doctype html>\n<html lang="fr">\n' + T
out = os.environ.get('OUT', 'liseuse.html')
if os.path.dirname(out): os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(T.replace('/*@@SCENES@@*/\n', core))
