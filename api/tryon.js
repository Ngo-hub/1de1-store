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
    // Create prediction
    const createResp = await fetch(
      'https://api.replicate.com/v1/models/fashn-ai/fashn-tryon/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
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

    let prediction = await createResp.json();

    // Poll until complete (fallback if Prefer:wait didn't resolve it)
    let attempts = 0;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 24) {
      await new Promise((r) => setTimeout(r, 2500));
      const pollResp = await fetch(
        'https://api.replicate.com/v1/predictions/' + prediction.id,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      prediction = await pollResp.json();
      attempts++;
    }

    if (prediction.status === 'failed') {
      return res.status(502).json({ error: 'Prediction failed', detail: prediction.error });
    }

    if (prediction.status !== 'succeeded') {
      return res.status(504).json({ error: 'Prediction timed out', id: prediction.id });
    }

    const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!output) {
      return res.status(502).json({ error: 'No output from model' });
    }

    return res.status(200).json({ imageUrl: output });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
