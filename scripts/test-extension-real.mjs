import { chromium } from 'playwright';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extPath = path.join(root, 'browser-extension');

async function run() {
  const userDataDir = path.join(root, 'dist', 'pw-profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`
    ]
  });
  try {
    const page = await context.newPage();
    console.log('Navigation vers https://example.com/ ...');
    await page.goto('https://example.com/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const btn = page.locator('#pm-capture-fab');
    if (await btn.isVisible().catch(() => false)) {
      const text = await btn.textContent();
      console.log('✓ Bouton PM injecté :', text);
      await page.screenshot({ path: path.join(root, 'dist', 'extension-example.png') });
      return;
    }
    await page.screenshot({ path: path.join(root, 'dist', 'extension-fail.png') });
    throw new Error('Bouton PM non injecté');
  } finally {
    await context.close();
  }
}

run().catch(e => {
  console.error('✗ Extension real test failed:', e.message);
  process.exit(1);
});
