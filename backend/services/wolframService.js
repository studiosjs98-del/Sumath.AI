const https = require('https');

function solveMath(query) {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const appId = process.env.WOLFRAM_APP_ID;
    const url = `https://api.wolframalpha.com/v2/query?input=${encodedQuery}&appid=${appId}&output=JSON&podstate=Step-by-step+solution`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const pods = parsed.queryresult?.pods || [];

          const getText = (pod) => pod?.subpods?.[0]?.plaintext || null;

          const resultPod = pods.find(p =>
            p.title === 'Result' ||
            p.title === 'Solution' ||
            p.title === 'Decimal approximation' 
          );

          const stepsPod = pods.find(p =>
            p.title === 'Step-by-step solution' ||
            p.title === 'Possible intermediate steps'
          );

          resolve({
            success: !!resultPod,
            result: getText(resultPod),
            steps: getText(stepsPod),
            allPods: pods.map(p => ({
              title: p.title,
              text: getText(p)
            })).filter(p => p.text)
          });

        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    }).on('error', (e) => {
      resolve({ success: false, error: e.message });
    });
  });
}

module.exports = { solveMath };