export function bossSharePath(guildSlug: string, bossSlug: string): string {
  return `/b/${encodeURIComponent(guildSlug)}/${encodeURIComponent(bossSlug)}`;
}

export function bossShareUrl(origin: string, guildSlug: string, bossSlug: string): string {
  return new URL(bossSharePath(guildSlug, bossSlug), origin).toString();
}

export async function copyBossShareLink(
  origin: string,
  guildSlug: string,
  bossSlug: string,
  writeText: (value: string) => Promise<void>
): Promise<string> {
  const url = bossShareUrl(origin, guildSlug, bossSlug);
  await writeText(url);
  return url;
}
