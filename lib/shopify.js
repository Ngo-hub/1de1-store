// Shopify Admin GraphQL helpers. Degrade with {linked:false} until SHOPIFY_ADMIN_TOKEN is set.
const STORE = process.env.SHOPIFY_STORE || '1de1.myshopify.com';
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API = `https://${STORE}/admin/api/2024-10/graphql.json`;

export function shopifyReady() { return !!TOKEN; }

async function gql(query, variables) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

export async function getVitals(range = 'today') {
  if (!shopifyReady()) return { linked: false };
  const start = range === 'week'
    ? new Date(Date.now() - 7 * 864e5)
    : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const q = `created_at:>=${start.toISOString()}`;
  const data = await gql(
    `query($q:String!){orders(first:100,query:$q){edges{node{currentTotalPriceSet{shopMoney{amount}} lineItems(first:10){edges{node{title quantity}}}}}}}`,
    { q }
  );
  const edges = data.orders.edges;
  let rev = 0; const prod = {};
  for (const { node } of edges) {
    rev += parseFloat(node.currentTotalPriceSet?.shopMoney?.amount || 0);
    for (const li of node.lineItems.edges) prod[li.node.title] = (prod[li.node.title] || 0) + li.node.quantity;
  }
  const orders = edges.length;
  const top = Object.entries(prod).sort((a, b) => b[1] - a[1])[0];
  return { linked: true, range, revenue: +rev.toFixed(2), orders, aov: orders ? +(rev / orders).toFixed(2) : 0, topProduct: top ? top[0] : null };
}

export async function listOrders(status = 'any') {
  if (!shopifyReady()) return { linked: false };
  const q = status === 'unfulfilled' ? 'fulfillment_status:unfulfilled' : '';
  const data = await gql(
    `query($q:String){orders(first:15,query:$q,sortKey:CREATED_AT,reverse:true){edges{node{name createdAt displayFulfillmentStatus currentTotalPriceSet{shopMoney{amount}}}}}}`,
    { q }
  );
  return { linked: true, orders: data.orders.edges.map(e => ({ name: e.node.name, status: e.node.displayFulfillmentStatus, total: e.node.currentTotalPriceSet?.shopMoney?.amount, at: e.node.createdAt })) };
}

export async function getInventory(threshold = 3) {
  if (!shopifyReady()) return { linked: false };
  const data = await gql(`query{productVariants(first:100){edges{node{title inventoryQuantity product{title}}}}}`);
  const low = data.productVariants.edges.map(e => e.node)
    .filter(v => typeof v.inventoryQuantity === 'number' && v.inventoryQuantity <= threshold)
    .map(v => ({ product: v.product.title, variant: v.title, qty: v.inventoryQuantity }));
  return { linked: true, threshold, low };
}

export async function createDiscount(percent, code, reason) {
  if (!shopifyReady()) return { linked: false };
  const endsAt = new Date(Date.now() + 7 * 864e5).toISOString();
  const data = await gql(
    `mutation($b:DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$b){codeDiscountNode{id} userErrors{field message}}}`,
    { b: {
        title: `NGO ${code} (${reason || 'operator'})`,
        code,
        startsAt: new Date().toISOString(),
        endsAt,
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: { all: true },
        customerGets: { value: { percentage: percent / 100 }, items: { all: true } },
      } }
  );
  const errs = data.discountCodeBasicCreate?.userErrors || [];
  if (errs.length) return { ok: false, errors: errs };
  return { ok: true, code, percent, endsAt };
}
