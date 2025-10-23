export interface DisplayNameSource {
  displayName: string;
  nickname?: string | null;
}

export function withPreferredDisplayName<T extends DisplayNameSource>(
  user: T
): Omit<T, 'nickname'> & { nickname?: string | null; displayName: string } {
  const preferred = user.nickname ?? user.displayName;
  const { nickname, ...rest } = user;
  return {
    ...rest,
    displayName: preferred,
    ...(nickname !== undefined ? { nickname } : {})
  };
}
