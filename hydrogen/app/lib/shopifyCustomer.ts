// Shopify Customer Account API — public client (PKCE) configuration.
// These values come from the Shopify admin → Customer Account API page.
export const SHOPIFY_CUSTOMER = {
  shopId: "28537323629",
  clientId: "99e6e6b5-2b20-48cf-a9ad-1bbd4c5a6b8a",
  authorizeUrl: "https://shopify.com/authentication/28537323629/oauth/authorize",
  tokenUrl: "https://shopify.com/authentication/28537323629/oauth/token",
  logoutUrl: "https://shopify.com/authentication/28537323629/logout",
  apiUrl: "https://shopify.com/28537323629/account/customer/api/2025-07/graphql",
  // OAuth scopes required for reading the customer profile + orders.
  scope: "openid email customer-account-api:full",
} as const;

// Cookie names used by the auth flow
export const AUTH_COOKIES = {
  accessToken: "mls_cust_at",
  refreshToken: "mls_cust_rt",
  idToken: "mls_cust_id",
  pkceVerifier: "mls_pkce_v",
  oauthState: "mls_oauth_s",
} as const;
