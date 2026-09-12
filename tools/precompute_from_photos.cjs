// Build embeddings from local source photos while retaining caricatures for display.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'assets/crawled/forbes-real-time-billionaires-top-100-complete-repaired');
const sourceDataPath = path.join(sourceDir, 'forbes-real-time-billionaires-top-100.json');
const photoDir = path.resolve(process.argv[2] || path.join(sourceDir, 'images'));
const people = JSON.parse(fs.readFileSync(path.join(root, 'data/people.json')));
const sourcePeople = JSON.parse(fs.readFileSync(sourceDataPath)).billionaires;
const sourceByOrder = new Map(sourcePeople.map(person => [person.exportOrder, person]));
const relativePhotoDir = path.relative(root, photoDir).split(path.sep).map(encodeURIComponent).join('/');

const missingPhotos = [];
const candidates = people.filter(person => person.imageStatus === 'validated').flatMap(person => {
  const sourcePerson = sourceByOrder.get(person.exportOrder);
  const filename = sourcePerson?.imageFile ? path.basename(sourcePerson.imageFile) : null;
  const usable = sourcePerson?.imageAvailable && filename && path.extname(filename).toLowerCase() !== '.svg' && fs.existsSync(path.join(photoDir, filename));
  if (!usable) {
    missingPhotos.push({ exportOrder: person.exportOrder, name: person.name });
    return [{ person, analysisUrl: null, fallbackUrl: `/${person.image}` }];
  }
  return [{
    person,
    analysisUrl: `/${relativePhotoDir}/${encodeURIComponent(filename)}`,
    fallbackUrl: `/${person.image}`,
  }];
});

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.PRECOMPUTE_URL || 'http://localhost:8000/tools/precompute.html');
    const output = await page.evaluate(async candidates => {
      const { FaceLandmarker, FilesetResolver } = await import('../js/vendor/mediapipe/vision_bundle.mjs');
      const { computeFeatures, FEATURE_KEYS } = await import('../js/faceFeatures.js');
      const model = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('../js/vendor/mediapipe/wasm'), {
        baseOptions: { modelAssetPath: '../models/mediapipe/face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 2,
      });
      const results = [], failures = [];
      for (const candidate of candidates) {
        try {
          const detect = async url => {
            const img = new Image(); img.src = url; await img.decode();
            return { img, detection: model.detect(img) };
          };
          let source = 'source-photo';
          let detected = candidate.analysisUrl ? await detect(candidate.analysisUrl) : null;
          if (!detected || detected.detection.faceLandmarks.length !== 1) {
            if (candidate.analysisUrl) failures.push({ id: candidate.person.id, error: `Source photo found ${detected.detection.faceLandmarks.length} faces; used caricature fallback` });
            detected = await detect(candidate.fallbackUrl);
            source = 'caricature-fallback';
          }
          const { img, detection } = detected;
          if (detection.faceLandmarks.length !== 1) throw new Error(`Fallback found ${detection.faceLandmarks.length} faces`);
          const values = computeFeatures(detection.faceLandmarks[0], img.naturalWidth, img.naturalHeight);
          const features = FEATURE_KEYS.map(feature => values[feature]);
          if (!features.every(Number.isFinite)) throw new Error('Invalid facial proportions');
          results.push({ ...candidate.person, featureSource: source, features });
        } catch (error) { failures.push({ id: candidate.person.id, error: error.message }); }
      }
      model.close();
      return { featureKeys: FEATURE_KEYS, results, failures };
    }, candidates);

    if (!output.results.length) throw new Error('No source photos produced usable embeddings');
    const mean = output.featureKeys.map((_, i) => output.results.reduce((sum, p) => sum + p.features[i], 0) / output.results.length);
    const std = output.featureKeys.map((_, i) => Math.sqrt(output.results.reduce((sum, p) => sum + (p.features[i] - mean[i]) ** 2, 0) / output.results.length) || 1);
    fs.writeFileSync(path.join(root, 'data/embeddings.json'), JSON.stringify({ featureKeys: output.featureKeys, stats: { mean, std }, people: output.results }, null, 2) + '\n');
    const report = {
      checkedAt: new Date().toISOString(), method: 'local-source-photos-by-export-order',
      suppliedPhotos: sourcePeople.filter(person => person.imageAvailable).length,
      displayCaricatures: people.filter(person => person.imageStatus === 'validated').length,
      candidates: candidates.length, passed: output.results.length, missingPhotos, failures: output.failures,
    };
    fs.writeFileSync(path.join(root, 'data/photo-analysis-validation.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
