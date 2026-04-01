// Shopify Storefront API utility
const SHOPIFY_DOMAIN = process.env.REACT_APP_SHOPIFY_DOMAIN;
const STOREFRONT_API_TOKEN = process.env.REACT_APP_SHOPIFY_STOREFRONT_TOKEN;

if (!SHOPIFY_DOMAIN) {
  throw new Error("Missing REACT_APP_SHOPIFY_DOMAIN");
}
if (!STOREFRONT_API_TOKEN) {
  throw new Error("Missing REACT_APP_SHOPIFY_STOREFRONT_TOKEN");
}

const STOREFRONT_API_URL = `https://${SHOPIFY_DOMAIN}/api/2023-10/graphql.json`;

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(STOREFRONT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_API_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
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
          images(first: 1) { edges { node { url } } }
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
