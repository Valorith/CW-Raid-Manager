import { PrismaClient, GuildRole } from '@prisma/client';

const prisma = new PrismaClient();

const MEMBERS = [
  {
    email: 'officer.resurgence@example.com',
    displayName: 'Resurgence Officer',
    role: GuildRole.OFFICER
  },
  {
    email: 'raid-leader.resurgence@example.com',
    displayName: 'Resurgence Raid Leader',
    role: GuildRole.RAID_LEADER
  },
  {
    email: 'member.resurgence@example.com',
    displayName: 'Resurgence Raider',
    role: GuildRole.MEMBER
  }
];

async function ensureGuild() {
  const guild = await prisma.guild.findFirst({
    where: {
      name: 'Resurgence'
    }
  });

  if (!guild) {
    throw new Error(
      "Guild named 'Resurgence' not found. Create it first before seeding dummy members."
    );
  }

  return guild;
}

async function upsertUser({ email, displayName }) {
  return prisma.user.upsert({
    where: { email },
    update: {
      displayName
    },
    create: {
      email,
      displayName
    }
  });
}

async function upsertMembership({ guildId, userId, role }) {
  return prisma.guildMembership.upsert({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    },
    update: {
      role
    },
    create: {
      guildId,
      userId,
      role
    }
  });
}

async function main() {
  const guild = await ensureGuild();

  for (const member of MEMBERS) {
    const user = await upsertUser(member);
    const membership = await upsertMembership({
      guildId: guild.id,
      userId: user.id,
      role: member.role
    });

    console.log(
      `Added/updated ${member.displayName} (${member.role}) with userId=${user.id} -> membershipId=${membership.id}`
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Dummy members seeded successfully.');
  })
  .catch(async (error) => {
    console.error('Failed to seed dummy members:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
