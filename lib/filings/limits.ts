/* Size limits for member data, shared by the API (enforced) and the browser (shown before a save is refused). */
export const LIMITS = { lists: 20, perList: 200, listName: 40, noteChars: 20_000, notesPerCompany: 500, positions: 500, reason: 200 } as const;
