const STOREFRONT_API_URL = 'https://1de1.myshopify.com/api/2024-01/graphql.json';

const CART_CREATE = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'SHOPIFY_STOREFRONT_TOKEN not configured' });
  }

  const items = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Expected non-empty array of { variantId, quantity }' });
  }

  const lines = items.map(({ variantId, quantity = 1, size }) => ({
    merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
    quantity,
    ...(size ? { attributes: [{ key: 'Size', value: size }] } : {}),
  }));

  try {
    const sfResp = await fetch(STOREFRONT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({
        query: CART_CREATE,
        variables: { input: { lines } },
      }),
    });

    const body = await sfResp.json();
    console.log('[checkout] Storefront response:', JSON.stringify(body));

    if (!sfResp.ok) {
      return res.status(502).json({ error: 'Storefront API error: ' + sfResp.status });
    }

    const userErrors = body?.data?.cartCreate?.userErrors;
    if (userErrors?.length) {
      return res.status(422).json({ error: userErrors.map(e => e.message).join('; ') });
    }

    const checkoutUrl = body?.data?.cartCreate?.cart?.checkoutUrl;
    if (!checkoutUrl) {
      return res.status(502).json({ error: 'No checkoutUrl returned', detail: body });
    }

    return res.status(200).json({ checkoutUrl });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
