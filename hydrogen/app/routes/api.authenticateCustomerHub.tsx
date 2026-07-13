import type { LoaderFunctionArgs, ActionFunctionArgs } from "@shopify/remix-oxygen";

/**
 * Klaviyo Customer Hub login handshake for the headless (Hydrogen) storefront.
 *
 * Per Klaviyo Support: the onsite Customer Hub widget calls /api/authenticateCustomerHub.
 * We hand Klaviyo the logged-in customer's Shopify Customer Account access token so it can
 * authenticate the Customer Hub session server-side (the token never touches the browser).
 *
 * company_id is the PUBLIC Klaviyo key (a.k.a. Company ID / site ID) — safe to ship. It is
 * the same key used by the onsite snippet in root.tsx (SC5Mtp).
 *
 * If no customer is logged in, we return 200 with no body (nothing to authenticate). Any
 * error is swallowed to a 200 so the widget never breaks the page.
 */

const KLAVIYO_COMPANY_ID = "SC5Mtp";
const KLAVIYO_LOGIN_ENDPOINT =
  "https://atlas-app.services.klaviyo.com/api/onsite/headless-shopify-login";

async function authenticate(context: LoaderFunctionArgs["context"]): Promise<Response> {
  try {
    const isLoggedIn = await context.customerAccount.isLoggedIn();
    if (!isLoggedIn) return new Response(null, { status: 200 });

    const accessToken = await context.customerAccount.getAccessToken();
    if (!accessToken) return new Response(null, { status: 200 });

    const klaviyoRes = await fetch(KLAVIYO_LOGIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        company_id: KLAVIYO_COMPANY_ID,
      }),
    });

    // Relay Klaviyo's response verbatim so the onsite widget completes its handshake.
    const bodyText = await klaviyoRes.text();
    return new Response(bodyText, {
      status: klaviyoRes.status,
      headers: {
        "Content-Type": klaviyoRes.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    // Never let the Customer Hub handshake break the storefront.
    return new Response(null, { status: 200 });
  }
}

// Support both GET (loader) and POST (action) — Klaviyo's widget may use either.
export async function loader({ context }: LoaderFunctionArgs) {
  return authenticate(context);
}

export async function action({ context }: ActionFunctionArgs) {
  return authenticate(context);
}
