"use client";

import {
  useCampaignStats,
} from "@/features/campaigns/use-campaign-stats";

interface CampaignStatsProps {
  campaignId: string;
}

//--------------------------------------------------
// Campaign Stats
//--------------------------------------------------

export default function CampaignStats({
  campaignId,
}: CampaignStatsProps) {
  const {
    data,
    isLoading,
    isError,
  } =
    useCampaignStats(
      campaignId
    );

  if (
    isError
  ) {
    return (
      <div
        className="
          rounded-lg
          border
          border-destructive/30
          bg-destructive/5
          p-5
          text-sm
          text-destructive
        "
      >
        Failed to load campaign statistics.
      </div>
    );
  }

  //------------------------------------------------
  // Unique Contact Metrics
  //------------------------------------------------

  const assignedContacts =
    data?.contacts.assigned ??
    0;

  const completedContacts =
    data?.contacts.completed ??
    0;

  const activeOrWaitingContacts =
    (
      data?.contacts.active ??
      0
    ) +
    (
      data?.contacts.awaitingRetry ??
      0
    );

  const unsuccessfulContacts =
    data?.contacts
      .totalUnsuccessful ??
    0;

  //------------------------------------------------
  // Attempt Metrics
  //------------------------------------------------

  const totalAttempts =
    data?.currentRunAttempts
      .total ??
    0;

  const retryAttempts =
    data?.currentRunAttempts
      .retries ??
    0;

  const completedAttempts =
    data?.currentRunAttempts
      .completed ??
    0;

  const activeAttempts =
    data?.currentRunAttempts
      .active ??
    0;

  const contactCards = [
    {
      title:
        "Assigned Contacts",

      value:
        assignedContacts,

      description:
        "Unique contacts assigned to this campaign",
    },

    {
      title:
        "Completed Contacts",

      value:
        completedContacts,

      description:
        "Unique contacts whose latest attempt completed",
    },

    {
      title:
        "Active or Awaiting Retry",

      value:
        activeOrWaitingContacts,

      description:
        "Contacts currently active or scheduled for retry",
    },

    {
      title:
        "Unsuccessful Contacts",

      value:
        unsuccessfulContacts,

      description:
        "Final failures including dispatch failures",
    },
  ];

  const attemptCards = [
    {
      title:
        "Total Call Attempts",

      value:
        totalAttempts,
    },

    {
      title:
        "Retry Attempts",

      value:
        retryAttempts,
    },

    {
      title:
        "Completed Attempts",

      value:
        completedAttempts,
    },

    {
      title:
        "Active Attempts",

      value:
        activeAttempts,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Unique contacts */}

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">
            Contact Outcomes
          </h2>

          <p className="text-sm text-muted-foreground">
            Each contact is counted once using its latest call attempt.
          </p>
        </div>

        <div
          className="
            grid
            gap-5
            sm:grid-cols-2
            xl:grid-cols-4
          "
        >
          {contactCards.map(
            card => (
              <StatCard
                key={
                  card.title
                }
                title={
                  card.title
                }
                value={
                  card.value
                }
                description={
                  card.description
                }
                isLoading={
                  isLoading
                }
              />
            )
          )}
        </div>
      </section>

      {/* Call attempts */}

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">
            Call Attempts
          </h2>

          <p className="text-sm text-muted-foreground">
            Includes initial calls and all retry attempts.
          </p>
        </div>

        <div
          className="
            grid
            gap-5
            sm:grid-cols-2
            xl:grid-cols-4
          "
        >
          {attemptCards.map(
            card => (
              <StatCard
                key={
                  card.title
                }
                title={
                  card.title
                }
                value={
                  card.value
                }
                isLoading={
                  isLoading
                }
              />
            )
          )}
        </div>
      </section>

      {/* Rates */}

      {!isLoading &&
        data && (
          <section
            className="
              grid
              gap-4
              rounded-lg
              border
              bg-card
              p-5
              sm:grid-cols-2
              xl:grid-cols-4
            "
          >
            <RateItem
              label="Contact Coverage"
              value={
                data.rates
                  .contactCoverageRate
              }
            />

            <RateItem
              label="Contact Completion"
              value={
                data.rates
                  .contactCompletionRate
              }
            />

            <RateItem
              label="Attempt Answer Rate"
              value={
                data.rates
                  .attemptAnswerRate
              }
            />

            <RateItem
              label="Attempt Completion"
              value={
                data.rates
                  .attemptCompletionRate
              }
            />
          </section>
        )}
    </div>
  );
}

//--------------------------------------------------
// Statistic Card
//--------------------------------------------------

function StatCard(
  {
    title,
    value,
    description,
    isLoading,
  }: {
    title: string;

    value: number;

    description?: string;

    isLoading: boolean;
  }
) {
  return (
    <div
      className="
        rounded-lg
        border
        bg-card
        p-5
      "
    >
      <h3
        className="
          text-sm
          font-medium
          text-muted-foreground
        "
      >
        {title}
      </h3>

      {isLoading ? (
        <div
          className="
            mt-3
            h-9
            w-16
            animate-pulse
            rounded
            bg-muted
          "
        />
      ) : (
        <p
          className="
            mt-2
            text-3xl
            font-bold
          "
        >
          {value}
        </p>
      )}

      {description && (
        <p
          className="
            mt-2
            text-xs
            leading-relaxed
            text-muted-foreground
          "
        >
          {description}
        </p>
      )}
    </div>
  );
}

//--------------------------------------------------
// Rate Item
//--------------------------------------------------

function RateItem(
  {
    label,
    value,
  }: {
    label: string;

    value: number;
  }
) {
  return (
    <div>
      <p
        className="
          text-sm
          text-muted-foreground
        "
      >
        {label}
      </p>

      <p
        className="
          mt-1
          text-2xl
          font-semibold
        "
      >
        {value.toFixed(
          2
        )}
        %
      </p>
    </div>
  );
}