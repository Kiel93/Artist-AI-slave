const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto('https://plenxai.com/developer', { waitUntil: 'networkidle2' });
    
    // Give it a moment to ensure all JS is fully rendered
    await new Promise(r => setTimeout(r, 2000));
    
    const content = await page.evaluate(() => document.body.innerText);
    
    fs.writeFileSync('docs.txt', content);
    console.log('Documentation fetched successfully!');
    await browser.close();
  } catch (error) {
    console.error('Error fetching documentation:', error);
    process.exit(1);
  }
})();
