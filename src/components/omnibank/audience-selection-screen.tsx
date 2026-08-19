"use client";

import {
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  Upload,
  UserRoundPlus,
} from "lucide-react";

import Papa from "papaparse";

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import type {
  CommunicationPlan,
} from "@/config/communication-plan";

import type {
  CommunicationCampaignDTO,
} from "@/types/communication-campaign";

//--------------------------------------------------
// Types
//--------------------------------------------------

type AudienceMode =
  | "manual"
  | "csv";

interface RecipientDraft {
  externalRecipientId?:
    string;

  fullName?:
    string;

  phone:
    string;

  language:
    string;
}

interface CampaignApiResponse {
  success:
    boolean;

  data?:
    CommunicationCampaignDTO;

  message?:
    string;
}

interface RecipientApiItem {
  id:
    string;

  externalRecipientId:
    string | null;

  fullName:
    string | null;

  phone:
    string;

  language:
    string;
}

interface RecipientListApiResponse {
  success:
    boolean;

  data?: {
    recipients:
      RecipientApiItem[];

    total:
      number;
  };

  message?:
    string;
}

interface RecipientWriteApiResponse {
  success:
    boolean;

  data?: {
    inserted:
      number;

    duplicates:
      number;

    total:
      number;
  };

  message?:
    string;
}

//--------------------------------------------------
// Constants
//--------------------------------------------------

const MAX_FILE_SIZE =
  5 * 1024 * 1024;

const RECIPIENT_BATCH_SIZE =
  1000;

const DEFAULT_LANGUAGE =
  "English";

//--------------------------------------------------
// Props
//--------------------------------------------------

interface AudienceSelectionScreenProps {
  plan:
    CommunicationPlan;
}

//--------------------------------------------------
// Component
//--------------------------------------------------

export default function AudienceSelectionScreen({
  plan,
}: AudienceSelectionScreenProps) {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const campaignId =
    searchParams.get(
      "campaign"
    );

  const fileInputRef =
    useRef<HTMLInputElement>(
      null
    );

  const [
    mode,
    setMode,
  ] =
    useState<AudienceMode>(
      "manual"
    );

  const [
    campaignName,
    setCampaignName,
  ] =
    useState(
      "Lead Demo Outreach"
    );

  const [
    sourceName,
    setSourceName,
  ] =
    useState(
      "Manual recipient entry"
    );

  const [
    recipients,
    setRecipients,
  ] =
    useState<RecipientDraft[]>([
      {
        fullName:
          "",

        phone:
          "",

        language:
          DEFAULT_LANGUAGE,
      },
    ]);

  const [
    selectedFileName,
    setSelectedFileName,
  ] =
    useState<string | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      Boolean(
        campaignId
      )
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    statusMessage,
    setStatusMessage,
  ] =
    useState<string | null>(
      null
    );

  //--------------------------------------------------
  // Existing Draft
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

      async function loadDraft():
        Promise<void> {
        try {
          const [
            campaignResponse,
            recipientsResponse,
          ] =
            await Promise.all([
              fetch(
                `/api/communication/campaigns/${encodeURIComponent(
                  campaignId ??
                    ""
                )}`,
                {
                  cache:
                    "no-store",
                }
              ),

              fetch(
                `/api/communication/campaigns/${encodeURIComponent(
                  campaignId ??
                    ""
                )}/recipients`,
                {
                  cache:
                    "no-store",
                }
              ),
            ]);

          const campaignPayload =
            await campaignResponse
              .json() as
              CampaignApiResponse;

          const recipientsPayload =
            await recipientsResponse
              .json() as
              RecipientListApiResponse;

          if (
            !campaignResponse.ok ||
            !campaignPayload.success ||
            !campaignPayload.data
          ) {
            throw new Error(
              campaignPayload.message ??
              "Communication campaign could not be loaded"
            );
          }

          if (
            !recipientsResponse.ok ||
            !recipientsPayload.success ||
            !recipientsPayload.data
          ) {
            throw new Error(
              recipientsPayload.message ??
              "Campaign recipients could not be loaded"
            );
          }

          if (
            !active
          ) {
            return;
          }

          setCampaignName(
            campaignPayload
              .data
              .name
          );

          setSourceName(
            campaignPayload
              .data
              .audienceSourceName
          );

          const existingRecipients =
            recipientsPayload
              .data
              .recipients
              .map(
                recipient => ({
                  externalRecipientId:
                    recipient
                      .externalRecipientId ??
                    undefined,

                  fullName:
                    recipient
                      .fullName ??
                    "",

                  phone:
                    recipient.phone,

                  language:
                    recipient.language,
                })
              );

          if (
            existingRecipients.length >
            0
          ) {
            setRecipients(
              existingRecipients
            );
          }

          setMode(
            campaignPayload
              .data
              .audienceSourceName
              .toLowerCase()
              .endsWith(
                ".csv"
              )
              ? "csv"
              : "manual"
          );

          if (
            campaignPayload
              .data
              .audienceSourceName
              .toLowerCase()
              .endsWith(
                ".csv"
              )
          ) {
            setSelectedFileName(
              campaignPayload
                .data
                .audienceSourceName
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
                : "Campaign audience could not be loaded"
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

      void loadDraft();

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
  // Recipient Count
  //--------------------------------------------------

  const validRecipientCount =
    useMemo(
      () =>
        recipients.filter(
          recipient =>
            recipient.phone
              .trim()
              .length >=
            8
        ).length,
      [
        recipients,
      ]
    );

  //--------------------------------------------------
  // Manual Recipient Helpers
  //--------------------------------------------------

  function updateRecipient(
    index:
      number,

    field:
      "fullName" |
      "phone" |
      "language",

    value:
      string
  ): void {
    setError(
      null
    );

    setStatusMessage(
      null
    );

    setRecipients(
      current =>
        current.map(
          (
            recipient,
            recipientIndex
          ) =>
            recipientIndex ===
            index
              ? {
                  ...recipient,
                  [field]:
                    value,
                }
              : recipient
        )
    );
  }

  function addRecipient():
    void {
    setRecipients(
      current => [
        ...current,
        {
          fullName:
            "",

          phone:
            "",

          language:
            DEFAULT_LANGUAGE,
        },
      ]
    );
  }

  function removeRecipient(
    index:
      number
  ): void {
    setRecipients(
      current => {
        const next =
          current.filter(
            (
              _,
              recipientIndex
            ) =>
              recipientIndex !==
              index
          );

        return next.length >
          0
          ? next
          : [
              {
                fullName:
                  "",

                phone:
                  "",

                language:
                  DEFAULT_LANGUAGE,
              },
            ];
      }
    );
  }

  //--------------------------------------------------
  // CSV
  //--------------------------------------------------

  function handleCsvFile(
    event:
      ChangeEvent<HTMLInputElement>
  ): void {
    const file =
      event.target.files?.[0];

    setError(
      null
    );

    setStatusMessage(
      null
    );

    if (
      !file
    ) {
      return;
    }

    const isCsv =
      file.type ===
        "text/csv" ||
      file.name
        .toLowerCase()
        .endsWith(
          ".csv"
        );

    if (
      !isCsv
    ) {
      setError(
        "Please choose a CSV file."
      );

      event.target.value =
        "";

      return;
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      setError(
        "CSV file must be 5 MB or smaller for this upload flow."
      );

      event.target.value =
        "";

      return;
    }

    Papa.parse<
      Record<
        string,
        string
      >
    >(
      file,
      {
        header:
          true,

        skipEmptyLines:
          "greedy",

        transformHeader:
          header =>
            header.trim(),

        complete:
          result => {
            if (
              result.errors.length >
              0
            ) {
              setError(
                result.errors[0]
                  ?.message ??
                "CSV could not be parsed."
              );

              return;
            }

            const parsedRecipients =
              result.data
                .map(
                  (
                    row,
                    index
                  ) =>
                    mapCsvRowToRecipient(
                      row,
                      index
                    )
                )
                .filter(
                  (
                    recipient
                  ): recipient is RecipientDraft =>
                    recipient !==
                    null
                );

            if (
              parsedRecipients.length ===
              0
            ) {
              setError(
                "No valid recipients were found. Include a Phone column in the CSV."
              );

              return;
            }

            if (
              parsedRecipients.length >
              plan.limits.dailyRecipients
            ) {
              setError(
                `${plan.label} allows ${plan.limits.dailyRecipients.toLocaleString(
                  "en-US"
                )} recipients in the daily allowance. This file contains ${parsedRecipients.length.toLocaleString(
                  "en-US"
                )}.`
              );

              return;
            }

            setMode(
              "csv"
            );

            setSelectedFileName(
              file.name
            );

            setSourceName(
              file.name
            );

            setRecipients(
              parsedRecipients
            );

            setStatusMessage(
              `${parsedRecipients.length.toLocaleString(
                "en-US"
              )} recipient${parsedRecipients.length === 1 ? "" : "s"} loaded from ${file.name}.`
            );
          },

        error:
          parseError => {
            setError(
              parseError.message ??
              "CSV could not be read."
            );
          },
      }
    );
  }

  //--------------------------------------------------
  // Save Audience
  //--------------------------------------------------

  async function saveAudience():
    Promise<void> {
    if (
      saving ||
      loading
    ) {
      return;
    }

    const normalizedCampaignName =
      campaignName.trim();

    const normalizedRecipients =
      recipients
        .map(
          recipient => ({
            externalRecipientId:
              recipient
                .externalRecipientId
                ?.trim() ||
              undefined,

            fullName:
              recipient
                .fullName
                ?.trim() ||
              undefined,

            phone:
              recipient
                .phone
                .trim(),

            language:
              recipient
                .language
                .trim() ||
              DEFAULT_LANGUAGE,
          })
        )
        .filter(
          recipient =>
            recipient.phone
              .length >
            0
        );

    const resolvedAudienceSourceName =
      mode ===
      "csv"
        ? selectedFileName ??
          sourceName
        : "Manual recipient entry";

    const resolvedAudienceSourceId =
      (mode ===
      "csv"
        ? `csv:${resolvedAudienceSourceName}`
        : "manual")
        .slice(
          0,
          200
        );

    if (
      normalizedCampaignName.length <
      3
    ) {
      setError(
        "Campaign name must contain at least 3 characters."
      );

      return;
    }

    if (
      normalizedRecipients.length ===
      0
    ) {
      setError(
        "Add at least one recipient before continuing."
      );

      return;
    }

    if (
      normalizedRecipients.some(
        recipient =>
          recipient.phone.length <
          8
      )
    ) {
      setError(
        "Every recipient must have a valid phone number. Use international format such as +91XXXXXXXXXX."
      );

      return;
    }

    if (
      normalizedRecipients.length >
      plan.limits.dailyRecipients
    ) {
      setError(
        `${plan.label} allows a maximum of ${plan.limits.dailyRecipients.toLocaleString(
          "en-US"
        )} recipients in the daily allowance.`
      );

      return;
    }

    setSaving(
      true
    );

    setError(
      null
    );

    setStatusMessage(
      null
    );

    try {
      let resolvedCampaignId =
        campaignId;

      //------------------------------------------------
      // Create Incomplete Draft At Step 1
      //------------------------------------------------

      if (
        !resolvedCampaignId
      ) {
        const createResponse =
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
                    normalizedCampaignName,

                  audienceSourceId:
                    resolvedAudienceSourceId,

                  audienceSourceName:
                    resolvedAudienceSourceName,

                  recipientCount:
                    0,

                  channels:
                    [],
                }),
            }
          );

        const createPayload =
          await createResponse
            .json() as
            CampaignApiResponse;

        if (
          !createResponse.ok ||
          !createPayload.success ||
          !createPayload.data
        ) {
          throw new Error(
            createPayload.message ??
            "Communication campaign draft could not be created"
          );
        }

        resolvedCampaignId =
          createPayload
            .data
            .id;
      }

      //------------------------------------------------
      // Replace Existing Snapshot With First Batch
      //------------------------------------------------

      const batches =
        chunkRecipients(
          normalizedRecipients,
          RECIPIENT_BATCH_SIZE
        );

      const firstBatch =
        batches[0];

      if (
        !firstBatch ||
        firstBatch.length ===
        0
      ) {
        throw new Error(
          "At least one recipient is required"
        );
      }

      const replaceResponse =
        await fetch(
          `/api/communication/campaigns/${encodeURIComponent(
            resolvedCampaignId
          )}/recipients`,
          {
            method:
              "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                campaignName:
                  normalizedCampaignName,

                audienceSourceId:
                  resolvedAudienceSourceId,

                audienceSourceName:
                  resolvedAudienceSourceName,

                recipients:
                  firstBatch,
              }),
          }
        );

      const replacePayload =
        await replaceResponse
          .json() as
          RecipientWriteApiResponse;

      if (
        !replaceResponse.ok ||
        !replacePayload.success
      ) {
        throw new Error(
          replacePayload.message ??
          "Recipient snapshot could not be saved"
        );
      }

      //------------------------------------------------
      // Append Remaining Batches
      //------------------------------------------------

      for (
        const batch
        of batches.slice(
          1
        )
      ) {
        const appendResponse =
          await fetch(
            `/api/communication/campaigns/${encodeURIComponent(
              resolvedCampaignId
            )}/recipients`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  recipients:
                    batch,
                }),
            }
          );

        const appendPayload =
          await appendResponse
            .json() as
            RecipientWriteApiResponse;

        if (
          !appendResponse.ok ||
          !appendPayload.success
        ) {
          throw new Error(
            appendPayload.message ??
            "A recipient batch could not be saved"
          );
        }
      }

      router.push(
        `/communication/campaigns/new/channels?campaign=${encodeURIComponent(
          resolvedCampaignId
        )}`
      );
    } catch (
      saveError
    ) {
      setError(
        saveError instanceof
          Error
          ? saveError.message
          : "Campaign audience could not be saved"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  //--------------------------------------------------
  // Loading
  //--------------------------------------------------

  if (
    loading
  ) {
    return (
      <div
        className="flex min-h-[70vh] items-center justify-center gap-3 text-sm text-slate-500"
      >
        <Loader2
          className="animate-spin"
          size={19}
        />

        Loading campaign audience...
      </div>
    );
  }

  //--------------------------------------------------
  // Render
  //--------------------------------------------------

  return (
    <div
      className="min-h-screen bg-[#f9f9ff]"
    >
      <header
        className="border-b border-slate-200/70 bg-[#f9f9ff]/90 px-4 py-5 backdrop-blur-xl md:px-8 xl:px-[82px]"
      >
        <div
          className="mx-auto flex max-w-[1040px] flex-col gap-6 xl:flex-row xl:items-center xl:justify-between"
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
            >
              Campaign Builder
            </p>

            <h1
              className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-900"
            >
              Launch New Campaign
            </h1>

            <p
              className="mt-1 text-sm text-slate-500"
            >
              Step 1 of 3 • Audience & data source
            </p>
          </div>

          <div
            className="flex items-center gap-3 text-xs font-semibold text-slate-700"
          >
            <StepActive
              number="1"
              label="Data Source"
            />

            <StepLine />

            <StepPending
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
        className="mx-auto max-w-[1040px] px-4 pb-36 pt-10 md:px-8 xl:px-0"
      >
        <section
          className="grid gap-6 lg:grid-cols-[1.55fr_0.75fr]"
        >
          <div
            className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm md:p-8"
          >
            <p
              className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
            >
              Campaign identity
            </p>

            <label
              className="mt-5 block text-sm font-semibold text-slate-700"
              htmlFor="communication-campaign-name"
            >
              Campaign name
            </label>

            <input
              id="communication-campaign-name"
              value={
                campaignName
              }
              disabled={
                saving
              }
              onChange={
                event =>
                  setCampaignName(
                    event.target.value
                  )
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
              placeholder="Example: Lead Demo Outreach"
            />
          </div>

          <div
            className="rounded-2xl border border-blue-100 bg-blue-50/70 p-6"
          >
            <p
              className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700"
            >
              {plan.label}
            </p>

            <p
              className="mt-3 text-3xl font-bold text-slate-900"
            >
              {validRecipientCount.toLocaleString(
                "en-US"
              )}
            </p>

            <p
              className="mt-1 text-sm text-slate-600"
            >
              recipient{validRecipientCount === 1 ? "" : "s"} selected
            </p>

            <div
              className="mt-5 border-t border-blue-100 pt-4 text-xs leading-5 text-slate-600"
            >
              Daily plan capacity: {plan.limits.dailyRecipients.toLocaleString(
                "en-US"
              )} recipients.
            </div>
          </div>
        </section>

        <section
          className="mt-7 rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm md:p-8"
        >
          <div
            className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
              >
                Data source
              </p>

              <h2
                className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-900"
              >
                Choose the campaign audience
              </h2>

              <p
                className="mt-2 max-w-2xl text-sm leading-6 text-slate-600"
              >
                Use one verified number for the first live call, or upload a CSV for a larger campaign. Recipient snapshots are persisted before channel selection.
              </p>
            </div>

            <div
              className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
            >
              <ModeButton
                active={
                  mode ===
                  "manual"
                }
                icon={
                  UserRoundPlus
                }
                label="Manual"
                onClick={
                  () => {
                    setMode(
                      "manual"
                    );

                    setSourceName(
                      "Manual recipient entry"
                    );
                  }
                }
              />

              <ModeButton
                active={
                  mode ===
                  "csv"
                }
                icon={
                  FileSpreadsheet
                }
                label="CSV"
                onClick={
                  () =>
                    setMode(
                      "csv"
                    )
                }
              />
            </div>
          </div>

          {mode ===
            "csv" && (
            <div
              className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6"
            >
              <div
                className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p
                    className="font-semibold text-slate-900"
                  >
                    {selectedFileName ??
                      "Upload recipient CSV"}
                  </p>

                  <p
                    className="mt-1 text-sm text-slate-500"
                  >
                    Required column: Phone. Optional: Name, Language, ExternalRecipientId.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={
                    () =>
                      fileInputRef.current
                        ?.click()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 transition-all duration-150 hover:bg-blue-50 disabled:opacity-50"
                >
                  <Upload
                    size={17}
                  />

                  Choose CSV
                </button>
              </div>

              <input
                ref={
                  fileInputRef
                }
                type="file"
                accept=".csv,text/csv"
                disabled={
                  saving
                }
                onChange={
                  handleCsvFile
                }
                className="hidden"
              />
            </div>
          )}

          <div
            className="mt-7 space-y-3"
          >
            {recipients.map(
              (
                recipient,
                index
              ) => (
                <div
                  key={`recipient-${index}`}
                  className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-150 hover:shadow-sm md:grid-cols-[1.15fr_1fr_0.75fr_auto] md:items-end"
                >
                  <label
                    className="block"
                  >
                    <span
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Name
                    </span>

                    <input
                      value={
                        recipient.fullName ??
                        ""
                      }
                      disabled={
                        saving
                      }
                      onChange={
                        event =>
                          updateRecipient(
                            index,
                            "fullName",
                            event.target.value
                          )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-all duration-150 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      placeholder="Recipient name"
                    />
                  </label>

                  <label
                    className="block"
                  >
                    <span
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Phone
                    </span>

                    <input
                      value={
                        recipient.phone
                      }
                      disabled={
                        saving
                      }
                      onChange={
                        event =>
                          updateRecipient(
                            index,
                            "phone",
                            event.target.value
                          )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm outline-none transition-all duration-150 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      placeholder="+91XXXXXXXXXX"
                    />
                  </label>

                  <label
                    className="block"
                  >
                    <span
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Language
                    </span>

                    <input
                      value={
                        recipient.language
                      }
                      disabled={
                        saving
                      }
                      onChange={
                        event =>
                          updateRecipient(
                            index,
                            "language",
                            event.target.value
                          )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition-all duration-150 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      placeholder="English"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={
                      saving
                    }
                    onClick={
                      () =>
                        removeRecipient(
                          index
                        )
                    }
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 text-red-600 transition-all duration-150 hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Remove recipient ${index + 1}`}
                  >
                    <Trash2
                      size={17}
                    />
                  </button>
                </div>
              )
            )}
          </div>

          <button
            type="button"
            disabled={
              saving
            }
            onClick={
              addRecipient
            }
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-blue-700 transition-all duration-150 hover:bg-blue-50 disabled:opacity-50"
          >
            <Plus
              size={17}
            />

            Add recipient
          </button>
        </section>

        {error && (
          <div
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {statusMessage && (
          <div
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700"
          >
            {statusMessage}
          </div>
        )}
      </main>

      <footer
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/40 bg-white/70 px-4 py-5 shadow-sm backdrop-blur-xl md:px-8 lg:left-[262px]"
      >
        <div
          className="mx-auto flex max-w-[1040px] items-center justify-between gap-4"
        >
          <div
            className="hidden text-xs text-slate-500 sm:block"
          >
            Recipient data is snapshotted before launch.
          </div>

          <button
            type="button"
            disabled={
              saving ||
              validRecipientCount ===
                0
            }
            onClick={
              () =>
                void saveAudience()
            }
            className="ml-auto inline-flex min-w-[210px] items-center justify-center gap-3 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? (
                <>
                  <Loader2
                    className="animate-spin"
                    size={18}
                  />

                  Saving audience...
                </>
              )
              : (
                <>
                  Continue to Channels

                  <ArrowRight
                    size={18}
                  />
                </>
              )}
          </button>
        </div>
      </footer>
    </div>
  );
}

//--------------------------------------------------
// Mode Button
//--------------------------------------------------

function ModeButton({
  active,
  icon:
    Icon,
  label,
  onClick,
}: {
  active:
    boolean;

  icon:
    typeof UserRoundPlus;

  label:
    string;

  onClick:
    () =>
      void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150",
        active
          ? "bg-white text-blue-700 shadow-sm"
          : "text-slate-500 hover:text-slate-800",
      ].join(
        " "
      )}
    >
      <Icon
        size={16}
      />

      {label}
    </button>
  );
}

//--------------------------------------------------
// Steps
//--------------------------------------------------

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
      className="flex items-center gap-2"
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#004e9f] font-bold text-white ring-4 ring-blue-100"
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
      className="flex items-center gap-2 opacity-40"
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-slate-50"
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
      className="h-[2px] w-8 bg-slate-300"
    />
  );
}

//--------------------------------------------------
// CSV Mapping
//--------------------------------------------------

function mapCsvRowToRecipient(
  row:
    Record<
      string,
      string
    >,

  index:
    number
): RecipientDraft | null {
  const normalized =
    new Map<
      string,
      string
    >();

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      row
    )
  ) {
    normalized.set(
      normalizeHeader(
        key
      ),
      String(
        value ??
        ""
      ).trim()
    );
  }

  const phone =
    readCsvValue(
      normalized,
      [
        "phone",
        "phonenumber",
        "mobile",
        "mobilenumber",
        "contactnumber",
      ]
    );

  if (
    !phone
  ) {
    return null;
  }

  const fullName =
    readCsvValue(
      normalized,
      [
        "name",
        "fullname",
        "customername",
        "recipientname",
      ]
    );

  const language =
    readCsvValue(
      normalized,
      [
        "language",
        "lang",
      ]
    ) ||
    DEFAULT_LANGUAGE;

  const externalRecipientId =
    readCsvValue(
      normalized,
      [
        "externalrecipientid",
        "recipientid",
        "customerid",
        "id",
      ]
    ) ||
    `csv-row-${index + 2}`;

  return {
    externalRecipientId,
    fullName:
      fullName ||
      undefined,
    phone,
    language,
  };
}

function normalizeHeader(
  value:
    string
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ""
    );
}

function readCsvValue(
  row:
    Map<
      string,
      string
    >,

  keys:
    string[]
): string {
  for (
    const key
    of keys
  ) {
    const value =
      row.get(
        key
      );

    if (
      value
    ) {
      return value;
    }
  }

  return "";
}

//--------------------------------------------------
// Batch
//--------------------------------------------------

function chunkRecipients(
  recipients:
    RecipientDraft[],

  batchSize:
    number
): RecipientDraft[][] {
  const batches:
    RecipientDraft[][] =
      [];

  for (
    let index =
      0;
    index <
    recipients.length;
    index +=
      batchSize
  ) {
    batches.push(
      recipients.slice(
        index,
        index +
          batchSize
      )
    );
  }

  return batches;
}
