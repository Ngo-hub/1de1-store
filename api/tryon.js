export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { personImage, garmentImage } = req.body || {};
  if (!personImage || !garmentImage) {
    return res.status(400).json({ error: 'Missing personImage or garmentImage' });
  }

  const token = process.env.REPLICATE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'REPLICATE_TOKEN not configured' });
  }

  try {
    const createResp = await fetch(
      'https://api.replicate.com/v1/models/fashn-ai/fashn-tryon/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            model_image: personImage,
            garment_image: garmentImage,
            category: 'tops',
          },
        }),
      }
    );

    if (!createResp.ok) {
      const body = await createResp.text();
      return res.status(502).json({ error: 'Replicate error: ' + createResp.status, detail: body });
    }

    const prediction = await createResp.json();
    return res.status(200).json({ predictionId: prediction.id });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
