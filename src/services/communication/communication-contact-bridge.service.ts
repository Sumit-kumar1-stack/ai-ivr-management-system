import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

//--------------------------------------------------
// Recipient
//--------------------------------------------------

interface CommunicationContactRecipient {
  phone:
    string;

  fullName:
    string | null;

  language:
    string;
}

//--------------------------------------------------
// Ensure Existing Contact Records
//--------------------------------------------------

export async function ensureCommunicationContacts(
  recipients:
    CommunicationContactRecipient[],

  ownerUserId:
    string | null
): Promise<string[]> {
  const owner =
    ownerUserId
      ? await prisma.user.findUnique({
          where: { id: ownerUserId },
          select: { tenantId: true },
        })
      : null;

  const tenantId =
    owner?.tenantId ??
    null;

  if (!tenantId) {
    throw new Error(
      "Communication campaign owner must belong to a tenant"
    );
  }

  const ids =
    new Set<
      string
    >();

  for (
    const recipient
    of recipients
  ) {
    //------------------------------------------------
    // Existing
    //------------------------------------------------

    const existing =
      await prisma
        .contact
        .findUnique({
          where: {
            tenantId_phone: {
              tenantId,
              phone: recipient.phone,
            },
          },

          select: {
            id:
              true,
          },
        });

    if (
      existing
    ) {
      ids.add(
        existing.id
      );

      continue;
    }

    //------------------------------------------------
    // Create
    //------------------------------------------------

    try {
      const created =
        await prisma
          .contact
          .create({
            data: {
              fullName:
                recipient
                  .fullName ??
                "Customer",

              phone:
                recipient.phone,

              tenantId,

              ownerUserId,

              language:
                recipient.language,
            },

            select: {
              id:
                true,
            },
          });

      ids.add(
        created.id
      );
    } catch (
      error
    ) {
      //------------------------------------------------
      // Concurrent Contact Creation
      //------------------------------------------------

      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code ===
          "P2002"
      ) {
        const concurrent =
          await prisma
            .contact
            .findUnique({
              where: {
                tenantId_phone: {
                  tenantId,
                  phone: recipient.phone,
                },
              },

              select: {
                id:
                  true,
              },
            });

        if (
          concurrent
        ) {
          ids.add(
            concurrent.id
          );

          continue;
        }
      }

      throw error;
    }
  }

  return [
    ...ids,
  ];
}
