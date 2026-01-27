const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('[Test] Starting Puppeteer PDF generation test...');
    let browser;
    try {
        console.log('[Test] Launching browser...');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        console.log('[Test] Browser launched successfully. PID:', browser.process().pid);

        const page = await browser.newPage();
        console.log('[Test] New page created.');

        await page.setContent('<h1>Hello World</h1><p>한글 테스트</p>', { waitUntil: 'networkidle0' });
        console.log('[Test] Content set.');

        const pdfBuffer = await page.pdf({ format: 'A4' });
        console.log('[Test] PDF generated. Size:', pdfBuffer.length);

        fs.writeFileSync(path.join(__dirname, 'test_output.pdf'), pdfBuffer);
        console.log('[Test] PDF saved to test_output.pdf');

    } catch (e) {
        console.error('[Test] FAILED:', e);
    } finally {
        if (browser) {
            await browser.close();
            console.log('[Test] Browser closed.');
        }
    }
})();
