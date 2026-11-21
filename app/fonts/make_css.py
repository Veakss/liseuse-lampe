# Writes fonts.css: the four reading fonts (Latin and Latin Extended subsets, from Google Fonts, all under the SIL Open Font
# License 1.1) as @font-face rules with the woff2 files inlined, so that the page needs no network for its fonts.
import json, base64
out = ['/* Reading fonts, embedded: Source Serif 4, Hanken Grotesk, Literata, Atkinson Hyperlegible, Newsreader (SIL OFL 1.1, see fonts/LICENSES.md). */']
for f in json.load(open('fonts.json')):
    b = base64.b64encode(open(f['file'], 'rb').read()).decode()
    out.append("@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}"
               % (f['fam'], f['style'], f['wght'], b, f['range']))
open('fonts.css', 'w').write('\n'.join(out) + '\n')
print('fonts.css %.0f Ko' % (sum(len(l) for l in out) / 1024))
