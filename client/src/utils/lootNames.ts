export interface NormalizedLooter {
  name: string;
  isGuildBank: boolean;
  isMasterLooter: boolean;
}

export function getGuildBankDisplayName(guildName?: string | null): string {
  const trimmed = guildName?.trim();
  if (trimmed && trimmed.length > 0) {
    return `${trimmed} Bank`;
  }
  return 'Guild Bank';
}

export function normalizeLooterName(
  looterName: string | null | undefined,
  guildName?: string | null
): NormalizedLooter {
  const bankName = getGuildBankDisplayName(guildName);
  const trimmed = looterName?.trim();
  if (!trimmed) {
    return { name: 'Unknown', isGuildBank: false, isMasterLooter: false };
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'guild' || lower === bankName.toLowerCase()) {
    return { name: bankName, isGuildBank: true, isMasterLooter: false };
  }
  if (lower === 'master looter') {
    return { name: 'Master Looter', isGuildBank: false, isMasterLooter: true };
  }
  return { name: trimmed, isGuildBank: false, isMasterLooter: false };
}

export function isGuildBankName(looterName: string | null | undefined, guildName?: string | null) {
  return normalizeLooterName(looterName, guildName).isGuildBank;
}

export function isMasterLooterName(looterName: string | null | undefined) {
  return normalizeLooterName(looterName, null).isMasterLooter;
}

export function normalizeLooterForSubmission(
  looterName: string,
  guildName?: string | null
): string {
  return normalizeLooterName(looterName, guildName).name;
}
