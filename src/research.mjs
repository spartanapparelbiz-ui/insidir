// Validation for a user's private research journal. Never interprets a review as a trade order.
const validStatuses = new Set(["researching", "watching", "passed"]);
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
export function validateResearchDecision(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid("Expected a research review");
  const reviewStatus = input.reviewStatus;
  if (typeof reviewStatus !== "string" || !validStatuses.has(reviewStatus)) throw invalid("Invalid review status");
  if (input.notes !== undefined && typeof input.notes !== "string") throw invalid("Notes must be text");
  const notes = (input.notes || "").trim();
  if (notes.length > 1500) throw invalid("Notes must be at most 1500 characters");
  return { reviewStatus, notes };
}
