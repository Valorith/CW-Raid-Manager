import { AttendanceStatus } from '@prisma/client';
import { resolveClassFromString } from '../services/attendanceService.js';
export function parseRaidRoster(contents) {
    const lines = contents.split(/\r?\n/);
    const entries = [];
    for (const line of lines) {
        if (!line.trim()) {
            continue;
        }
        const parts = line.split('\t').map((item) => item.trim());
        if (parts.length < 2) {
            continue;
        }
        const groupNumber = parseInt(parts[0], 10);
        const name = parts[1];
        const level = parts[2] ? parseInt(parts[2], 10) : null;
        const className = parts[3] ?? null;
        const flags = parts.slice(4).filter(Boolean).join(', ') || null;
        entries.push({
            characterName: name,
            groupNumber: Number.isNaN(groupNumber) ? null : groupNumber,
            level: Number.isNaN(level ?? NaN) ? null : level,
            class: resolveClassFromString(className),
            flags,
            status: AttendanceStatus.PRESENT
        });
    }
    return entries;
}
