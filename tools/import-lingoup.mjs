// Copies the stories (+ glossary, translations) and pictures from the LingoUp demo APK into content/.
// Run again whenever new Flix are added there:  node tools/import-lingoup.mjs [path/to/LingoUp]
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LINGOUP = resolve(process.argv[2] ?? resolve(ROOT, '../../Bussines/LingoUp'));
const WEB = resolve(LINGOUP, 'demo-apk/android/app/src/main/assets/web');

const src = JSON.parse(readFileSync(resolve(WEB, 'demo-data.json'), 'utf8'));
mkdirSync(resolve(ROOT, 'content/img'), { recursive: true });

const flix = src.reels
  .sort((a, b) => a.id - b.id)
  .map((r) => {
    const img = r.images[0] ? basename(r.images[0]) : null;
    if (img) copyFileSync(resolve(WEB, 'uploads', img), resolve(ROOT, 'content/img', img));
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      level: r.level,
      durationSec: r.durationSec,
      image: img,
      createdAt: r.createdAt,
      text: r.text,
      translations: r.translations ?? null,
      glossary: r.glossary ?? null,
    };
  });

writeFileSync(resolve(ROOT, 'content/flix.json'), JSON.stringify(flix));
writeFileSync(resolve(ROOT, 'content/campaign.json'), JSON.stringify(src.campaign, null, 2));
console.log(`imported ${flix.length} Flix from ${LINGOUP}`);
