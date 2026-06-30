import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

const DISCOUNT_QUERY = `
  query CheckDiscount($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      codeDiscount {
        ... on DiscountCodeBasic {
          status
          title
          endsAt
          usageLimit
          appliesOncePerCustomer
          minimumRequirement {
            ... on DiscountMinimumSubtotal {
              greaterThanOrEqualToSubtotal { amount currencyCode }
            }
            ... on DiscountMinimumQuantity {
              greaterThanOrEqualToQuantity
            }
          }
          customerGets {
            items {
              ... on AllDiscountItems { allItems }
              ... on DiscountProducts {
                products(first: 3) { nodes { title } }
              }
              ... on DiscountCollections {
                collections(first: 3) { nodes { title } }
              }
            }
          }
        }
        ... on DiscountCodeFreeShipping {
          status
          title
          endsAt
          minimumRequirement {
            ... on DiscountMinimumSubtotal {
              greaterThanOrEqualToSubtotal { amount currencyCode }
            }
            ... on DiscountMinimumQuantity {
              greaterThanOrEqualToQuantity
            }
          }
        }
        ... on DiscountCodeBxgy {
          status
          title
          endsAt
        }
      }
    }
  }
`;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase();
  const cartTotal = parseFloat(url.searchParams.get("cartTotal") ?? "0");
  const currency = url.searchParams.get("currency") ?? "OMR";

  if (!code) {
    return Response.json({ reason: null });
  }

  try {
    const data = await (context as any).adminFetch(DISCOUNT_QUERY, { code });
    const discount = data?.codeDiscountNodeByCode?.codeDiscount;

    if (!discount) {
      return Response.json({ reason: "This discount code doesn't exist. Please check the code and try again." });
    }

    return Response.json({ reason: buildReason(discount, cartTotal, currency) });
  } catch {
    return Response.json({ reason: null });
  }
}

function buildReason(discount: any, cartTotal: number, currency: string): string {
  const status: string = discount.status ?? "ACTIVE";

  if (status === "EXPIRED") {
    const endDate = discount.endsAt
      ? new Date(discount.endsAt).toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" })
      : "";
    return `This discount code has expired${endDate ? ` (${endDate})` : ""}.`;
  }

  if (status === "SCHEDULED") {
    return "This discount code is not active yet.";
  }

  if (status !== "ACTIVE") {
    return "This discount code is inactive.";
  }

  // Code is ACTIVE — find why it's not applicable to this cart
  const minReq = discount.minimumRequirement;

  if (minReq?.greaterThanOrEqualToSubtotal) {
    const minAmt = parseFloat(minReq.greaterThanOrEqualToSubtotal.amount);
    const cur = minReq.greaterThanOrEqualToSubtotal.currencyCode ?? currency;
    if (cartTotal < minAmt) {
      const needed = (minAmt - cartTotal).toFixed(2);
      return `Minimum order of ${cur} ${minAmt.toFixed(2)} required. Add ${cur} ${needed} more to use this code.`;
    }
  }

  if (minReq?.greaterThanOrEqualToQuantity) {
    const minQty: number = minReq.greaterThanOrEqualToQuantity;
    return `This code requires at least ${minQty} item${minQty > 1 ? "s" : ""} in your cart.`;
  }

  // Check product/collection restrictions (DiscountCodeBasic only)
  const items = discount.customerGets?.items;
  if (items && !items.allItems) {
    const products: string[] = items.products?.nodes?.map((p: any) => p.title) ?? [];
    const collections: string[] = items.collections?.nodes?.map((c: any) => c.title) ?? [];
    if (products.length > 0) {
      const listed = products.slice(0, 2).join(" & ");
      const extra = products.length > 2 ? ` (+${products.length - 2} more)` : "";
      return `This code only applies to: ${listed}${extra}. These items are not in your cart.`;
    }
    if (collections.length > 0) {
      const listed = collections.slice(0, 2).join(" & ");
      return `This code only applies to the "${listed}" collection. None of those products are in your cart.`;
    }
    return "This code only applies to specific products that are not in your cart.";
  }

  if (discount.appliesOncePerCustomer) {
    return "This code can only be used once per customer account.";
  }

  if (discount.usageLimit !== null && discount.usageLimit !== undefined) {
    return "This code has reached its maximum usage limit.";
  }

  return "This code cannot be applied to your current cart.";
}
