"use client";

import {
  CheckCircle2,
  Loader2,
  Network,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

//--------------------------------------------------
// Flow
//--------------------------------------------------

interface PublishedIvrFlow {
  id:
    string;

  name:
    string;

  description:
    string | null;

  version:
    number;
}

//--------------------------------------------------
// API
//--------------------------------------------------

interface FlowListResponse {
  success:
    boolean;

  data?:
    PublishedIvrFlow[];

  message?:
    string;
}

interface BindResponse {
  success:
    boolean;

  data?: {
    ivrFlowId:
      string;

    flow:
      PublishedIvrFlow;
  };

  message?:
    string;
}

//--------------------------------------------------
// Props
//--------------------------------------------------

interface IvrFlowSelectorProps {
  campaignId:
    string;

  currentFlowId:
    string | null;

  disabled?:
    boolean;

  onBound:
    (
      ivrFlowId:
        string
    ) => void;
}

//--------------------------------------------------
// Component
//--------------------------------------------------

export default function IvrFlowSelector({
  campaignId,
  currentFlowId,
  disabled =
    false,
  onBound,
}: IvrFlowSelectorProps) {
  const [
    flows,
    setFlows,
  ] =
    useState<
      PublishedIvrFlow[]
    >(
      []
    );

  const [
    selectedId,
    setSelectedId,
  ] =
    useState(
      currentFlowId ??
      ""
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
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
    useState<
      string | null
    >(
      null
    );

  const [
    saved,
    setSaved,
  ] =
    useState(
      false
    );

  //------------------------------------------------
  // Current Flow
  //------------------------------------------------

  const selectedFlow =
    useMemo(
      () =>
        flows.find(
          flow =>
            flow.id ===
            selectedId
        ) ??
        null,
      [
        flows,
        selectedId,
      ]
    );

  //------------------------------------------------
  // Load Published Flows
  //------------------------------------------------

  useEffect(
    () => {
      let active =
        true;

      async function load():
        Promise<void> {
        try {
          const response =
            await fetch(
              "/api/communication/ivr-flows",
              {
                cache:
                  "no-store",
              }
            );

          const payload =
            await response
              .json() as
              FlowListResponse;

          if (
            !response.ok ||
            !payload.success
          ) {
            throw new Error(
              payload.message ??
              "Published IVR flows could not be loaded"
            );
          }

          if (
            active
          ) {
            setFlows(
              payload.data ??
              []
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
                : "Published IVR flows could not be loaded"
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

      return () => {
        active =
          false;
      };
    },
    []
  );

  //------------------------------------------------
  // Keep Prop Synchronized
  //------------------------------------------------

useEffect(
  () => {
    const nextSelectedId =
      currentFlowId ??
      "";

    const timer =
      window.setTimeout(
        () => {
          setSelectedId(
            nextSelectedId
          );
        },
        0
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  },
  [
    currentFlowId,
  ]
);

  //------------------------------------------------
  // Save
  //------------------------------------------------

  async function save():
    Promise<void> {
    if (
      !selectedId ||
      saving ||
      disabled
    ) {
      return;
    }

    setSaving(
      true
    );

    setError(
      null
    );

    setSaved(
      false
    );

    try {
      const response =
        await fetch(
          `/api/communication/campaigns/${encodeURIComponent(
            campaignId
          )}/ivr-flow`,
          {
            method:
              "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                ivrFlowId:
                  selectedId,
              }),
          }
        );

      const payload =
        await response
          .json() as
          BindResponse;

      if (
        !response.ok ||
        !payload.success ||
        !payload.data
      ) {
        throw new Error(
          payload.message ??
          "IVR flow could not be saved"
        );
      }

      onBound(
        payload
          .data
          .ivrFlowId
      );

      setSaved(
        true
      );
    } catch (
      saveError
    ) {
      setError(
        saveError instanceof
          Error
          ? saveError.message
          : "IVR flow could not be saved"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  //------------------------------------------------
  // Render
  //------------------------------------------------

  return (
    <div
      className="
        mt-6
        rounded-2xl
        border
        border-[#b9d5ff]
        bg-[#f4f8ff]
        p-6
      "
    >
      <div
        className="
          flex
          items-start
          gap-4
        "
      >
        <div
          className="
            flex
            h-11
            w-11
            shrink-0
            items-center
            justify-center
            rounded-xl
            bg-[#dceaff]
            text-[#005cba]
          "
        >
          <Network
            size={23}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h4
            className="
              text-[16px]
              font-bold
              text-black
            "
          >
            Classic IVR Flow
          </h4>

          <p
            className="
              mt-1
              text-[13px]
              leading-5
              text-[#5f6368]
            "
          >
            Select the published keypad journey that
            will be snapshotted when this campaign
            starts.
          </p>
        </div>
      </div>

      {loading ? (
        <div
          className="
            mt-5
            flex
            items-center
            gap-2
            text-[13px]
            text-[#5f6368]
          "
        >
          <Loader2
            size={16}
            className="animate-spin"
          />

          Loading published flows...
        </div>
      ) : flows.length ===
        0 ? (
        <div
          className="
            mt-5
            rounded-xl
            border
            border-amber-200
            bg-amber-50
            px-4
            py-3
            text-[13px]
            text-amber-800
          "
        >
          No valid published IVR flows are currently
          available. Publish a valid DTMF flow before
          launching this campaign.
        </div>
      ) : (
        <>
          <select
            value={
              selectedId
            }
            disabled={
              disabled
            }
            onChange={
              event => {
                setSelectedId(
                  event
                    .target
                    .value
                );

                setSaved(
                  false
                );

                setError(
                  null
                );
              }
            }
            className="
              mt-5
              h-12
              w-full
              rounded-xl
              border
              border-[#c8ccd6]
              bg-white
              px-4
              text-[14px]
              outline-none
              focus:border-[#0066cc]
              focus:ring-2
              focus:ring-[#d7e3ff]
              disabled:cursor-not-allowed
              disabled:bg-[#f2f3f7]
            "
          >
            <option value="">
              Select published IVR flow
            </option>

            {flows.map(
              flow => (
                <option
                  key={
                    flow.id
                  }
                  value={
                    flow.id
                  }
                >
                  {flow.name} — v{flow.version}
                </option>
              )
            )}
          </select>

          {selectedFlow && (
            <div
              className="
                mt-4
                rounded-xl
                bg-white
                p-4
                text-[13px]
                text-[#5f6368]
              "
            >
              <p
                className="
                  font-bold
                  text-black
                "
              >
                {selectedFlow.name}
              </p>

              <p className="mt-1">
                Version {selectedFlow.version}
              </p>

              {selectedFlow.description && (
                <p
                  className="
                    mt-2
                    leading-5
                  "
                >
                  {selectedFlow.description}
                </p>
              )}
            </div>
          )}

          {!disabled && (
            <button
              type="button"
              onClick={
                save
              }
              disabled={
                !selectedId ||
                saving
              }
              className="
                mt-4
                rounded-full
                bg-[#0056ad]
                px-5
                py-2.5
                text-[13px]
                font-bold
                text-white
                transition
                hover:bg-[#004e9f]
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              {saving
                ? "Saving..."
                : "Save IVR Flow"}
            </button>
          )}
        </>
      )}

      {saved && (
        <div
          className="
            mt-4
            flex
            items-center
            gap-2
            text-[13px]
            font-semibold
            text-green-700
          "
        >
          <CheckCircle2
            size={17}
          />

          Published IVR flow selected.
        </div>
      )}

      {error && (
        <div
          className="
            mt-4
            text-[13px]
            text-red-700
          "
        >
          {error}
        </div>
      )}
    </div>
  );
}