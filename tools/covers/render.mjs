import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'

const grain = readFileSync('grain.html.frag', 'utf8')
const css = readFileSync('base.css', 'utf8')
const targets = process.argv.slice(2)

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 2048, height: 1152 },
  deviceScaleFactor: 1,
})

for (const name of targets) {
  const html = readFileSync(`${name}.html`, 'utf8')
    .replace('<!--GRAIN-->', grain)
    .replace('<link rel="stylesheet" href="base.css">', `<style>${css}</style>`)
  writeFileSync(`/tmp/${name}.rendered.html`, html)
  await page.goto(`file:///tmp/${name}.rendered.html`)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${name}.png`, type: 'png' })
  console.log(`rendered ${name}.png`)
}
await browser.close()
