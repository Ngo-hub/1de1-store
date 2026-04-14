const STOREFRONT_API_URL = 'https://1de1.myshopify.com/api/2024-01/graphql.json';

const CREATE_CUSTOMER = `
  mutation customerCreate($input: CustomerCreateInput!) {
    customerCreate(input: $input) {
      customer {
        id
        email
      }
      customerUserErrors {
        code
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

  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'SHOPIFY_STOREFRONT_TOKEN not configured' });
  }

  try {
    const sfResp = await fetch(STOREFRONT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({
        query: CREATE_CUSTOMER,
        variables: {
          input: {
            email,
            acceptsMarketing: true,
            tags: ['email-popup', 'discount-UNI10', 'uni001-waitlist'],
          },
        },
      }),
    });

    const body = await sfResp.json();
    console.log('[subscribe] Storefront response:', JSON.stringify(body));

    const errors = body?.data?.customerCreate?.customerUserErrors;
    // Code CUSTOMER_DISABLED / TAKEN means email already exists — treat as success
    if (errors?.length) {
      const fatal = errors.filter(e => e.code !== 'CUSTOMER_DISABLED' && e.code !== 'TAKEN');
      if (fatal.length) {
        return res.status(422).json({ error: fatal.map(e => e.message).join('; ') });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
