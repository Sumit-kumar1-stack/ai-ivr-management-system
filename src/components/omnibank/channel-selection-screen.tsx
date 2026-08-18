"use client";

import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  Loader2,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import type {
  CommunicationPlan,
} from "@/config/communication-plan";

//--------------------------------------------------
// Channel Types
//--------------------------------------------------

type ChannelId =
  | "sms"
  | "whatsapp"
  | "ai-voice"
  | "ivr";

//--------------------------------------------------
// Channel Config
//--------------------------------------------------

const channels =
  [
    {
      id:
        "sms",

      title:
        "SMS Broadcast",

      description:
        "Direct mobile messaging with delivery tracking and consent-aware dispatch.",

      icon:
        MessageSquare,
    },
    {
      id:
        "whatsapp",

      title:
        "WhatsApp Business",

      description:
        "Approved business templates with delivery and read-status tracking.",

      icon:
        Smartphone,
    },
    {
      id:
        "ai-voice",

      title:
        "AI Voice Assistant",

      description:
        "Automated conversational calls using the voice runtime included with your plan.",

      icon:
        AudioLines,
    },
    {
      id:
        "ivr",

      title:
        "IVR Call",

      description:
        "Interactive voice-response journeys using published IVR flows.",

      icon:
        PhoneCall,
    },
  ] satisfies Array<{
    id:
      ChannelId;

    title:
      string;

    description:
      string;

    icon:
      typeof MessageSquare;
  }>;

//--------------------------------------------------
// Props
//--------------------------------------------------

interface ChannelSelectionScreenProps {
  plan:
    CommunicationPlan;
}

//--------------------------------------------------
// Component
//--------------------------------------------------

export default function ChannelSelectionScreen({
  plan,
}: ChannelSelectionScreenProps) {
  const router =
    useRouter();

  const [
    selectedChannels,
    setSelectedChannels,
  ] =
    useState<ChannelId[]>([
      "sms",
      "whatsapp",
    ]);

  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );

  const [
    saveError,
    setSaveError,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    savedMessage,
    setSavedMessage,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const [
    savedCampaignId,
    setSavedCampaignId,
  ] =
    useState<
      string |
      null
    >(
      null
    );

  const demoRecipientCount =
    Math.min(
      42_850,
      plan.limits.dailyRecipients
    );

  //--------------------------------------------------
  // Channel Entitlement
  //--------------------------------------------------

  function isChannelAvailable(
    channelId:
      ChannelId
  ): boolean {
    switch (
      channelId
    ) {
      case "sms":
        return plan.features.sms;

      case "whatsapp":
        return plan.features.whatsapp;

      case "ai-voice":
        return plan.features.aiVoice;

      case "ivr":
        return plan.features.ivr;
    }
  }

  //--------------------------------------------------
  // Toggle
  //--------------------------------------------------

  function toggleChannel(
    channelId:
      ChannelId
  ): void {
    if (
      saving ||
      !isChannelAvailable(
        channelId
      )
    ) {
      return;
    }

    setSaveError(
      null
    );

    setSavedMessage(
      null
    );

    setSavedCampaignId(
      null
    );

    setSelectedChannels(
      current =>
        current.includes(
          channelId
        )
          ? current.filter(
              item =>
                item !==
                channelId
            )
          : [
              ...current,
              channelId,
            ]
    );
  }

  //--------------------------------------------------
  // Save Draft
  //--------------------------------------------------

  async function saveCampaignDraft(
    navigateToSummary:
      boolean
  ): Promise<void> {
    if (
      selectedChannels.length ===
        0 ||
      saving
    ) {
      return;
    }

    //------------------------------------------------
    // Reuse The Draft Created By "Save as Draft"
    //------------------------------------------------

    if (
      savedCampaignId
    ) {
      if (
        navigateToSummary
      ) {
        router.push(
          `/communication/campaigns/new/summary?campaign=${encodeURIComponent(
            savedCampaignId
          )}`
        );
      } else {
        setSavedMessage(
          "Campaign draft is already saved."
        );
      }

      return;
    }

    setSaving(
      true
    );

    setSaveError(
      null
    );

    setSavedMessage(
      null
    );

    try {
      const apiChannels =
        selectedChannels.map(
          channel => {
            switch (
              channel
            ) {
              case "sms":
                return "SMS";

              case "whatsapp":
                return "WHATSAPP";

              case "ai-voice":
                return "AI_VOICE";

              case "ivr":
                return "IVR";
            }
          }
        );

      //------------------------------------------------
      // Demo Audience Boundary
      //
      // The existing flow uses this stand-alone audience
      // snapshot until the team-owned CSV/eKYC selector is
      // connected to this step.
      //------------------------------------------------

      const response =
        await fetch(
          "/api/communication/campaigns",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                name:
                  "Q4 High-Yield Outreach",

                audienceSourceId:
                  "demo-q4-high-net-worth",

                audienceSourceName:
                  "Q4_High_Net_Worth_Individuals.csv",

                recipientCount:
                  demoRecipientCount,

                channels:
                  apiChannels,
              }),
          }
        );

      const payload =
        await response
          .json() as {
            success?:
              boolean;

            data?: {
              id?:
                string;
            };

            message?:
              string;
          };

      if (
        !response.ok ||
        !payload.success ||
        !payload.data?.id
      ) {
        throw new Error(
          payload.message ??
          "Campaign draft could not be saved"
        );
      }

      setSavedCampaignId(
        payload.data.id
      );

      if (
        navigateToSummary
      ) {
        router.push(
          `/communication/campaigns/new/summary?campaign=${encodeURIComponent(
            payload.data.id
          )}`
        );

        return;
      }

      setSavedMessage(
        "Campaign draft saved."
      );
    } catch (
      error
    ) {
      setSaveError(
        error instanceof
          Error
          ? error.message
          : "Campaign draft could not be saved"
      );
    } finally {
      setSaving(
        false
      );
    }
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
      <header
        className="
          border-b
          border-[#c1c6d5]/45
          bg-[#f9f9ff]/95
          px-6
          py-5
          backdrop-blur-xl
          md:px-10
          xl:px-[82px]
        "
      >
        <div
          className="
            mx-auto
            flex
            max-w-[1040px]
            flex-col
            gap-6
            xl:flex-row
            xl:items-center
            xl:justify-between
          "
        >
          <div>
            <h2
              className="
                text-[30px]
                font-semibold
                leading-none
                tracking-[-0.035em]
                text-black
              "
            >
              Launch New Campaign
            </h2>

            <p
              className="
                mt-1
                text-[12px]
                text-[#86868b]
              "
            >
              Step 2 of 3 • Selection Stage
            </p>
          </div>

          <div
            className="
              flex
              items-center
              gap-3
              text-[12px]
              font-semibold
            "
          >
            <StepDone
              label="Data Source"
            />

            <StepLine />

            <StepActive
              number="2"
              label="Channels"
            />

            <StepLine />

            <StepPending
              number="3"
              label="Summary"
            />
          </div>
        </div>
      </header>

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
        <section
          className="
            flex
            flex-col
            gap-5
            lg:flex-row
            lg:items-end
            lg:justify-between
          "
        >
          <div>
            <h1
              className="
                text-[31px]
                font-semibold
                tracking-[-0.035em]
                text-black
              "
            >
              Select Outreach Channels
            </h1>

            <p
              className="
                mt-2
                max-w-[690px]
                text-[16px]
                leading-6
                text-[#414753]
              "
            >
              Choose the channels for this campaign. Plan-only
              capabilities are derived by the server and cannot be
              enabled by changing client-side state.
            </p>
          </div>

          <div
            className="
              rounded-2xl
              border
              border-[#d7e3ff]
              bg-[#eef5ff]
              px-5
              py-4
            "
          >
            <p
              className="
                text-[10px]
                font-bold
                uppercase
                tracking-[0.13em]
                text-[#0066cc]
              "
            >
              Current Plan
            </p>

            <p
              className="
                mt-1
                text-[15px]
                font-bold
                text-[#174ea6]
              "
            >
              {plan.label}
            </p>

            <p
              className="
                mt-1
                text-[11px]
                text-[#5f6368]
              "
            >
              {plan.voice.displayName}
            </p>
          </div>
        </section>

        <section
          className="
            mt-10
            grid
            grid-cols-1
            gap-6
            sm:grid-cols-2
            xl:grid-cols-4
          "
        >
          {channels.map(
            channel => {
              const Icon =
                channel.icon;

              const available =
                isChannelAvailable(
                  channel.id
                );

              const active =
                selectedChannels.includes(
                  channel.id
                );

              return (
                <button
                  key={
                    channel.id
                  }
                  type="button"
                  disabled={
                    !available ||
                    saving
                  }
                  onClick={
                    () =>
                      toggleChannel(
                        channel.id
                      )
                  }
                  className={[
                    "relative min-h-[270px] rounded-[18px] border bg-white p-6 text-left",
                    "transition-all duration-200",
                    available
                      ? "hover:-translate-y-[2px] hover:shadow-[0_18px_40px_rgba(0,0,0,0.05)]"
                      : "cursor-not-allowed opacity-50",
                    active
                      ? "border-2 border-[#0066cc]"
                      : "border-[#c1c6d5]",
                  ].join(
                    " "
                  )}
                >
                  <span
                    className={[
                      "absolute right-5 top-5 flex h-5 w-5 items-center justify-center rounded-full",
                      active
                        ? "bg-[#0066cc] text-white"
                        : "border-2 border-[#c1c6d5] bg-white",
                    ].join(
                      " "
                    )}
                  >
                    {active && (
                      <Check
                        size={13}
                        strokeWidth={3}
                      />
                    )}
                  </span>

                  <div
                    className="
                      flex
                      h-[50px]
                      w-[50px]
                      items-center
                      justify-center
                      rounded-xl
                      bg-[#f0f1fa]
                      text-[#005cba]
                    "
                  >
                    <Icon
                      size={27}
                    />
                  </div>

                  <h3
                    className="
                      mt-7
                      text-[20px]
                      font-bold
                      tracking-[-0.025em]
                      text-black
                    "
                  >
                    {channel.title}
                  </h3>

                  <p
                    className="
                      mt-2
                      text-[13px]
                      leading-[21px]
                      text-[#414753]
                    "
                  >
                    {channel.description}
                  </p>

                  {!available && (
                    <p
                      className="
                        mt-4
                        text-[11px]
                        font-bold
                        text-[#b3261e]
                      "
                    >
                      Not included in this plan
                    </p>
                  )}

                  {channel.id ===
                    "ai-voice" &&
                    available && (
                    <p
                      className="
                        mt-4
                        text-[11px]
                        font-semibold
                        text-[#0066cc]
                      "
                    >
                      {plan.voice.runtime ===
                      "GEMINI_LIVE"
                        ? "Gemini Live native audio"
                        : "Cascaded STT → AI → TTS"}
                    </p>
                  )}
                </button>
              );
            }
          )}
        </section>

        <section
          className="
            mt-12
            grid
            gap-6
            lg:grid-cols-[1.4fr_1fr]
          "
        >
          <div
            className="
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
                gap-3
              "
            >
              <div
                className="
                  flex
                  h-11
                  w-11
                  items-center
                  justify-center
                  rounded-xl
                  bg-[#e8f0fe]
                  text-[#0066cc]
                "
              >
                {plan.features.smartChanneling
                  ? (
                    <Zap
                      size={22}
                    />
                  )
                  : (
                    <Sparkles
                      size={22}
                    />
                  )}
              </div>

              <div>
                <p
                  className="
                    text-[10px]
                    font-bold
                    uppercase
                    tracking-[0.13em]
                    text-[#777c86]
                  "
                >
                  Routing Policy
                </p>

                <h3
                  className="
                    mt-1
                    text-[20px]
                    font-bold
                    text-[#191c22]
                  "
                >
                  {plan.features.smartChanneling
                    ? "Smart Channeling enabled"
                    : "Operator-selected routing"}
                </h3>
              </div>
            </div>

            <p
              className="
                mt-5
                text-[13px]
                leading-6
                text-[#5f6368]
              "
            >
              {plan.features.smartChanneling
                ? "Premium campaigns can use automatic channel optimization. When WhatsApp and SMS are selected together, the server can also reserve SMS as the WhatsApp fallback route."
                : "Standard campaigns use exactly the channels selected by the operator. Smart Channeling and automatic WhatsApp-to-SMS fallback remain disabled server-side."}
            </p>

            <div
              className="
                mt-6
                grid
                gap-3
                sm:grid-cols-2
              "
            >
              <Capability
                label="Smart Channeling"
                enabled={
                  plan.features.smartChanneling
                }
              />

              <Capability
                label="WA → SMS Fallback"
                enabled={
                  plan.features.omnichannelFallback
                }
              />

              <Capability
                label="Human Transfer"
                enabled={
                  plan.features.humanTransfer
                }
              />

              <Capability
                label="Advanced Analytics"
                enabled={
                  plan.features.advancedAnalytics
                }
              />
            </div>
          </div>

          <div
            className="
              rounded-[24px]
              bg-[#0b70d1]
              p-7
              text-white
              md:p-9
            "
          >
            <div
              className="
                flex
                items-center
                gap-3
              "
            >
              <ShieldCheck
                size={23}
              />

              <h3
                className="
                  text-[19px]
                  font-bold
                "
              >
                Plan Capacity
              </h3>
            </div>

            <div
              className="
                mt-7
                space-y-5
              "
            >
              <CapacityRow
                label="Concurrent campaigns"
                value={
                  formatNumber(
                    plan.limits.campaignConcurrency
                  )
                }
              />

              <CapacityRow
                label="Daily recipients"
                value={
                  formatNumber(
                    plan.limits.dailyRecipients
                  )
                }
              />

              <CapacityRow
                label="Selected channels"
                value={
                  formatNumber(
                    selectedChannels.length
                  )
                }
              />

              <CapacityRow
                label="Voice runtime"
                value={
                  plan.voice.runtime ===
                  "GEMINI_LIVE"
                    ? "Live"
                    : "Cascaded"
                }
              />
            </div>
          </div>
        </section>

        {saveError && (
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
              text-red-700
            "
          >
            {saveError}
          </div>
        )}

        {savedMessage && (
          <div
            className="
              mt-6
              rounded-xl
              border
              border-green-200
              bg-green-50
              px-5
              py-4
              text-[13px]
              text-green-700
            "
          >
            {savedMessage}
          </div>
        )}
      </main>

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
            gap-4
          "
        >
          <button
            type="button"
            disabled={
              saving
            }
            onClick={
              () =>
                router.back()
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
              disabled:opacity-50
            "
          >
            <ArrowLeft
              size={18}
            />

            Back
          </button>

          <div
            className="
              flex
              items-center
              gap-3
            "
          >
            <button
              type="button"
              disabled={
                saving ||
                selectedChannels.length ===
                  0
              }
              onClick={
                () =>
                  void saveCampaignDraft(
                    false
                  )
              }
              className="
                hidden
                rounded-full
                px-5
                py-3
                text-[14px]
                font-bold
                text-[#004e9f]
                transition
                hover:bg-[#d7e3ff]
                disabled:cursor-not-allowed
                disabled:opacity-40
                sm:block
              "
            >
              Save as Draft
            </button>

            <button
              type="button"
              disabled={
                saving ||
                selectedChannels.length ===
                  0
              }
              onClick={
                () =>
                  void saveCampaignDraft(
                    true
                  )
              }
              className="
                flex
                min-w-[200px]
                items-center
                justify-center
                gap-3
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
                disabled:opacity-40
              "
            >
              {saving
                ? (
                  <>
                    <Loader2
                      className="animate-spin"
                      size={18}
                    />

                    Saving...
                  </>
                )
                : (
                  <>
                    Continue

                    <ArrowRight
                      size={19}
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
// Capability
//--------------------------------------------------

function Capability({
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
// Capacity Row
//--------------------------------------------------

function CapacityRow({
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
        gap-5
        border-b
        border-white/15
        pb-4
        last:border-b-0
        last:pb-0
      "
    >
      <span
        className="
          text-[12px]
          text-white/75
        "
      >
        {label}
      </span>

      <strong
        className="
          text-[14px]
        "
      >
        {value}
      </strong>
    </div>
  );
}

//--------------------------------------------------
// Steps
//--------------------------------------------------

function StepDone({
  label,
}: {
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
        <Check
          size={17}
        />
      </div>

      <span
        className="hidden sm:inline"
      >
        {label}
      </span>
    </div>
  );
}

function StepActive({
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
          bg-[#004e9f]
          font-bold
          text-white
          ring-4
          ring-[#d7e3ff]
        "
      >
        {number}
      </div>

      <span>
        {label}
      </span>
    </div>
  );
}

function StepPending({
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
        opacity-35
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
          border
          border-[#c1c6d5]
          bg-[#f2f3fc]
        "
      >
        {number}
      </div>

      <span
        className="hidden sm:inline"
      >
        {label}
      </span>
    </div>
  );
}

function StepLine() {
  return (
    <div
      className="
        h-[2px]
        w-8
        bg-[#c1c6d5]
      "
    />
  );
}

//--------------------------------------------------
// Format
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