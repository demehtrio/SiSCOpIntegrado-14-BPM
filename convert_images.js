
const https = require('https');

const urls = {
  LOGO_14BPM: "https://i.pinimg.com/originals/28/33/bd/2833bdc504f4fc4f3cb3c2817a664fc9.png",
  LOGO_SISCOPI: "https://i.pinimg.com/originals/87/a3/ed/87a3ed9f8a7288c126367864ac2a7663.png",
  ICON_VTR: "https://i.pinimg.com/originals/a4/9d/1b/a49d1bc945d9d701a572668f6ffc99b8.png",
  ICON_CHECKLIST: "https://i.pinimg.com/originals/44/e4/8c/44e48c5ff461edb7623bab64bd898d8d.png",
  LOGO_PMPE: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Bras%C3%A3o_da_PMPE.svg/1200px-Bras%C3%A3o_da_PMPE.svg.png"
};

async function getBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const base64 = buffer.toString('base64');
        const mimeType = res.headers['content-type'] || 'image/png';
        resolve(`data:${mimeType};base64,${base64}`);
      });
    }).on('error', reject);
  });
}

async function run() {
  const results = {};
  for (const [name, url] of Object.entries(urls)) {
    try {
      console.log(`Fetching ${name}...`);
      results[name] = await getBase64(url);
    } catch (e) {
      console.error(`Error fetching ${name}:`, e.message);
    }
  }
  
  const content = `export const ASSETS = ${JSON.stringify(results, null, 2)};`;
  require('fs').writeFileSync('src/assets/logos.ts', content);
  console.log('Done! Generated src/assets/logos.ts');
}

run();
