export function withPreferredDisplayName(user) {
    const preferred = user.nickname ?? user.displayName;
    const { nickname, ...rest } = user;
    return {
        ...rest,
        displayName: preferred,
        ...(nickname !== undefined ? { nickname } : {})
    };
}
