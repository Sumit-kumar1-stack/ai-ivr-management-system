"use client";

import {
  ArrowLeft,
  AudioLines,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Gauge,
  Loader2,
  MessageSquare,
  PhoneCall,
  Rocket,
  Smartphone,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import IvrFlowSelector from "@/components/omnibank/ivr-flow-selector";

import {
  getCommunicationPlanForTier,
} from "@/config/communication-plan";

import type {
  CommunicationCampaignDTO,
  CommunicationCampaignStatus,
  CommunicationChannel,
} from "@/types/communication-campaign";

//--------------------------------------------------
// Campaign API Response
//--------------------------------------------------

interface CampaignApiResponse {
  success:
    boolean;

  data?:
    CommunicationCampaignDTO;

  message?:
    string;
}

//--------------------------------------------------
// Launch API Response
//--------------------------------------------------

interface LaunchApiResponse {
  success:
    boolean;

  data?: {
    communicationCampaignId:
      string;

    status:
      CommunicationCampaignStatus;

    scheduled:
      boolean;

    scheduledAt:
      string | null;

    recipientCount:
      number;
  };

  message?:
    string;
}

//--------------------------------------------------
// Channel Metadata
//--------------------------------------------------

const channelMetadata:
  Record<
    CommunicationChannel,
    {
      title:
        string;

      description:
        string;

      icon:
        typeof Smartphone;
    }
  > =
{
  SMS: {
    title:
      "SMS Broadcast",

    description:
      "Direct mobile messaging with delivery tracking.",
      
    icon:
      MessageSquare,
  },

  WHATSAPP: {
    title:
      "WhatsApp Business",

    description:
      "Approved templates, rich messaging and delivery tracking.",

    icon:
      Smartphone,
  },

  AI_VOICE: {
    title:
      "AI Voice Assistant",

    description:
      "Natural AI-powered voice engagement and automated follow-up.",

    icon:
      AudioLines,
  },

  IVR: {
    title:
      "IVR Call",

    description:
      "Interactive voice response journeys using configured IVR flows.",

    icon:
      PhoneCall,
  },
};

//--------------------------------------------------
// Campaign Summary Screen
//--------------------------------------------------

export default function CampaignSummaryScreen() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const campaignId =
    searchParams.get(
      "campaign"
    );

  //------------------------------------------------
  // Campaign
  //------------------------------------------------

  const [
    campaign,
    setCampaign,
  ] =
    useState<
      CommunicationCampaignDTO |
      null
    >(
      null
    );

  //------------------------------------------------
  // Loading
  //------------------------------------------------

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  //------------------------------------------------
  // Error
  //------------------------------------------------

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
  // Scheduling
  //------------------------------------------------

  const [
    savingSchedule,
    setSavingSchedule,
  ] =
    useState(
      false
    );

  const [
    launchImmediately,
    setLaunchImmediately,
  ] =
    useState(
      true
    );

  const [
    scheduledLocal,
    setScheduledLocal,
  ] =
    useState(
      ""
    );

  //------------------------------------------------
  // Launching
  //------------------------------------------------

  const [
    launching,
    setLaunching,
  ] =
    useState(
      false
    );

  //------------------------------------------------
  // Launch Success
  //------------------------------------------------

  const [
    launchMessage,
    setLaunchMessage,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  //--------------------------------------------------
  // Load Campaign
  //--------------------------------------------------

  useEffect(
    () => {
      if (
        !campaignId
      ) {
        return;
      }

      let active =
        true;

      //------------------------------------------------
      // Load
      //------------------------------------------------

      async function load():
        Promise<void> {
        try {
          const response =
            await fetch(
              `/api/communication/campaigns/${encodeURIComponent(
                campaignId ??
                ""
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          const payload =
            await response
              .json() as
              CampaignApiResponse;

          if (
            !response.ok ||
            !payload.success ||
            !payload.data
          ) {
            throw new Error(
              payload.message ??
              "Communication campaign could not be loaded"
            );
          }

          if (
            !active
          ) {
            return;
          }

          //------------------------------------------------
          // Campaign
          //------------------------------------------------

          setCampaign(
            payload.data
          );

          //------------------------------------------------
          // Scheduling Mode
          //------------------------------------------------

          setLaunchImmediately(
            payload
              .data
              .launchImmediately
          );

          //------------------------------------------------
          // Existing Scheduled Time
          //------------------------------------------------

          if (
            payload
              .data
              .scheduledAt
          ) {
            const date =
              new Date(
                payload
                  .data
                  .scheduledAt
              );

            const offset =
              date
                .getTimezoneOffset() *
              60_000;

            const localDate =
              new Date(
                date.getTime() -
                offset
              );

            setScheduledLocal(
              localDate
                .toISOString()
                .slice(
                  0,
                  16
                )
            );
          }
        } catch (
          loadError
        ) {
          if (
            active
          ) {
            setError(
              loadError instanceof
                Error
                ? loadError.message
                : "Communication campaign could not be loaded"
            );
          }
        } finally {
          if (
            active
          ) {
            setLoading(
              false
            );
          }
        }
      }

      void load();

      //------------------------------------------------
      // Cleanup
      //------------------------------------------------

      return () => {
        active =
          false;
      };
    },
    [
      campaignId,
    ]
  );

  //--------------------------------------------------
  // Formatted Recipient Count
  //--------------------------------------------------

  const formattedRecipients =
    useMemo(
      () =>
        new Intl.NumberFormat(
          "en-US"
        ).format(
          campaign
            ?.recipientCount ??
          0
        ),
      [
        campaign
          ?.recipientCount,
      ]
    );

  //--------------------------------------------------
  // Campaign Editable / Launch Allowed
  //--------------------------------------------------

  const campaignEditable =
    campaign?.status ===
      "DRAFT" ||
    campaign?.status ===
      "READY";

  const ivrConfigured =
    !campaign
      ?.channels
      .includes(
        "IVR"
      ) ||
    Boolean(
      campaign
        ?.ivrFlowId
    );

  const launchAllowed =
    campaignEditable &&
    ivrConfigured &&
    Boolean(
      campaign &&
      campaign.recipientCount >
        0 &&
      campaign.channels.length >
        0
    );

  //--------------------------------------------------
  // Stored Plan Snapshot
  //--------------------------------------------------

  const plan =
    campaign
      ? getCommunicationPlanForTier(
          campaign.tier
        )
      : null;

  //--------------------------------------------------
  // Deterministic Wizard Navigation
  //--------------------------------------------------

  function goToChannels():
    void {
    if (
      campaignId
    ) {
      router.push(
        `/communication/campaigns/new/channels?campaign=${encodeURIComponent(
          campaignId
        )}`
      );

      return;
    }

    router.push(
      "/communication/campaigns/new/audience"
    );
  }

  function goToAudience():
    void {
    if (
      campaignId
    ) {
      router.push(
        `/communication/campaigns/new/audience?campaign=${encodeURIComponent(
          campaignId
        )}`
      );

      return;
    }

    router.push(
      "/communication/campaigns/new/audience"
    );
  }

  //--------------------------------------------------
  // Persist Schedule
  //--------------------------------------------------

  async function persistSchedule():
    Promise<CommunicationCampaignDTO> {
    if (
      !campaign
    ) {
      throw new Error(
        "Communication campaign is unavailable."
      );
    }

    //------------------------------------------------
    // Scheduled Campaign Validation
    //------------------------------------------------

    if (
      !launchImmediately
    ) {
      if (
        !scheduledLocal
      ) {
        throw new Error(
          "Choose a date and time for the scheduled campaign."
        );
      }

      const selected =
        new Date(
          scheduledLocal
        );

      if (
        Number.isNaN(
          selected.getTime()
        )
      ) {
        throw new Error(
          "The selected campaign date and time is invalid."
        );
      }

      if (
        selected.getTime() <=
        Date.now()
      ) {
        throw new Error(
          "Scheduled campaign time must be in the future."
        );
      }
    }

    //------------------------------------------------
    // Request Body
    //------------------------------------------------

    const body =
      launchImmediately
        ? {
            launchImmediately:
              true,

            scheduledAt:
              null,
          }
        : {
            launchImmediately:
              false,

            scheduledAt:
              new Date(
                scheduledLocal
              )
                .toISOString(),
          };

    //------------------------------------------------
    // Persist
    //------------------------------------------------

    const response =
      await fetch(
        `/api/communication/campaigns/${encodeURIComponent(
          campaign.id
        )}`,
        {
          method:
            "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              body
            ),
        }
      );

    const payload =
      await response
        .json() as
        CampaignApiResponse;

    if (
      !response.ok ||
      !payload.success ||
      !payload.data
    ) {
      throw new Error(
        payload.message ??
        "Campaign schedule could not be saved"
      );
    }

    //------------------------------------------------
    // Update Local Campaign
    //------------------------------------------------

    setCampaign(
      payload.data
    );

    return payload.data;
  }

  //--------------------------------------------------
  // Manual Save Scheduling
  //--------------------------------------------------

  async function saveSchedule():
    Promise<void> {
    if (
      savingSchedule ||
      launching
    ) {
      return;
    }

    setSavingSchedule(
      true
    );

    setError(
      null
    );

    setLaunchMessage(
      null
    );

    try {
      await persistSchedule();

      setLaunchMessage(
        "Campaign scheduling options saved."
      );
    } catch (
      scheduleError
    ) {
      setError(
        scheduleError instanceof
          Error
          ? scheduleError.message
          : "Campaign schedule could not be saved"
      );
    } finally {
      setSavingSchedule(
        false
      );
    }
  }

  //--------------------------------------------------
  // Launch Campaign
  //--------------------------------------------------

  async function launchCampaign():
    Promise<void> {
    if (
      !campaign ||
      launching ||
      savingSchedule
    ) {
      return;
    }

    //------------------------------------------------
    // IVR Configuration Guard
    //------------------------------------------------

    if (
      campaign.channels.includes(
        "IVR"
      ) &&
      !campaign.ivrFlowId
    ) {
      setError(
        "Select and save a published IVR flow before launching this campaign."
      );

      return;
    }

    //------------------------------------------------
    // State Guard
    //------------------------------------------------

    if (
      !launchAllowed
    ) {
      setError(
        `Campaign cannot be launched while status is ${campaign.status}.`
      );

      return;
    }

    setLaunching(
      true
    );

    setError(
      null
    );

    setLaunchMessage(
      null
    );

    try {
      //------------------------------------------------
      // IMPORTANT:
      //
      // Scheduling must save successfully before
      // provider/queue execution is requested.
      //------------------------------------------------

      const savedCampaign =
        await persistSchedule();

      //------------------------------------------------
      // Launch
      //------------------------------------------------

      const response =
        await fetch(
          `/api/communication/campaigns/${encodeURIComponent(
            savedCampaign.id
          )}/launch`,
          {
            method:
              "POST",
          }
        );

      const payload =
        await response
          .json() as
          LaunchApiResponse;

      if (
        !response.ok ||
        !payload.success ||
        !payload.data
      ) {
        throw new Error(
          payload.message ??
          "Campaign could not be launched"
        );
      }

      //------------------------------------------------
      // Update Status
      //------------------------------------------------

      setCampaign(
        current =>
          current
            ? {
                ...current,

                status:
                  payload
                    .data!
                    .status,

                scheduledAt:
                  payload
                    .data!
                    .scheduledAt,
              }
            : current
      );

      //------------------------------------------------
      // User Feedback
      //------------------------------------------------

      setLaunchMessage(
        payload
          .data
          .scheduled
          ? "Campaign scheduled successfully."
          : "Campaign queued successfully."
      );
    } catch (
      launchError
    ) {
      setError(
        launchError instanceof
          Error
          ? launchError.message
          : "Campaign could not be launched"
      );
    } finally {
      setLaunching(
        false
      );
    }
  }

  //--------------------------------------------------
  // Loading
  //--------------------------------------------------

  if (
    loading &&
    campaignId
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
        <Loader2
          className="
            animate-spin
            text-[#0066cc]
          "
          size={36}
        />
      </div>
    );
  }

  //--------------------------------------------------
  // Missing Campaign
  //--------------------------------------------------

  if (
    !campaign
  ) {
    return (
      <div
        className="
          mx-auto
          max-w-[800px]
          px-8
          py-20
        "
      >
        <div
          className="
            rounded-2xl
            border
            border-red-200
            bg-red-50
            p-7
            text-red-700
          "
        >
          {error ??
            (campaignId
              ? "Campaign could not be loaded."
              : "Communication campaign ID is missing.")}
        </div>
      </div>
    );
  }

  //--------------------------------------------------
  // Render
  //--------------------------------------------------

  return (
    <div
      className="
        min-h-screen
        bg-[#f9f9ff]
      "
    >
      {/* =========================================
          TOP HEADER
      ========================================= */}

      <header
        className="
          border-b
          border-[#c1c6d5]/45
          px-6
          py-5
          md:px-10
          xl:px-[82px]
        "
      >
        <div
          className="
            mx-auto
            flex
            max-w-[1040px]
            items-center
            justify-between
          "
        >
          <div>
            <h1
              className="
                text-[30px]
                font-semibold
                tracking-[-0.035em]
                text-black
              "
            >
              Launch New Campaign
            </h1>

            <p
              className="
                mt-1
                text-[12px]
                text-[#86868b]
              "
            >
              Step 3 of 3 • Final Review
            </p>
          </div>

          {/* =====================================
              DESKTOP STEPS
          ===================================== */}

          <div
            className="
              hidden
              items-center
              gap-3
              text-[12px]
              font-semibold
              md:flex
            "
          >
            <StepDone
              number="1"
              label="Data Source"
            />

            <StepLine />

            <StepDone
              number="2"
              label="Channels"
            />

            <StepLine />

            <div
              className="
                flex
                items-center
                gap-2
              "
            >
              <div
                className="
                  flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-full
                  bg-[#004e9f]
                  text-white
                  ring-4
                  ring-[#d7e3ff]
                "
              >
                3
              </div>

              Summary
            </div>
          </div>
        </div>
      </header>

      {/* =========================================
          CONTENT
      ========================================= */}

      <main
        className="
          mx-auto
          max-w-[1040px]
          px-6
          pb-36
          pt-12
          md:px-10
          xl:px-0
        "
      >
        {/* =====================================
            TITLE
        ===================================== */}

        <section
          className="
            flex
            flex-col
            gap-5
            md:flex-row
            md:items-end
            md:justify-between
          "
        >
          <div>
            <h2
              className="
                text-[34px]
                font-semibold
                tracking-[-0.04em]
                text-black
              "
            >
              Campaign Summary
            </h2>

            <p
              className="
                mt-2
                text-[16px]
                text-[#414753]
              "
            >
              Final review of your{" "}
              <strong>
                &apos;{campaign.name}&apos;
              </strong>{" "}
              campaign.
            </p>
          </div>

          <CampaignStatusBadge
            status={
              campaign.status
            }
          />
        </section>

        {/* =====================================
            AUDIENCE / VELOCITY
        ===================================== */}

        <section
          className="
            mt-10
            grid
            gap-6
            md:grid-cols-2
          "
        >
          {/* Audience */}

          <div
            className="
              rounded-[22px]
              border
              border-[#d9dce8]
              bg-white
              p-7
            "
          >
            <div
              className="flex items-center justify-between gap-4"
            >
              <p
                className="
                  text-[11px]
                  font-bold
                  uppercase
                  tracking-[0.12em]
                  text-[#777c86]
                "
              >
                Selected Audience
              </p>

              {campaignEditable && (
                <button
                  type="button"
                  onClick={
                    () =>
                      goToAudience()
                  }
                  className="text-[12px] font-bold text-[#0066cc] transition hover:text-[#004e9f]"
                >
                  Edit Audience
                </button>
              )}
            </div>

            <h3
              className="
                mt-4
                break-words
                text-[20px]
                font-bold
                tracking-[-0.02em]
                text-black
              "
            >
              {
                campaign
                  .audienceSourceName
              }
            </h3>

            <p
              className="
                mt-2
                text-[14px]
                text-[#5f6368]
              "
            >
              {formattedRecipients} recipient
              {campaign.recipientCount ===
              1
                ? ""
                : "s"}
            </p>
          </div>

          {/* Delivery Tier */}

          <div
            className="
              rounded-[22px]
              border
              border-[#d9dce8]
              bg-white
              p-7
            "
          >
            <p
              className="
                text-[11px]
                font-bold
                uppercase
                tracking-[0.12em]
                text-[#777c86]
              "
            >
              Subscription Plan
            </p>

            <div
              className="
                mt-4
                flex
                items-center
                gap-4
              "
            >
              <div
                className="
                  flex
                  h-12
                  w-12
                  items-center
                  justify-center
                  rounded-xl
                  bg-[#e8f0fe]
                  text-[#0066cc]
                "
              >
                <Gauge
                  size={25}
                />
              </div>

              <div>
                <h3
                  className="
                    text-[20px]
                    font-bold
                    text-black
                  "
                >
                  {plan
                    ?.label ??
                    campaign.tier}
                </h3>

                <p
                  className="
                    mt-1
                    text-[13px]
                    text-[#5f6368]
                  "
                >
                  {plan
                    ?.voice
                    .displayName ??
                    "Communication voice runtime"}
                </p>

                {plan && (
                  <p
                    className="
                      mt-2
                      text-[12px]
                      leading-5
                      text-[#777c86]
                    "
                  >
                    Up to {plan.limits.campaignConcurrency} concurrent campaign
                    {plan.limits.campaignConcurrency === 1 ? "" : "s"} • {new Intl.NumberFormat(
                      "en-US"
                    ).format(
                      plan.limits.dailyRecipients
                    )} recipients/day
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* =====================================
            COMMUNICATION CHANNELS
        ===================================== */}

        <section
          className="
            mt-10
            rounded-[24px]
            border
            border-[#d9dce8]
            bg-white
            p-7
            md:p-9
          "
        >
          <div
            className="
              flex
              items-center
              justify-between
            "
          >
            <h3
              className="
                text-[22px]
                font-bold
                tracking-[-0.025em]
                text-black
              "
            >
              Communication Channels
            </h3>

            {campaignEditable && (
              <button
                type="button"
                onClick={
                  () =>
                    goToChannels()
                }
                className="
                  text-[13px]
                  font-bold
                  text-[#0066cc]
                  transition
                  hover:text-[#004e9f]
                "
              >
                Edit
              </button>
            )}
          </div>

          <div
            className="
              mt-7
              divide-y
              divide-[#e2e4ec]
            "
          >
            {campaign.channels.map(
              channel => {
                const metadata =
                  channelMetadata[
                    channel
                  ];

                const Icon =
                  metadata.icon;

                return (
                  <div
                    key={
                      channel
                    }
                    className="
                      flex
                      items-center
                      gap-5
                      py-5
                      first:pt-0
                      last:pb-0
                    "
                  >
                    <div
                      className="
                        flex
                        h-12
                        w-12
                        shrink-0
                        items-center
                        justify-center
                        rounded-xl
                        bg-[#eff3fb]
                        text-[#0066cc]
                      "
                    >
                      <Icon
                        size={24}
                      />
                    </div>

                    <div
                      className="
                        min-w-0
                        flex-1
                      "
                    >
                      <h4
                        className="
                          text-[16px]
                          font-bold
                          text-black
                        "
                      >
                        {
                          metadata.title
                        }
                      </h4>

                      <p
                        className="
                          mt-1
                          text-[13px]
                          leading-5
                          text-[#5f6368]
                        "
                      >
                        {
                          metadata.description
                        }
                      </p>
                    </div>

                    <CheckCircle2
                      className="
                        shrink-0
                        text-[#188038]
                      "
                      size={22}
                    />
                  </div>
                );
              }
            )}
          </div>

          {/* =====================================
              FALLBACK POLICY
          ===================================== */}

          {campaign.fallbackPolicy ===
          "WHATSAPP_TO_SMS" ? (
            <div
              className="
                mt-7
                rounded-xl
                border
                border-[#b9d5ff]
                bg-[#eef5ff]
                px-5
                py-4
                text-[13px]
                leading-5
                text-[#174ea6]
              "
            >
              <strong>
                OmniChannel fallback enabled.
              </strong>{" "}
              WhatsApp is the primary messaging
              channel and SMS is reserved as the
              fallback route.
            </div>
          ) : (
            <div
              className="
                mt-7
                rounded-xl
                border
                border-[#e0e2e8]
                bg-[#f6f7fb]
                px-5
                py-4
                text-[13px]
                leading-5
                text-[#5f6368]
              "
            >
              {campaign.tier ===
              "STANDARD"
                ? "This Standard campaign uses the channels selected by the operator. Automatic cross-channel fallback is a Premium capability."
                : "Automatic fallback is not active for this channel combination."}
            </div>
          )}

          {plan && (
            <div
              className="
                mt-5
                grid
                gap-3
                sm:grid-cols-2
                xl:grid-cols-4
              "
            >
              <PlanCapability
                label="Smart Channeling"
                enabled={
                  plan.features.smartChanneling
                }
              />

              <PlanCapability
                label="WA → SMS Fallback"
                enabled={
                  plan.features.omnichannelFallback
                }
              />

              <PlanCapability
                label="Human Transfer"
                enabled={
                  plan.features.humanTransfer
                }
              />

              <PlanCapability
                label="Advanced Analytics"
                enabled={
                  plan.features.advancedAnalytics
                }
              />
            </div>
          )}

          {/* =====================================
              IVR FLOW CONFIGURATION
          ===================================== */}

          {campaign.channels.includes(
            "IVR"
          ) && (
            <IvrFlowSelector
              campaignId={
                campaign.id
              }
              currentFlowId={
                campaign.ivrFlowId
              }
              disabled={
                !campaignEditable
              }
              onBound={
                ivrFlowId => {
                  setCampaign(
                    current =>
                      current
                        ? {
                            ...current,

                            ivrFlowId,
                          }
                        : current
                  );

                  setError(
                    null
                  );

                  setLaunchMessage(
                    null
                  );
                }
              }
            />
          )}

          {campaign.channels.includes(
            "IVR"
          ) &&
          campaign.channels.includes(
            "AI_VOICE"
          ) && (
            <div
              className="
                mt-4
                rounded-xl
                border
                border-amber-200
                bg-amber-50
                px-5
                py-4
                text-[13px]
                leading-5
                text-amber-800
              "
            >
              <strong>
                Two voice channels selected.
              </strong>{" "}
              Each eligible recipient can receive one AI
              Voice call and one Classic IVR call.
            </div>
          )}
        </section>

        {/* =====================================
            SCHEDULING
        ===================================== */}

        <section
          className="
            mt-10
            rounded-[24px]
            border
            border-[#d9dce8]
            bg-white
            p-7
            md:p-9
          "
        >
          <div
            className="
              flex
              flex-col
              gap-2
              md:flex-row
              md:items-center
              md:justify-between
            "
          >
            <h3
              className="
                text-[22px]
                font-bold
                tracking-[-0.025em]
                text-black
              "
            >
              Scheduling Options
            </h3>

            {!campaignEditable && (
              <span
                className="
                  text-[12px]
                  font-medium
                  text-[#747982]
                "
              >
                Scheduling locked after launch
              </span>
            )}
          </div>

          <div
            className="
              mt-7
              grid
              gap-5
              md:grid-cols-2
            "
          >
            {/* Launch Now */}

            <button
              type="button"
              disabled={
                !campaignEditable
              }
              onClick={
                () => {
                  if (
                    !campaignEditable
                  ) {
                    return;
                  }

                  setLaunchImmediately(
                    true
                  );

                  setError(
                    null
                  );

                  setLaunchMessage(
                    null
                  );
                }
              }
              className={[
                "rounded-2xl border p-6 text-left transition",
                launchImmediately
                  ? "border-2 border-[#0066cc] bg-[#f4f8ff]"
                  : "border-[#d9dce8] bg-white",
                !campaignEditable
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-[#80b5ea]",
              ].join(
                " "
              )}
            >
              <Clock3
                className="text-[#0066cc]"
                size={25}
              />

              <h4
                className="
                  mt-4
                  text-[16px]
                  font-bold
                  text-black
                "
              >
                Launch Immediately
              </h4>

              <p
                className="
                  mt-1
                  text-[13px]
                  leading-5
                  text-[#666b75]
                "
              >
                Campaign becomes eligible for
                execution immediately after launch.
              </p>
            </button>

            {/* Schedule */}

            <button
              type="button"
              disabled={
                !campaignEditable
              }
              onClick={
                () => {
                  if (
                    !campaignEditable
                  ) {
                    return;
                  }

                  setLaunchImmediately(
                    false
                  );

                  setError(
                    null
                  );

                  setLaunchMessage(
                    null
                  );
                }
              }
              className={[
                "rounded-2xl border p-6 text-left transition",
                !launchImmediately
                  ? "border-2 border-[#0066cc] bg-[#f4f8ff]"
                  : "border-[#d9dce8] bg-white",
                !campaignEditable
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-[#80b5ea]",
              ].join(
                " "
              )}
            >
              <CalendarClock
                className="text-[#0066cc]"
                size={25}
              />

              <h4
                className="
                  mt-4
                  text-[16px]
                  font-bold
                  text-black
                "
              >
                Schedule for Later
              </h4>

              <p
                className="
                  mt-1
                  text-[13px]
                  leading-5
                  text-[#666b75]
                "
              >
                Select a specific local date and time
                for campaign execution.
              </p>
            </button>
          </div>

          {/* =====================================
              DATE/TIME
          ===================================== */}

          {!launchImmediately && (
            <div
              className="
                mt-6
                max-w-[420px]
              "
            >
              <label
                htmlFor="campaign-scheduled-at"
                className="
                  mb-2
                  block
                  text-[12px]
                  font-bold
                  text-[#525760]
                "
              >
                Campaign Date & Time
              </label>

              <input
                id="campaign-scheduled-at"
                type="datetime-local"
                disabled={
                  !campaignEditable
                }
                value={
                  scheduledLocal
                }
                onChange={
                  event => {
                    setScheduledLocal(
                      event
                        .target
                        .value
                    );

                    setError(
                      null
                    );

                    setLaunchMessage(
                      null
                    );
                  }
                }
                className="
                  h-12
                  w-full
                  rounded-xl
                  border
                  border-[#c8ccd6]
                  bg-white
                  px-4
                  text-[14px]
                  outline-none
                  transition
                  focus:border-[#0066cc]
                  focus:ring-2
                  focus:ring-[#d7e3ff]
                  disabled:cursor-not-allowed
                  disabled:bg-[#f2f3f7]
                  disabled:opacity-70
                "
              />
            </div>
          )}

          {/* =====================================
              SAVE
          ===================================== */}

          {campaignEditable && (
            <button
              type="button"
              onClick={
                saveSchedule
              }
              disabled={
                savingSchedule ||
                launching
              }
              className="
                mt-6
                rounded-full
                border
                border-[#0066cc]
                px-6
                py-3
                text-[13px]
                font-bold
                text-[#0066cc]
                transition
                hover:bg-[#eef5ff]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {savingSchedule
                ? "Saving..."
                : "Save Scheduling"}
            </button>
          )}
        </section>

        {/* =====================================
            ERROR
        ===================================== */}

        {error && (
          <div
            className="
              mt-6
              rounded-xl
              border
              border-red-200
              bg-red-50
              px-5
              py-4
              text-[13px]
              leading-5
              text-red-700
            "
          >
            {error}
          </div>
        )}

        {/* =====================================
            SUCCESS
        ===================================== */}

        {launchMessage && (
          <div
            className="
              mt-6
              flex
              items-center
              gap-3
              rounded-xl
              border
              border-green-200
              bg-green-50
              px-5
              py-4
              text-[13px]
              font-medium
              text-green-800
            "
          >
            <CheckCircle2
              size={18}
              className="shrink-0"
            />

            {launchMessage}
          </div>
        )}
      </main>

      {/* =========================================
          FOOTER
      ========================================= */}

      <footer
        className="
          fixed
          bottom-0
          left-0
          right-0
          z-30
          border-t
          border-[#c1c6d5]/40
          bg-[#f9f9ff]/95
          px-6
          py-5
          backdrop-blur-xl
          lg:left-[262px]
        "
      >
        <div
          className="
            mx-auto
            flex
            max-w-[1040px]
            items-center
            justify-between
            gap-5
          "
        >
          {/* Back */}

          <button
            type="button"
            disabled={
              !campaignEditable
            }
            onClick={
              () => {
                if (
                  campaignEditable
                ) {
                  goToChannels();
                }
              }
            }
            className="
              flex
              items-center
              gap-2
              rounded-full
              px-4
              py-3
              text-[14px]
              font-bold
              text-black
              transition
              hover:bg-[#e6e8f1]
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            <ArrowLeft
              size={18}
            />

            Back to Channels
          </button>

          {/* Launch */}

          <div
            className="
              flex
              flex-col
              items-end
              gap-2
            "
          >
            {!campaignEditable && (
              <p
                className="
                  hidden
                  text-[11px]
                  font-medium
                  text-[#727780]
                  md:block
                "
              >
                Campaign status: {campaign.status}
              </p>
            )}

            <button
              type="button"
              onClick={
                launchCampaign
              }
              disabled={
                launching ||
                savingSchedule ||
                !launchAllowed
              }
              className="
                flex
                min-w-[205px]
                items-center
                justify-center
                gap-2
                rounded-full
                bg-[#0056ad]
                px-7
                py-3
                text-[14px]
                font-bold
                text-white
                shadow-sm
                transition
                hover:bg-[#004e9f]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {launching ? (
                <>
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />

                  Launching...
                </>
              ) : (
                <>
                  Launch Campaign

                  <Rocket
                    size={17}
                  />
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

//--------------------------------------------------
// Completed Step
//--------------------------------------------------

function StepDone({
  number,
  label,
}: {
  number:
    string;

  label:
    string;
}) {
  return (
    <div
      className="
        flex
        items-center
        gap-2
      "
    >
      <div
        className="
          flex
          h-9
          w-9
          items-center
          justify-center
          rounded-full
          bg-[#0066cc]
          text-white
        "
      >
        <CheckCircle2
          size={17}
        />
      </div>

      <span>
        {label}
      </span>

      <span className="sr-only">
        Step {number}
      </span>
    </div>
  );
}

//--------------------------------------------------
// Step Connector
//--------------------------------------------------

function StepLine() {
  return (
    <div
      className="
        h-[2px]
        w-8
        bg-[#0066cc]
      "
    />
  );
}

//--------------------------------------------------
// Campaign Status Badge
//--------------------------------------------------

function CampaignStatusBadge({
  status,
}: {
  status:
    CommunicationCampaignStatus;
}) {
  const label =
    getCampaignStatusLabel(
      status
    );

  const active =
    status ===
      "DRAFT" ||
    status ===
      "READY";

  const success =
    status ===
      "COMPLETED";

  const failed =
    status ===
      "FAILED" ||
    status ===
      "CANCELLED";

  return (
    <div
      className={[
        "inline-flex items-center gap-2 self-start rounded-full px-4 py-2",
        "text-[12px] font-bold",
        active
          ? "bg-[#e6f6ec] text-[#137333]"
          : success
            ? "bg-[#e6f6ec] text-[#137333]"
            : failed
              ? "bg-red-50 text-red-700"
              : "bg-[#e8f0fe] text-[#174ea6]",
      ].join(
        " "
      )}
    >
      <CheckCircle2
        size={16}
      />

      {label}
    </div>
  );
}

//--------------------------------------------------
// Campaign Status Label
//--------------------------------------------------
// Plan Capability
//--------------------------------------------------

function PlanCapability({
  label,
  enabled,
}: {
  label:
    string;

  enabled:
    boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl border px-4 py-3",
        enabled
          ? "border-[#b7dfc2] bg-[#f2fbf4]"
          : "border-[#e0e2e8] bg-[#f6f7fb]",
      ].join(
        " "
      )}
    >
      <p
        className="
          text-[11px]
          font-bold
          text-[#414753]
        "
      >
        {label}
      </p>

      <p
        className={[
          "mt-1 text-[11px] font-semibold",
          enabled
            ? "text-[#188038]"
            : "text-[#777c86]",
        ].join(
          " "
        )}
      >
        {enabled
          ? "Included"
          : "Premium only"}
      </p>
    </div>
  );
}

//--------------------------------------------------

function getCampaignStatusLabel(
  status:
    CommunicationCampaignStatus
): string {
  switch (
    status
  ) {
    case "DRAFT":
      return "Ready to Review";

    case "READY":
      return "Ready to Launch";

    case "SCHEDULED":
      return "Scheduled";

    case "QUEUED":
      return "Queued";

    case "RUNNING":
      return "Running";

    case "DISPATCHED":
      return "Dispatched";

    case "COMPLETED":
      return "Completed";

    case "FAILED":
      return "Failed";

    case "CANCELLED":
      return "Cancelled";
  }
}