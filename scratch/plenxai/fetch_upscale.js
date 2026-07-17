const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Log network requests
    page.on('request', request => {
      if (request.url().includes('/api/') && ['fetch', 'xhr'].includes(request.resourceType())) {
        console.log('API Request:', request.method(), request.url());
      }
    });

    await page.goto('https://plenxai.com/apps/upscale', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    const content = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync('upscale_text.txt', content);
    console.log('Upscale page fetched successfully!');
    await browser.close();
  } catch (error) {
    console.error('Error fetching upscale page:', error);
    process.exit(1);
  }
})();
