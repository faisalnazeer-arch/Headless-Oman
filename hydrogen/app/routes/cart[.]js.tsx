import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

export async function loader({ context }: LoaderFunctionArgs) {
  const cart = await context.cart.get();

  const items = (cart?.lines?.nodes ?? []).map((line: any) => ({
    id: line.id,
    quantity: line.quantity,
    variant_id: parseInt(
      line.merchandise?.id?.replace("gid://shopify/ProductVariant/", "") ?? "0"
    ),
    product_id: parseInt(
      line.merchandise?.product?.id?.replace("gid://shopify/Product/", "") ?? "0"
    ),
    title: line.merchandise?.product?.title ?? "",
    price: Math.round((parseFloat(line.merchandise?.price?.amount ?? "0")) * 100),
  }));

  const total = Math.round(
    parseFloat(cart?.cost?.totalAmount?.amount ?? "0") * 100
  );

  return new Response(
    JSON.stringify({
      token: cart?.id ?? "",
      item_count: items.reduce((sum: number, i: any) => sum + i.quantity, 0),
      items,
      total_price: total,
      currency: cart?.cost?.totalAmount?.currencyCode ?? "OMR",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
