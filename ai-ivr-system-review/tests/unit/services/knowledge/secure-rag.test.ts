import {
  CallAuthenticationLevel,
} from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      queryRaw:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      $queryRaw:
        mocks.queryRaw,
    },
  })
);

import {
  resolveAllowedKnowledgeClassifications,
} from "@/services/knowledge/retrieval.service";

import {
  resolveSecureCampaignKnowledgeDocumentIds,
} from "@/services/knowledge/campaign-knowledge.service";

describe(
  "secure RAG policy",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      }
    );

    it(
      "fails closed when campaign owner context is missing",
      async () => {
        const documents =
          await resolveSecureCampaignKnowledgeDocumentIds(
            "campaign-1",
            {
              ownerUserId:
                null,
            }
          );

        expect(
          documents
        ).toEqual([]);
        expect(
          mocks.queryRaw
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "does not allow restricted knowledge at low authentication levels",
      () => {
        const low =
          resolveAllowedKnowledgeClassifications(
            CallAuthenticationLevel.AUTH_LEVEL_0
          );

        expect(
          low
        ).toEqual([
          "PUBLIC_PRODUCT_INFO",
          "INTERNAL",
        ]);
        expect(
          low
        ).not.toContain(
          "CUSTOMER_PERSONAL"
        );
        expect(
          low
        ).not.toContain(
          "SENSITIVE"
        );
        expect(
          low
        ).not.toContain(
          "RESTRICTED"
        );
      }
    );

    it(
      "expands access only to the generic high-auth classes",
      () => {
        const high =
          resolveAllowedKnowledgeClassifications(
            CallAuthenticationLevel.AUTH_LEVEL_2
          );

        expect(
          high
        ).toContain(
          "CUSTOMER_PERSONAL"
        );
        expect(
          high
        ).toContain(
          "SENSITIVE"
        );
        expect(
          high
        ).not.toContain(
          "RESTRICTED"
        );
      }
    );
  }
);
