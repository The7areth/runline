export const env: { DB?: D1Database; BUCKET?: R2Bucket } = {};
export const session: { userId: string | null } = { userId: null };
export async function getChatGPTUser() {
  return session.userId ? { userId: session.userId } : null;
}
