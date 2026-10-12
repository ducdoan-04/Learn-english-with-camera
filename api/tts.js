export default async function handler(req, res) {
  const { q, tl = 'en' } = req.query;
  if (!q) {
    return res.status(400).send('Missing query text');
  }

  try {
    const text = encodeURIComponent(String(q).slice(0, 200).trim());
    const lang = encodeURIComponent(String(tl).slice(0, 5));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${text}`;

    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream Google TTS error');
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send('TTS server error: ' + err.message);
  }
}
