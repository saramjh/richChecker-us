// Runs the same feature extractor as the app; no alternate matching implementation.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const partial = process.argv.includes('--partial');
(async () => {
  const people = JSON.parse(fs.readFileSync(path.join(root, 'data/people.json')));
  const available = people.filter(p => fs.existsSync(path.join(root, p.image)));
  if (!partial && available.length !== people.length) throw new Error(`Only ${available.length}/${people.length} images exist`);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.PRECOMPUTE_URL || 'http://localhost:8000/tools/precompute.html');
    const output = await page.evaluate(async (people) => {
      const { FaceLandmarker, FilesetResolver } = await import('../js/vendor/mediapipe/vision_bundle.mjs');
      const { computeFeatures, FEATURE_KEYS } = await import('../js/faceFeatures.js');
      const model = await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('../js/vendor/mediapipe/wasm'), {
        baseOptions: { modelAssetPath: '../models/mediapipe/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE', numFaces: 2,
      });
      const results = [], failures = [];
      for (const person of people) {
        try {
          const img = new Image(); img.src = `../${person.image}`; await img.decode();
          const result = model.detect(img);
          if (result.faceLandmarks.length !== 1) throw new Error(`Found ${result.faceLandmarks.length} faces`);
          const features = computeFeatures(result.faceLandmarks[0], img.naturalWidth, img.naturalHeight);
          const vector = FEATURE_KEYS.map(key => features[key]);
          if (!vector.every(Number.isFinite)) throw new Error('Invalid facial proportions');
          results.push({ ...person, imageStatus: 'validated', features: vector });
        } catch (error) { failures.push({ id: person.id, error: error.message }); }
      }
      model.close();
      if (!results.length) return { failures, people: results };
      const mean = FEATURE_KEYS.map((_, i) => results.reduce((sum, p) => sum + p.features[i], 0) / results.length);
      const std = FEATURE_KEYS.map((_, i) => Math.sqrt(results.reduce((sum, p) => sum + (p.features[i] - mean[i]) ** 2, 0) / results.length) || 1);
      return { featureKeys: FEATURE_KEYS, stats: { mean, std }, people: results, failures };
    }, available);
    const passedIds = new Set(output.people.map(person => person.id));
    const report = { checkedAt: new Date().toISOString(), expected: people.length, available: available.length, passed: output.people.length, failures: output.failures };
    fs.writeFileSync(path.join(root, 'data/caricature-validation.json'), JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(
      path.join(root, 'data/people.json'),
      JSON.stringify(people.map(person => ({
        ...person,
        imageStatus: passedIds.has(person.id) ? 'validated' : 'blank-or-undetected',
      })), null, 2) + '\n',
    );
    console.log(JSON.stringify(report));
    if (!partial) {
      if (!output.people.length) throw new Error('No detectable caricatures; embeddings not replaced');
      delete output.failures;
      fs.writeFileSync(path.join(root, 'data/embeddings.json'), JSON.stringify(output, null, 2) + '\n');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
