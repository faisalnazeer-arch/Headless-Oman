import { redirect, type LoaderFunctionArgs } from "@shopify/remix-oxygen";

// This domain used to be the Shopify theme, which served /customer_authentication/redirect
// (the New Customer Accounts login entry point). It's now Hydrogen, so that path 404s.
// Re-create it by forwarding to Shopify's own endpoint, which signs the buyer context and
// sends the shopper to the New Customer Accounts portal (account.mls.om) — exactly as the
// theme did. Preserves the original query (locale, region_country, …).
export async function loader({ request }: LoaderFunctionArgs) {
  const { search } = new URL(request.url);
  return redirect(`https://muscat-livestock.myshopify.com/customer_authentication/redirect${search}`);
}
