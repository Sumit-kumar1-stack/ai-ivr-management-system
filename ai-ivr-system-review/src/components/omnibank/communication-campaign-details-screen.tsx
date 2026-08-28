"use client";

import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Smartphone,
  Users,
  XCircle,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import type {
  CommunicationCampaignInsightsDTO,
  CommunicationChannelMixDTO,
  CommunicationRecipientInsightDTO,
  RecipientChannelInsightDTO,
  UnifiedChannelStatus,
} from "@/types/communication-insights";

import type {
  CommunicationChannel,
} from "@/types/communication-campaign";

//--------------------------------------------------
// Props
//--------------------------------------------------

interface CampaignDetailsScreenProps {
  campaignId:
    string;
}

//--------------------------------------------------
// API
//--------------------------------------------------

interface InsightsApiResponse {
  success:
    boolean;

  data?:
    CommunicationCampaignInsightsDTO;

  message?:
    string;
}

//--------------------------------------------------
// Channel Labels
//--------------------------------------------------

const channelLabels:
  Record<
    CommunicationChannel,
    string
  > =
{
  SMS:
    "SMS",

  WHATSAPP:
    "WhatsApp",

  AI_VOICE:
    "AI Voice",

  IVR:
    "IVR",
};

//--------------------------------------------------
// Main Component
//--------------------------------------------------

export default function CampaignDetailsScreen({
  campaignId,
}: CampaignDetailsScreenProps) {
  const router =
    useRouter();

  const [
    data,
    setData,
  ] =
    useState<
      CommunicationCampaignInsightsDTO |
      null
    >(
      null
    );

  const [
    page,
    setPage,
  ] =
    useState(
      1
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false
    );

  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  //------------------------------------------------
  // Load
  //------------------------------------------------

  const load =
    useCallback(
      async (
        background =
          false
      ): Promise<void> => {
        if (
          !campaignId
        ) {
          setError(
            "Communication campaign ID is missing."
          );

          setLoading(
            false
          );

          return;
        }

        if (
          background
        ) {
          setRefreshing(
            true
          );
        } else {
          setLoading(
            true
          );
        }

        try {
          const response =
            await fetch(
              `/api/communication/campaigns/${encodeURIComponent(
                campaignId
              )}/insights?page=${page}&pageSize=25`,
              {
                cache:
                  "no-store",
              }
            );

          const payload =
            await response
              .json() as
              InsightsApiResponse;

          if (
            !response.ok ||
            !payload.success ||
            !payload.data
          ) {
            throw new Error(
              payload.message ??
              "Campaign insights could not be loaded"
            );
          }

          setData(
            payload.data
          );

          setError(
            null
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Campaign insights could not be loaded"
          );
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [
        campaignId,
        page,
      ]
    );

  //------------------------------------------------
  // Initial Load + Polling
  //------------------------------------------------

  useEffect(
    () => {
      /*
       * Schedule the first load instead of invoking it
       * synchronously from the effect body. This keeps
       * React Compiler's set-state-in-effect rule happy
       * while preserving the same initial-load behavior.
       */
      const initialLoadTimer =
        window.setTimeout(
          () => {
            void load();
          },
          0
        );

      const interval =
        window.setInterval(
          () => {
            void load(
              true
            );
          },
          10_000
        );

      return () => {
        window.clearTimeout(
          initialLoadTimer
        );

        window.clearInterval(
          interval
        );
      };
    },
    [
      load,
    ]
  );

  //------------------------------------------------
  // Analytics Access + Headline Metrics
  //------------------------------------------------

  const advancedAnalytics =
    data
      ?.analyticsAccess ===
    "ADVANCED";

  const headlineMetrics =
    useMemo(
      () => {
        if (
          !data
        ) {
          return [];
        }

        const base =
          [
            {
              label:
                "Sent",

              value:
                data
                  .metrics
                  .sent,

              helper:
                "Outbound attempts",
            },
            {
              label:
                "Delivered",

              value:
                data
                  .metrics
                  .delivered,

              helper:
                "Messages + reached calls",
            },
            {
              label:
                "Opened",

              value:
                data
                  .metrics
                  .opened,

              helper:
                "WhatsApp read receipts",
            },
          ];

        if (
          data.analyticsAccess ===
          "ADVANCED"
        ) {
          return [
            ...base,
            {
              label:
                "Converted",

              value:
                data
                  .metrics
                  .converted,

              helper:
                "Attributed converted leads",
            },
          ];
        }

        return [
          ...base,
          {
            label:
              "Failed",

            value:
              data.metrics.dropped +
              data.metrics.bounced,

            helper:
              "Failed calls + messages",
          },
        ];
      },
      [
        data,
      ]
    );

  //------------------------------------------------
  // Loading
  //------------------------------------------------

  if (
    loading &&
    !data
  ) {
    return (
      <div
        className="
          flex
          min-h-[70vh]
          items-center
          justify-center
        "
      >
        <RefreshCw
          className="
            animate-spin
            text-[#0066cc]
          "
          size={34}
        />
      </div>
    );
  }

  //------------------------------------------------
  // Hard Error
  //------------------------------------------------

  if (
    !data
  ) {
    return (
      <div
        className="
          mx-auto
          max-w-[900px]
          px-6
          py-20
        "
      >
        <button
          type="button"
          onClick={
            () =>
              router.back()
          }
          className="
            mb-6
            flex
            items-center
            gap-2
            text-[13px]
            font-bold
            text-[#0066cc]
          "
        >
          <ArrowLeft
            size={17}
          />

          Back
        </button>

        <div
          className="
            rounded-2xl
            border
            border-red-200
            bg-red-50
            p-6
            text-red-700
          "
        >
          {error ??
            "Campaign insights could not be loaded."}
        </div>
      </div>
    );
  }

  //------------------------------------------------
  // Render
  //------------------------------------------------

  return (
    <div
      className="
        min-h-screen
        bg-[#f9f9ff]
        px-6
        pb-16
        pt-8
        md:px-10
        xl:px-[72px]
      "
    >
      <main
        className="
          mx-auto
          max-w-[1120px]
        "
      >
        {/* =======================================
            HEADER
        ======================================= */}

        <section
          className="
            flex
            flex-col
            gap-6
            md:flex-row
            md:items-start
            md:justify-between
          "
        >
          <div>
            <button
              type="button"
              onClick={
                () =>
                  router.back()
              }
              className="
                flex
                items-center
                gap-2
                text-[13px]
                font-bold
                text-[#0066cc]
                transition
                hover:text-[#004e9f]
              "
            >
              <ArrowLeft
                size={17}
              />

              Campaigns
            </button>

            <h1
              className="
                mt-5
                text-[34px]
                font-semibold
                tracking-[-0.04em]
                text-[#191c22]
              "
            >
              {data.campaign.name}
            </h1>

            <div
              className="
                mt-3
                flex
                flex-wrap
                items-center
                gap-3
                text-[13px]
                text-[#727784]
              "
            >
              <span>
                {data
                  .campaign
                  .audienceSourceName}
              </span>

              <span>
                •
              </span>

              <span>
                {formatNumber(
                  data
                    .campaign
                    .recipientCount
                )}{" "}
                recipients
              </span>

              <span>
                •
              </span>

              <span>
                {data
                  .campaign
                  .tier ===
                "PREMIUM"
                  ? "Premium"
                  : "Standard"}
              </span>
            </div>
          </div>

          <div
            className="
              flex
              items-center
              gap-3
            "
          >
            <StatusBadge
              status={
                data
                  .campaign
                  .status
              }
            />

            <button
              type="button"
              onClick={
                () =>
                  void load(
                    true
                  )
              }
              disabled={
                refreshing
              }
              className="
                flex
                h-10
                items-center
                gap-2
                rounded-full
                border
                border-[#c1c6d5]
                bg-white
                px-4
                text-[12px]
                font-bold
                text-[#414753]
                transition
                hover:border-[#8c94a3]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <RefreshCw
                size={15}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>
          </div>
        </section>

        {/* =======================================
            PRIMARY FUNNEL
        ======================================= */}

        <section
          className="
            mt-10
            grid
            gap-4
            sm:grid-cols-2
            xl:grid-cols-4
          "
        >
          {headlineMetrics.map(
            metric => (
              <MetricCard
                key={
                  metric.label
                }
                label={
                  metric.label
                }
                value={
                  metric.value
                }
                helper={
                  metric.helper
                }
              />
            )
          )}
        </section>

        {/* =======================================
            PLAN-AWARE ANALYTICS
        ======================================= */}

        {advancedAnalytics ? (
          <section
            className="
              mt-5
              grid
              gap-4
              sm:grid-cols-2
              xl:grid-cols-4
            "
          >
            <SmallMetric
              label="Dropped"
              value={
                formatNumber(
                  data
                    .metrics
                    .dropped
                )
              }
            />

            <SmallMetric
              label="Bounced"
              value={
                formatNumber(
                  data
                    .metrics
                    .bounced
                )
              }
            />

            <SmallMetric
              label="Unsubscribed"
              value={
                formatNumber(
                  data
                    .metrics
                    .unsubscribed
                )
              }
            />

            <SmallMetric
              label="Avg. time to open"
              value={
                formatDuration(
                  data
                    .metrics
                    .averageTimeToOpenSeconds
                )
              }
            />
          </section>
        ) : (
          <section
            className="
              mt-5
              rounded-[22px]
              border
              border-[#d7e3ff]
              bg-[#f4f8ff]
              px-6
              py-5
            "
          >
            <div
              className="
                flex
                flex-col
                gap-2
                sm:flex-row
                sm:items-center
                sm:justify-between
              "
            >
              <div>
                <p
                  className="
                    text-[11px]
                    font-bold
                    uppercase
                    tracking-[0.13em]
                    text-[#0066cc]
                  "
                >
                  Standard Analytics
                </p>

                <p
                  className="
                    mt-1
                    text-[13px]
                    leading-5
                    text-[#4f5662]
                  "
                >
                  Delivery, open and failure tracking are available.
                  Conversion attribution, unsubscribe analysis, channel
                  success rates and duration analytics require Premium.
                </p>
              </div>

              <span
                className="
                  shrink-0
                  rounded-full
                  bg-[#d7e3ff]
                  px-4
                  py-2
                  text-[11px]
                  font-bold
                  text-[#004e9f]
                "
              >
                Advanced analytics locked
              </span>
            </div>
          </section>
        )}

        {/* =======================================
            CHANNEL MIX
        ======================================= */}

        <section
          className="
            mt-10
            rounded-[24px]
            border
            border-[#dfe2ec]
            bg-white
            p-7
            shadow-[0_10px_30px_rgba(23,35,58,0.04)]
          "
        >
          <div
            className="
              flex
              flex-col
              gap-2
              sm:flex-row
              sm:items-end
              sm:justify-between
            "
          >
            <div>
              <p
                className="
                  text-[11px]
                  font-bold
                  uppercase
                  tracking-[0.14em]
                  text-[#727784]
                "
              >
                Performance
              </p>

              <h2
                className="
                  mt-2
                  text-[22px]
                  font-bold
                  tracking-[-0.025em]
                  text-[#191c22]
                "
              >
                Channel Mix
              </h2>
            </div>

            <p
              className="
                text-[12px]
                text-[#727784]
              "
            >
              Last refreshed{" "}
              {formatDateTime(
                data
                  .refreshedAt
              )}
            </p>
          </div>

          <div
            className="
              mt-7
              grid
              gap-4
              md:grid-cols-2
              xl:grid-cols-4
            "
          >
            {data
              .channelMix
              .map(
                item => (
                  <ChannelCard
                    key={
                      item.channel
                    }
                    item={
                      item
                    }
                    advancedAnalytics={
                      advancedAnalytics
                    }
                  />
                )
              )}
          </div>
        </section>

        {/* =======================================
            RECIPIENT INSIGHTS
        ======================================= */}

        <section
          className="
            mt-10
            overflow-hidden
            rounded-[24px]
            border
            border-[#dfe2ec]
            bg-white
            shadow-[0_10px_30px_rgba(23,35,58,0.04)]
          "
        >
          <div
            className="
              flex
              flex-col
              gap-3
              border-b
              border-[#e6e8f1]
              px-7
              py-6
              md:flex-row
              md:items-center
              md:justify-between
            "
          >
            <div>
              <p
                className="
                  text-[11px]
                  font-bold
                  uppercase
                  tracking-[0.14em]
                  text-[#727784]
                "
              >
                Real-time
              </p>

              <h2
                className="
                  mt-2
                  text-[22px]
                  font-bold
                  tracking-[-0.025em]
                  text-[#191c22]
                "
              >
                Recipient Insights
              </h2>
            </div>

            <div
              className="
                flex
                items-center
                gap-2
                text-[12px]
                text-[#727784]
              "
            >
              <Users
                size={16}
              />

              {formatNumber(
                data
                  .pagination
                  .total
              )}{" "}
              recipients
            </div>
          </div>

          {error && (
            <div
              className="
                border-b
                border-red-100
                bg-red-50
                px-7
                py-3
                text-[12px]
                text-red-700
              "
            >
              Refresh warning: {error}
            </div>
          )}

          <div
            className="
              overflow-x-auto
            "
          >
            <table
              className="
                min-w-[1040px]
                w-full
                border-collapse
              "
            >
              <thead>
                <tr
                  className="
                    bg-[#f7f8fc]
                    text-left
                    text-[10px]
                    font-bold
                    uppercase
                    tracking-[0.12em]
                    text-[#727784]
                  "
                >
                  <th className="px-6 py-4">
                    Recipient
                  </th>

                  <th className="px-4 py-4">
                    Overall
                  </th>

                  <th className="px-4 py-4">
                    SMS
                  </th>

                  <th className="px-4 py-4">
                    WhatsApp
                  </th>

                  <th className="px-4 py-4">
                    AI Voice
                  </th>

                  <th className="px-4 py-4">
                    IVR
                  </th>

                  <th className="px-6 py-4">
                    Last Activity
                  </th>
                </tr>
              </thead>

              <tbody>
                {data
                  .recipients
                  .map(
                    recipient => (
                      <RecipientRow
                        key={
                          recipient.id
                        }
                        recipient={
                          recipient
                        }
                      />
                    )
                  )}

                {data
                  .recipients
                  .length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="
                        px-6
                        py-14
                        text-center
                        text-[13px]
                        text-[#727784]
                      "
                    >
                      No recipient snapshots are available
                      for this campaign.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* =====================================
              PAGINATION
          ===================================== */}

          <div
            className="
              flex
              items-center
              justify-between
              border-t
              border-[#e6e8f1]
              px-7
              py-5
            "
          >
            <p
              className="
                text-[12px]
                text-[#727784]
              "
            >
              Page{" "}
              {data
                .pagination
                .page}{" "}
              of{" "}
              {data
                .pagination
                .totalPages}
            </p>

            <div
              className="
                flex
                gap-2
              "
            >
              <button
                type="button"
                disabled={
                  data
                    .pagination
                    .page <=
                  1
                }
                onClick={
                  () =>
                    setPage(
                      current =>
                        Math.max(
                          1,
                          current -
                            1
                        )
                    )
                }
                className="
                  flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-full
                  border
                  border-[#c1c6d5]
                  text-[#414753]
                  transition
                  hover:bg-[#f2f3fc]
                  disabled:cursor-not-allowed
                  disabled:opacity-35
                "
              >
                <ChevronLeft
                  size={17}
                />
              </button>

              <button
                type="button"
                disabled={
                  data
                    .pagination
                    .page >=
                  data
                    .pagination
                    .totalPages
                }
                onClick={
                  () =>
                    setPage(
                      current =>
                        current +
                        1
                    )
                }
                className="
                  flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-full
                  border
                  border-[#c1c6d5]
                  text-[#414753]
                  transition
                  hover:bg-[#f2f3fc]
                  disabled:cursor-not-allowed
                  disabled:opacity-35
                "
              >
                <ChevronRight
                  size={17}
                />
              </button>
            </div>
          </div>
        </section>

        {/* =======================================
            DATA NOTES
        ======================================= */}

        <section
          className="
            mt-6
            rounded-2xl
            bg-[#f2f3fc]
            px-6
            py-4
            text-[12px]
            leading-5
            text-[#5e6470]
          "
        >
          <strong className="text-[#191c22]">
            Metric scope:
          </strong>{" "}
          Opened is based on WhatsApp READ receipts.
          {advancedAnalytics
            ? " Premium analytics include conversion attribution and channel optimization metrics. Messaging click-through conversion attribution is not yet part of the current data model."
            : " Standard analytics intentionally expose operational delivery metrics only; Premium-only attribution and optimization metrics are withheld server-side."}
        </section>
      </main>
    </div>
  );
}

//--------------------------------------------------
// Metric Card
//--------------------------------------------------

function MetricCard({
  label,
  value,
  helper,
}: {
  label:
    string;

  value:
    number;

  helper:
    string;
}) {
  return (
    <div
      className="
        rounded-[22px]
        border
        border-[#dfe2ec]
        bg-white
        p-6
        shadow-[0_10px_30px_rgba(23,35,58,0.035)]
      "
    >
      <p
        className="
          text-[11px]
          font-bold
          uppercase
          tracking-[0.13em]
          text-[#727784]
        "
      >
        {label}
      </p>

      <p
        className="
          mt-3
          text-[31px]
          font-semibold
          tracking-[-0.04em]
          text-[#191c22]
        "
      >
        {formatNumber(
          value
        )}
      </p>

      <p
        className="
          mt-2
          text-[11px]
          text-[#8a8f99]
        "
      >
        {helper}
      </p>
    </div>
  );
}

//--------------------------------------------------
// Small Metric
//--------------------------------------------------

function SmallMetric({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div
      className="
        flex
        items-center
        justify-between
        rounded-2xl
        bg-[#f2f3fc]
        px-5
        py-4
      "
    >
      <span
        className="
          text-[12px]
          font-semibold
          text-[#5e6470]
        "
      >
        {label}
      </span>

      <span
        className="
          text-[16px]
          font-bold
          text-[#191c22]
        "
      >
        {value}
      </span>
    </div>
  );
}

//--------------------------------------------------
// Channel Card
//--------------------------------------------------

function ChannelCard({
  item,
  advancedAnalytics,
}: {
  item:
    CommunicationChannelMixDTO;

  advancedAnalytics:
    boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-5",
        item.selected
          ? "border-[#e0e4ee] bg-[#fbfcff]"
          : "border-[#eceef4] bg-[#f7f8fb] opacity-55",
      ].join(
        " "
      )}
    >
      <div
        className="
          flex
          items-center
          justify-between
        "
      >
        <div
          className="
            flex
            h-10
            w-10
            items-center
            justify-center
            rounded-xl
            bg-[#e9f1ff]
            text-[#0066cc]
          "
        >
          <ChannelIcon
            channel={
              item.channel
            }
          />
        </div>

        <span
          className="
            text-[11px]
            font-bold
            text-[#727784]
          "
        >
          {item.selected
            ? advancedAnalytics
              ? `${item.successRate.toFixed(
                  1
                )}%`
              : "Basic"
            : "Not selected"}
        </span>
      </div>

      <h3
        className="
          mt-4
          text-[15px]
          font-bold
          text-[#191c22]
        "
      >
        {
          channelLabels[
            item.channel
          ]
        }
      </h3>

      <div
        className="
          mt-4
          grid
          grid-cols-2
          gap-3
          text-[11px]
        "
      >
        <ChannelMiniStat
          label="Attempts"
          value={
            formatNumber(
              item.attempts
            )
          }
        />

        <ChannelMiniStat
          label="Successful"
          value={
            formatNumber(
              item.successful
            )
          }
        />

        <ChannelMiniStat
          label="Failed"
          value={
            formatNumber(
              item.failed
            )
          }
        />

        <ChannelMiniStat
          label={
            advancedAnalytics
              ? item.channel ===
                  "AI_VOICE" ||
                item.channel ===
                  "IVR"
                ? "Avg. duration"
                : "Success rate"
              : "Analytics"
          }
          value={
            advancedAnalytics
              ? item.channel ===
                  "AI_VOICE" ||
                item.channel ===
                  "IVR"
                ? formatDuration(
                    item
                      .averageDurationSeconds
                  )
                : `${item.successRate.toFixed(
                    1
                  )}%`
              : "Premium"
          }
        />
      </div>
    </div>
  );
}

//--------------------------------------------------
// Mini Stat
//--------------------------------------------------

function ChannelMiniStat({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div
      className="
        rounded-xl
        bg-white
        px-3
        py-3
      "
    >
      <p
        className="
          text-[#8a8f99]
        "
      >
        {label}
      </p>

      <p
        className="
          mt-1
          font-bold
          text-[#191c22]
        "
      >
        {value}
      </p>
    </div>
  );
}

//--------------------------------------------------
// Recipient Row
//--------------------------------------------------

function RecipientRow({
  recipient,
}: {
  recipient:
    CommunicationRecipientInsightDTO;
}) {
  return (
    <tr
      className="
        border-t
        border-[#eef0f5]
        text-[12px]
        text-[#414753]
        first:border-t-0
      "
    >
      <td
        className="
          px-6
          py-5
        "
      >
        <p
          className="
            max-w-[210px]
            truncate
            font-bold
            text-[#191c22]
          "
        >
          {recipient.fullName ??
            "Customer"}
        </p>

        <p
          className="
            mt-1
            text-[11px]
            text-[#8a8f99]
          "
        >
          {recipient.phoneMasked}

          {recipient
            .externalRecipientId
            ? ` • ${recipient.externalRecipientId}`
            : ""}
        </p>

        {recipient.fallbackUsed && (
          <span
            className="
              mt-2
              inline-flex
              rounded-full
              bg-[#eef5ff]
              px-2.5
              py-1
              text-[10px]
              font-bold
              text-[#174ea6]
            "
          >
            SMS fallback used
          </span>
        )}
      </td>

      <td className="px-4 py-5">
        <OverallStatusBadge
          status={
            recipient
              .overallStatus
          }
        />
      </td>

      <td className="px-4 py-5">
        <ChannelStatusBadge
          channel={
            recipient
              .channels
              .SMS
          }
        />
      </td>

      <td className="px-4 py-5">
        <ChannelStatusBadge
          channel={
            recipient
              .channels
              .WHATSAPP
          }
        />
      </td>

      <td className="px-4 py-5">
        <ChannelStatusBadge
          channel={
            recipient
              .channels
              .AI_VOICE
          }
        />
      </td>

      <td className="px-4 py-5">
        <ChannelStatusBadge
          channel={
            recipient
              .channels
              .IVR
          }
        />
      </td>

      <td
        className="
          px-6
          py-5
          text-[11px]
          text-[#727784]
        "
      >
        {recipient
          .lastActivityAt
          ? formatDateTime(
              recipient
                .lastActivityAt
            )
          : "—"}
      </td>
    </tr>
  );
}

//--------------------------------------------------
// Channel Status Badge
//--------------------------------------------------

function ChannelStatusBadge({
  channel,
}: {
  channel:
    RecipientChannelInsightDTO;
}) {
  const style =
    getChannelStatusStyle(
      channel.status
    );

  return (
    <div>
      <span
        title={
          channel.error ??
          undefined
        }
        className={[
          "inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold",
          style,
        ].join(
          " "
        )}
      >
        {formatStatus(
          channel.status
        )}
      </span>

      {channel.attempts >
        1 && (
        <p
          className="
            mt-1
            text-[10px]
            text-[#8a8f99]
          "
        >
          {channel.attempts} attempts
        </p>
      )}
    </div>
  );
}

//--------------------------------------------------
// Overall Badge
//--------------------------------------------------

function OverallStatusBadge({
  status,
}: {
  status:
    CommunicationRecipientInsightDTO["overallStatus"];
}) {
  const classes =
    status ===
    "REACHED"
      ? "bg-green-50 text-green-700"
      : status ===
        "ACTIVE"
        ? "bg-blue-50 text-blue-700"
        : status ===
          "FAILED"
          ? "bg-red-50 text-red-700"
          : "bg-[#f2f3fc] text-[#5e6470]";

  return (
    <span
      className={[
        "inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold",
        classes,
      ].join(
        " "
      )}
    >
      {status ===
      "REACHED"
        ? "Reached"
        : status ===
          "ACTIVE"
          ? "Active"
          : status ===
            "FAILED"
            ? "Failed"
            : "Pending"}
    </span>
  );
}

//--------------------------------------------------
// Campaign Status
//--------------------------------------------------

function StatusBadge({
  status,
}: {
  status:
    CommunicationCampaignInsightsDTO["campaign"]["status"];
}) {
  const failed =
    status ===
      "FAILED" ||
    status ===
      "CANCELLED";

  const complete =
    status ===
      "COMPLETED";

  return (
    <span
      className={[
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[11px] font-bold",
        failed
          ? "bg-red-50 text-red-700"
          : complete
            ? "bg-green-50 text-green-700"
            : "bg-[#e9f1ff] text-[#174ea6]",
      ].join(
        " "
      )}
    >
      {failed ? (
        <XCircle
          size={15}
        />
      ) : complete ? (
        <CheckCircle2
          size={15}
        />
      ) : (
        <Activity
          size={15}
        />
      )}

      {formatStatus(
        status
      )}
    </span>
  );
}

//--------------------------------------------------
// Channel Icon
//--------------------------------------------------

function ChannelIcon({
  channel,
}: {
  channel:
    CommunicationChannel;
}) {
  switch (
    channel
  ) {
    case "SMS":
      return (
        <MessageSquare
          size={20}
        />
      );

    case "WHATSAPP":
      return (
        <Smartphone
          size={20}
        />
      );

    case "AI_VOICE":
    case "IVR":
      return (
        <PhoneCall
          size={20}
        />
      );
  }
}

//--------------------------------------------------
// Status Style
//--------------------------------------------------

function getChannelStatusStyle(
  status:
    UnifiedChannelStatus
): string {
  switch (
    status
  ) {
    case "DELIVERED":
    case "READ":
    case "ANSWERED":
    case "COMPLETED":
      return "bg-green-50 text-green-700";

    case "PROCESSING":
    case "QUEUED":
    case "SENT":
    case "RINGING":
      return "bg-blue-50 text-blue-700";

    case "FAILED":
    case "BUSY":
    case "NO_ANSWER":
    case "CANCELED":
      return "bg-red-50 text-red-700";

    case "NOT_SELECTED":
      return "bg-transparent text-[#a0a5ae]";

    case "NOT_STARTED":
      return "bg-[#f2f3fc] text-[#727784]";
  }
}

//--------------------------------------------------
// Formatting
//--------------------------------------------------

function formatNumber(
  value:
    number
): string {
  return new Intl.NumberFormat(
    "en-US"
  ).format(
    value
  );
}

function formatStatus(
  value:
    string
): string {
  return value
    .toLowerCase()
    .split(
      "_"
    )
    .map(
      word =>
        word
          .charAt(
            0
          )
          .toUpperCase() +
        word.slice(
          1
        )
    )
    .join(
      " "
    );
}

function formatDateTime(
  value:
    string
): string {
  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    }
  ).format(
    date
  );
}

function formatDuration(
  seconds:
    number |
    null
): string {
  if (
    seconds ===
      null ||
    !Number.isFinite(
      seconds
    )
  ) {
    return "—";
  }

  const normalized =
    Math.max(
      0,
      Math.round(
        seconds
      )
    );

  const minutes =
    Math.floor(
      normalized /
      60
    );

  const remaining =
    normalized %
    60;

  if (
    minutes <=
    0
  ) {
    return `${remaining}s`;
  }

  return `${minutes}m ${remaining}s`;
}
