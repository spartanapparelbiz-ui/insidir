/** The component gallery and its example images exist in development, or in a build started with DEV_GALLERY=1
 *  (the QA server). In production they 404. */
export const galleryOn = (): boolean => process.env.NODE_ENV !== "production" || process.env.DEV_GALLERY === "1";
