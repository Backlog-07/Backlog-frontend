// Shopify Storefront API utility
const SHOPIFY_DOMAIN = process.env.REACT_APP_SHOPIFY_DOMAIN || "";
const STOREFRONT_API_TOKEN = process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN || "";
const SHOPIFY_API_VERSION = process.env.REACT_APP_SHOPIFY_API_VERSION || "2025-10";
const STOREFRONT_API_URL = SHOPIFY_DOMAIN
  ? `https://${SHOPIFY_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`
  : "";

function assertShopifyConfigured() {
  if (!SHOPIFY_DOMAIN || !STOREFRONT_API_TOKEN || !STOREFRONT_API_URL) {
    throw new Error(
      "Shopify is not configured. Set REACT_APP_SHOPIFY_DOMAIN and REACT_APP_SHOPIFY_STOREFRONT_TOKEN in your .env (and restart the dev server)."
    );
  }
}

async function shopifyGraphQL(query, variables = {}) {
  assertShopifyConfigured();
  const res = await fetch(STOREFRONT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_API_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    throw new Error(
      `Shopify request failed (${res.status}). ${json?.errors ? JSON.stringify(json.errors) : text || res.statusText
      }`
    );
  }
  if (json.errors) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// Fetch products (first 20, add pagination as needed)
export async function fetchProducts() {
  const query = `{
    products(first: 20) {
      edges {
        node {
          id
          title
          description
          images(first: 5) { edges { node { url } } }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                availableForSale
              }
            }
          }
          metafield(namespace: "custom", key: "glbUrl") { value }
        }
      }
    }
  }`;
  const data = await shopifyGraphQL(query);
  return data.products.edges.map(e => e.node);
}

const CART_FRAGMENT = `
  cart {
    id checkoutUrl cost { subtotalAmount { amount } }
    lines(first: 10) { edges { node { id quantity merchandise { ... on ProductVariant { id title product { title images(first: 1) { edges { node { url } } } } price { amount } } } } } }
  }
`;

// Create a cart
export async function createCart(lines = []) {
  const query = `mutation cartCreate($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      ${CART_FRAGMENT}
      userErrors { field message }
    }
  }`;
  const variables = { lines };
  const data = await shopifyGraphQL(query, variables);
  return data.cartCreate.cart;
}

// Add to cart
export async function addToCart(cartId, lines) {
  const query = `mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      ${CART_FRAGMENT}
      userErrors { field message }
    }
  }`;
  const variables = { cartId, lines };
  const data = await shopifyGraphQL(query, variables);
  return data.cartLinesAdd.cart;
}

// Update item quantity
export async function updateCartLine(cartId, lineId, quantity) {
  const query = `mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      ${CART_FRAGMENT}
      userErrors { field message }
    }
  }`;
  const variables = { cartId, lines: [{ id: lineId, quantity }] };
  const data = await shopifyGraphQL(query, variables);
  return data.cartLinesUpdate.cart;
}

// Remove item from cart
export async function removeCartLine(cartId, lineId) {
  const query = `mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      ${CART_FRAGMENT}
      userErrors { field message }
    }
  }`;
  const variables = { cartId, lineIds: [lineId] };
  const data = await shopifyGraphQL(query, variables);
  return data.cartLinesRemove.cart;
}

/**
 * Fetch World Gallery images from Shopify Metaobjects (Storefront API).
 *
 * Setup in Shopify Admin → Content → Metaobjects → Add definition:
 *   Name: "World Gallery Image"  |  API handle: "world_gallery_image"
 *   Fields:
 *     - image_url  (Single line text) ← full https:// URL (Cloudflare R2 or Shopify CDN)
 *     - caption    (Single line text) ← optional label
 *
 * Then click "Add entry" for each image and paste its full URL into image_url.
 * Returns: Array of { id, imageUrl, caption }
 */
export async function fetchWorldGallery() {
  const query = `{
    metaobjects(type: "world_image", first: 100) {
      edges {
        node {
          id
          fields { key value }
        }
      }
    }
  }`;
  const data = await shopifyGraphQL(query);
  console.log('[WorldGallery] Raw response:', JSON.stringify(data, null, 2));
  const edges = data?.metaobjects?.edges || [];
  console.log('[WorldGallery] Edges count:', edges.length);
  const results = edges.map(({ node }) => {
    const m = {};
    (node.fields || []).forEach(f => { m[f.key] = f.value; });
    console.log('[WorldGallery] Fields for entry:', m);
    return { id: node.id, imageUrl: m['cloudflare_link'] || null, caption: '' };
  }).filter(img => !!img.imageUrl);
  console.log('[WorldGallery] Final results:', results.length);
  return results;
}
