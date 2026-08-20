import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 2048, height: 1152 } })
for (const name of process.argv.slice(2)) {
  await page.goto(`file:///home/claude/covers/${name}.svg`)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${name}.check.png` })
  console.log(`rendered ${name}.check.png`)
}
await browser.close()
