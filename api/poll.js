export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing prediction id' });
  }

  const token = process.env.REPLICATE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'REPLICATE_TOKEN not configured' });
  }

  try {
    const pollResp = await fetch('https://api.replicate.com/v1/predictions/' + id, {
      headers: { Authorization: 'Bearer ' + token },
    });

    if (!pollResp.ok) {
      return res.status(502).json({ error: 'Replicate error: ' + pollResp.status });
    }

    const prediction = await pollResp.json();
    const { status, output, error: predError } = prediction;

    if (status === 'failed') {
      return res.status(502).json({ status: 'failed', error: predError || 'Prediction failed' });
    }

    if (status === 'succeeded') {
      const imageUrl = Array.isArray(output) ? output[0] : output;
      return res.status(200).json({ status: 'succeeded', imageUrl });
    }

    // still processing (starting / processing)
    return res.status(200).json({ status });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
