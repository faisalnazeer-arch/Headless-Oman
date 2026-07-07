import type { ActionFunctionArgs } from "@shopify/remix-oxygen";

const KLAVIYO_COMPANY_ID = "SC5Mtp";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { name?: string; email?: string; variantId?: string; productHandle?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, variantId, productHandle } = body;

  if (!email || !variantId) {
    return Response.json({ error: "Email and variantId are required" }, { status: 400 });
  }

  // Extract numeric ID from GID: "gid://shopify/ProductVariant/12345678" → "12345678"
  const numericVariantId = variantId.split("/").pop();
  if (!numericVariantId) {
    return Response.json({ error: "Invalid variantId" }, { status: 400 });
  }

  const klaviyoHeaders = {
    "Content-Type": "application/json",
    revision: "2024-02-15",
  };

  // 1. Upsert the profile so it appears immediately in Klaviyo Profiles
  const firstName = name?.trim().split(" ")[0] ?? "";
  const lastName = name?.trim().split(" ").slice(1).join(" ") ?? "";

  await fetch(
    `https://a.klaviyo.com/client/profiles/?company_id=${KLAVIYO_COMPANY_ID}`,
    {
      method: "POST",
      headers: klaviyoHeaders,
      body: JSON.stringify({
        data: {
          type: "profile",
          attributes: {
            email,
            ...(firstName && { first_name: firstName }),
            ...(lastName && { last_name: lastName }),
            properties: {
              back_in_stock_variant_id: numericVariantId,
              ...(productHandle && { back_in_stock_product_handle: productHandle }),
            },
          },
        },
      }),
    }
  ).catch(() => {}); // non-fatal — don't block on this

  // 2. Register the back-in-stock subscription (triggers automated Klaviyo email)
  try {
    const res = await fetch(
      `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${KLAVIYO_COMPANY_ID}`,
      {
        method: "POST",
        headers: klaviyoHeaders,
        body: JSON.stringify({
          data: {
            type: "back-in-stock-subscription",
            attributes: {
              channels: ["EMAIL"],
              profile: {
                data: {
                  type: "profile",
                  attributes: { email },
                },
              },
            },
            relationships: {
              variant: {
                data: {
                  type: "catalog-variant",
                  id: `$shopify:::$default:::${numericVariantId}`,
                },
              },
            },
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Klaviyo back-in-stock error:", res.status, errText);
      // 404 means variant not yet indexed in Klaviyo catalog — treat as success
      // so the user isn't shown an error for a transient sync delay
      if (res.status === 404) {
        return Response.json({ success: true });
      }
      return Response.json(
        { error: "Could not register notification. Please try again." },
        { status: 502 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Klaviyo fetch failed:", err);
    return Response.json({ error: "Network error. Please try again." }, { status: 502 });
  }
}
