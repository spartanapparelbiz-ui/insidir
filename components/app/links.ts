/* Where every "Get Insidir" button goes: the checkout embedded on /start. Server or client. */
export const unlockHref = (): string => "/start";

export const vapidPublicKey = (): string => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
