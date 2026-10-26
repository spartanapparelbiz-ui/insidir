"use client";
/* Whop's Checkout element, embedded on /pricing so the buyer pays without leaving insidir.com. It needs no API key:
 * the plan sets the price. metadata.customer_id is our user id (Whop copies it to the payment and membership).
 * Access never comes from here: after paying, the buyer goes to the Terminal, which asks Whop (users.checkAccess).
 * If the element can't load, the server-side checkout (POST /api/checkout) is offered instead. */
import { loadWhop } from "@whop/elements";
import { Checkout, CheckoutElement, WhopElements } from "@whop/elements-react";
import { useEffect, useState } from "react";
import { beacon } from "./beacon";

export function WhopCheckout({ planId, plan, customerId, buyerEmail, affiliateCode, environment, returnUrl }: {
  planId: string; plan: "insidir" | "pro"; customerId: string; buyerEmail: string | null; affiliateCode: string | null;
  environment: "production" | "sandbox"; returnUrl: string;
}) {
  // loadWhop() injects Whop's script, so it may only run in the browser.
  const [elements, setElements] = useState<ReturnType<typeof loadWhop> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setElements(loadWhop());
    beacon("checkout_start", `embed-${plan}`);
  }, [plan]);

  if (failed) return <CheckoutFallback plan={plan} note="The checkout didn't load here." />;
  return (
    <div className="whopcheckout" data-testid="whop-checkout">
      <WhopElements elements={elements} environment={environment} onLoadError={() => setFailed(true)}>
        <Checkout plan={planId} metadata={{ customer_id: customerId }} returnUrl={returnUrl}
          {...(affiliateCode ? { affiliateCode } : {})}
          onComplete={c => { if (c.result === "payment") window.location.assign(returnUrl); }}>
          <CheckoutElement {...(buyerEmail ? { buyerEmail } : {})} onError={() => setFailed(true)} />
        </Checkout>
      </WhopElements>
      <CheckoutFallback plan={plan} note="Trouble paying here?" quiet />
    </div>
  );
}

/** The server-side checkout: a Whop checkout configuration, then back to the live Terminal. */
export function CheckoutFallback({ plan, note, quiet = false }: { plan: "insidir" | "pro"; note?: string; quiet?: boolean }) {
  return (
    <form method="post" action="/api/checkout" className={quiet ? "checkout-fallback checkout-fallback--quiet" : "checkout-fallback"}>
      <input type="hidden" name="plan" value={plan} />
      {note ? <span className="muted small">{note} </span> : null}
      <button type="submit" className={quiet ? "btn btn--ghost" : "btn btn--primary btn--block"} data-checkout={`redirect-${plan}`}>
        {quiet ? "Pay on Whop's secure page instead" : "Continue to secure checkout"}
      </button>
    </form>
  );
}
