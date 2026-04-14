export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { personImage, garmentImage, garmentDesc } = req.body || {};
  if (!personImage || !garmentImage) {
    return res.status(400).json({ error: 'Missing personImage or garmentImage' });
  }

  const token = process.env.REPLICATE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'REPLICATE_TOKEN not configured' });
  }

  try {
    const createResp = await fetch(
      'https://api.replicate.com/v1/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: 'c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4',
          input: {
            human_img: personImage,
            garm_img: garmentImage,
            garment_des: garmentDesc || 'streetwear piece',
            is_checked: true,
            is_checked_crop: false,
            denoise_steps: 30,
            seed: 42,
          },
        }),
      }
    );

    const responseBody = await createResp.json();
    console.log('[tryon] Replicate response status:', createResp.status);
    console.log('[tryon] Replicate response body:', JSON.stringify(responseBody));

    if (!createResp.ok) {
      return res.status(502).json({ error: 'Replicate error: ' + createResp.status, detail: responseBody });
    }

    return res.status(200).json({ predictionId: responseBody.id });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
