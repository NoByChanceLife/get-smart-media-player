/**
 * Get Smart Media Player — In-Memory Ephemeral Session Store
 * Keeps active session tokens (like Stalker handshake tokens and temporary session IDs)
 * in memory without persisting them into localStorage or unencrypted browser persistence.
 */

class SessionTokenStore {
  private tokens = new Map<string, { token: string; expiresAt?: number }>();

  public setToken(serverId: string, token: string, ttlSeconds: number = 3600 * 4): void {
    if (!serverId || !token) return;
    this.tokens.set(serverId, {
      token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public getToken(serverId: string): string | undefined {
    const item = this.tokens.get(serverId);
    if (!item) return undefined;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.tokens.delete(serverId);
      return undefined;
    }
    return item.token;
  }

  public clearToken(serverId: string): void {
    this.tokens.delete(serverId);
  }

  public clearAll(): void {
    this.tokens.clear();
  }
}

export const sessionTokenStore = new SessionTokenStore();
