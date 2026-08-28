import {
  Buffer,
} from "buffer";

import {
  GoogleGenAI,
  Modality,
} from "@google/genai";

import type {
  FunctionDeclaration,
} from "@google/genai";

import {
  AI_CONFIG,
} from "@/config/ai";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  GeminiLiveResilienceService,
} from "./gemini-live-resilience.service";

//--------------------------------------------------
// SDK Session
//--------------------------------------------------

type GeminiLiveSdkSession =
  Awaited<
    ReturnType<
      InstanceType<
        typeof GoogleGenAI
      >["live"]["connect"]
    >
  >;

//--------------------------------------------------
// Gemini Audio Part
//--------------------------------------------------

type GeminiLiveInlineData = {
  data?:
    string;

  mimeType?:
    string;
};

//--------------------------------------------------
// Gemini Model Part
//--------------------------------------------------

type GeminiLivePart = {
  text?:
    string;

  inlineData?:
    GeminiLiveInlineData;
};

//--------------------------------------------------
// Gemini Transcription
//--------------------------------------------------

type GeminiLiveTranscription = {
  text?:
    string;
};

//--------------------------------------------------
// Gemini Server Content
//--------------------------------------------------

type GeminiLiveServerContent = {
  modelTurn?: {
    parts?:
      GeminiLivePart[];
  };

  inputTranscription?:
    GeminiLiveTranscription;

  outputTranscription?:
    GeminiLiveTranscription;

  interrupted?:
    boolean;

  generationComplete?:
    boolean;

  turnComplete?:
    boolean;
};

//--------------------------------------------------
// Function Call
//--------------------------------------------------

export type GeminiLiveSdkFunctionCall = {
  id?:
    string;

  name?:
    string;

  args?:
    Record<
      string,
      unknown
    >;
};

//--------------------------------------------------
// Function Response
//--------------------------------------------------

export type GeminiLiveSdkFunctionResponse = {
  id?:
    string;

  name:
    string;

  response:
    Record<
      string,
      unknown
    >;
};

//--------------------------------------------------
// Tool Call
//--------------------------------------------------

type GeminiLiveServerToolCall = {
  functionCalls?:
    GeminiLiveSdkFunctionCall[];
};

//--------------------------------------------------
// Tool Cancellation
//--------------------------------------------------

type GeminiLiveToolCallCancellation = {
  ids?:
    string[];
};

//--------------------------------------------------
// Session Resumption Update
//--------------------------------------------------

export interface GeminiLiveSessionResumptionUpdate {
  resumable:
    boolean;

  newHandle:
    string |
    null;

  lastConsumedClientMessageIndex:
    string |
    null;
}

//--------------------------------------------------
// GoAway
//--------------------------------------------------

export interface GeminiLiveGoAwayNotice {
  timeLeft:
    string |
    null;
}

//--------------------------------------------------
// Setup Complete
//--------------------------------------------------

type GeminiLiveSetupComplete = {
  sessionId?:
    string;
};

//--------------------------------------------------
// Gemini Server Message
//--------------------------------------------------

type GeminiLiveServerMessage = {
  setupComplete?:
    GeminiLiveSetupComplete;

  serverContent?:
    GeminiLiveServerContent;

  toolCall?:
    GeminiLiveServerToolCall;

  toolCallCancellation?:
    GeminiLiveToolCallCancellation;

  sessionResumptionUpdate?: {
    resumable?:
      boolean;

    newHandle?:
      string;

    lastConsumedClientMessageIndex?:
      string;
  };

  goAway?: {
    timeLeft?:
      string;
  };
};

//--------------------------------------------------
// Callbacks
//--------------------------------------------------

export interface GeminiLiveSessionCallbacks {
  //------------------------------------------------
  // Audio
  //------------------------------------------------

  onAudio?: (
    audio:
      Buffer,

    mimeType:
      string
  ) =>
    void |
    Promise<void>;

  //------------------------------------------------
  // Caller Transcript
  //------------------------------------------------

  onInputTranscript?: (
    text:
      string
  ) =>
    void |
    Promise<void>;

  //------------------------------------------------
  // Assistant Transcript
  //------------------------------------------------

  onOutputTranscript?: (
    text:
      string
  ) =>
    void |
    Promise<void>;

  //------------------------------------------------
  // Barge-In
  //------------------------------------------------

  onInterrupted?: () =>
    void |
    Promise<void>;

  //------------------------------------------------
  // Model Turn Complete
  //------------------------------------------------

  onTurnComplete?: () =>
    void |
    Promise<void>;

  //------------------------------------------------
  // Function Calls
  //------------------------------------------------

  onToolCall?: (
    functionCalls:
      GeminiLiveSdkFunctionCall[]
  ) =>
    void |
    Promise<void>;

  //------------------------------------------------
  // Function Call Cancellation
  //------------------------------------------------

  onToolCallCancellation?: (
    ids:
      string[]
  ) =>
    void |
    Promise<void>;

  //------------------------------------------------
  // Session Resumption
  //------------------------------------------------

  onSessionResumptionUpdate?: (
    update:
      GeminiLiveSessionResumptionUpdate
  ) =>
    void |
    Promise<void>;

  //------------------------------------------------
  // GoAway
  //------------------------------------------------

  onGoAway?: (
    notice:
      GeminiLiveGoAwayNotice
  ) =>
    void |
    Promise<void>;

  //------------------------------------------------
  // Provider Error
  //------------------------------------------------

  onError?: (
    error:
      unknown
  ) =>
    void |
    Promise<void>;

  //------------------------------------------------
  // WebSocket Closed
  //------------------------------------------------

  onClose?: (
    code:
      number,

    reason:
      string
  ) =>
    void |
    Promise<void>;
}

//--------------------------------------------------
// Connect Input
//--------------------------------------------------

export interface GeminiLiveConnectInput {
  callId:
    string;

  systemInstruction?:
    string;

  model?:
    string;

  functionDeclarations?:
    FunctionDeclaration[];

  //------------------------------------------------
  // Explicit Previous Session Handle
  //
  // If omitted we also check the resilience
  // service for the latest safe resumable handle.
  //------------------------------------------------

  resumeHandle?:
    string;

  callbacks?:
    GeminiLiveSessionCallbacks;
}

//--------------------------------------------------
// Gemini Live Session
//--------------------------------------------------

export class GeminiLiveSessionService {
  //------------------------------------------------
  // Identity
  //------------------------------------------------

  private readonly callId:
    string;

  private readonly model:
    string;

  private readonly systemInstruction:
    string;

  private readonly callbacks:
    GeminiLiveSessionCallbacks;

  private readonly functionDeclarations:
    FunctionDeclaration[];

  private readonly requestedResumeHandle:
    string |
    null;

  //------------------------------------------------
  // SDK
  //------------------------------------------------

  private readonly ai:
    InstanceType<
      typeof GoogleGenAI
    >;

  private session:
    GeminiLiveSdkSession |
    null =
      null;

  //------------------------------------------------
  // Connection State
  //------------------------------------------------

  private connected =
    false;

  /*
   * Prevent parallel connect() calls from creating
   * multiple Gemini WebSockets.
   */

  private connectPromise:
    Promise<void> |
    null =
      null;

  /*
   * Each connection attempt receives a generation.
   *
   * close() or a replacement connect invalidates
   * callbacks belonging to the previous generation.
   */

  private connectionGeneration =
    0;

  //------------------------------------------------
  // Constructor
  //------------------------------------------------

  constructor(
    input:
      GeminiLiveConnectInput
  ) {
    const callId =
      input.callId
        .trim();

    if (
      !callId
    ) {
      throw new Error(
        "Call ID is required for Gemini Live session"
      );
    }

    this.callId =
      callId;

    this.systemInstruction =
      input.systemInstruction
        ?.trim() ??
      "";

    this.model =
      input.model
        ?.trim() ||
      process.env
        .GEMINI_LIVE_MODEL
        ?.trim() ||
      "gemini-3.1-flash-live-preview";

    this.callbacks =
      input.callbacks ??
      {};

    this.functionDeclarations =
      input.functionDeclarations
        ? [
            ...input.functionDeclarations,
          ]
        : [];

    const requestedResumeHandle =
      input.resumeHandle
        ?.trim();

    this.requestedResumeHandle =
      requestedResumeHandle ||
      null;

    //----------------------------------------------
    // SDK Client
    //----------------------------------------------

    this.ai =
      new GoogleGenAI({
        apiKey:
          AI_CONFIG
            .geminiApiKey,
      });
  }

  //------------------------------------------------
  // Connect
  //------------------------------------------------

  async connect():
    Promise<void> {
    //----------------------------------------------
    // Already Connected
    //----------------------------------------------

    if (
      this.isConnected()
    ) {
      return;
    }

    //----------------------------------------------
    // Existing Connection Attempt
    //----------------------------------------------

    if (
      this.connectPromise
    ) {
      return this.connectPromise;
    }

    //----------------------------------------------
    // New Connection Generation
    //----------------------------------------------

    const generation =
      ++this.connectionGeneration;

    const promise =
      this.connectInternal(
        generation
      );

    this.connectPromise =
      promise;

    try {
      await promise;
    } finally {
      if (
        this.connectPromise ===
        promise
      ) {
        this.connectPromise =
          null;
      }
    }
  }

  //------------------------------------------------
  // Internal Connect
  //------------------------------------------------

  private async connectInternal(
    generation:
      number
  ): Promise<void> {
    const log =
      createCallLogger(
        this.callId
      );

    //----------------------------------------------
    // Resolve Resume Handle
    //
    // Explicit handle wins.
    //
    // Otherwise use the latest handle for which
    // Gemini explicitly reported resumable=true.
    //----------------------------------------------

    const resumeHandle =
      this.requestedResumeHandle ??
      GeminiLiveResilienceService
        .getResumeHandle(
          this.callId
        );

    let closedBeforeResolve =
      false;

    log.info(
      {
        event:
          "gemini.live.connection_starting",

        model:
          this.model,

        resuming:
          Boolean(
            resumeHandle
          ),

        functionDeclarationCount:
          this
            .functionDeclarations
            .length,

        contextWindowCompression:
          true,

        sessionResumption:
          true,
      },
      "Connecting Gemini Live session"
    );

    try {
      //--------------------------------------------
      // Connect
      //--------------------------------------------

      const sdkSession =
        await this.ai.live.connect({
          model:
            this.model,

          config: {
            //--------------------------------------
            // Native Audio
            //--------------------------------------

            responseModalities: [
              Modality.AUDIO,
            ],

            //--------------------------------------
            // Caller Transcript
            //--------------------------------------

            inputAudioTranscription: {},

            //--------------------------------------
            // Assistant Transcript
            //--------------------------------------

            outputAudioTranscription: {},

            //--------------------------------------
            // M10 4F — Long Session Context
            //
            // Default sliding-window parameters are
            // intentionally used first.
            //--------------------------------------

            contextWindowCompression: {
              slidingWindow: {},
            },

            //--------------------------------------
            // M10 4F — Session Resumption
            //
            // transparent=true asks Gemini to also
            // provide lastConsumedClientMessageIndex.
            //--------------------------------------

            sessionResumption: {
              transparent:
                true,

              ...(resumeHandle
                ? {
                    handle:
                      resumeHandle,
                  }
                : {}),
            },

            //--------------------------------------
            // System Instruction
            //--------------------------------------

            ...(this.systemInstruction
              ? {
                  systemInstruction:
                    this
                      .systemInstruction,
                }
              : {}),

            //--------------------------------------
            // Business Tools
            //--------------------------------------

            ...(this
              .functionDeclarations
              .length >
            0
              ? {
                  tools: [
                    {
                      functionDeclarations:
                        this
                          .functionDeclarations,
                    },
                  ],
                }
              : {}),
          },

          callbacks: {
            //--------------------------------------
            // Socket Open
            //--------------------------------------

            onopen:
              () => {
                if (
                  generation !==
                  this.connectionGeneration
                ) {
                  return;
                }

                log.info(
                  {
                    event:
                      "gemini.live.websocket_opened",

                    resuming:
                      Boolean(
                        resumeHandle
                      ),
                  },
                  "Gemini Live WebSocket opened"
                );
              },

            //--------------------------------------
            // Server Message
            //--------------------------------------

            onmessage:
              message => {
                if (
                  generation !==
                  this.connectionGeneration
                ) {
                  return;
                }

                this.handleServerMessage(
                  message
                );
              },

            //--------------------------------------
            // Provider Error
            //--------------------------------------

            onerror:
              event => {
                if (
                  generation !==
                  this.connectionGeneration
                ) {
                  return;
                }

                const error =
                  normalizeSocketError(
                    event
                  );

                log.error(
                  {
                    event:
                      "gemini.live.websocket_error",

                    error:
                      normalizeError(
                        error
                      ),
                  },
                  "Gemini Live WebSocket error"
                );

                this.dispatchCallback(
                  () =>
                    this.callbacks
                      .onError
                      ?.(
                        error
                      ),
                  "onError"
                );
              },

            //--------------------------------------
            // Socket Close
            //--------------------------------------

            onclose:
              event => {
                if (
                  generation !==
                  this.connectionGeneration
                ) {
                  return;
                }

                closedBeforeResolve =
                  true;

                this.connected =
                  false;

                this.session =
                  null;

                const code =
                  typeof event.code ===
                    "number"
                    ? event.code
                    : 1006;

                const reason =
                  typeof event.reason ===
                    "string"
                    ? event.reason
                    : "";

                log.warn(
                  {
                    event:
                      "gemini.live.websocket_closed",

                    code,

                    reasonLength:
                      reason.length,

                    resilience:
                      GeminiLiveResilienceService
                        .getSnapshot(
                          this.callId
                        ),
                  },
                  "Gemini Live WebSocket closed"
                );

                this.dispatchCallback(
                  () =>
                    this.callbacks
                      .onClose
                      ?.(
                        code,
                        reason
                      ),
                  "onClose"
                );
              },
          },
        });

      //--------------------------------------------
      // Connection Was Superseded While Awaiting
      //--------------------------------------------

      if (
        generation !==
        this.connectionGeneration
      ) {
        try {
          sdkSession.close();
        } catch (
          error
        ) {
          log.debug(
            {
              event:
                "gemini.live.stale_connection_close_failed",

              error:
                normalizeError(
                  error
                ),
            },
            "Failed to close stale Gemini Live connection"
          );
        }

        throw new Error(
          "Gemini Live connection was superseded"
        );
      }

      //--------------------------------------------
      // Provider Closed Before connect() Resolved
      //--------------------------------------------

      if (
        closedBeforeResolve
      ) {
        try {
          sdkSession.close();
        } catch {
          // Best effort only.
        }

        throw new Error(
          "Gemini Live connection closed during initialization"
        );
      }

      //--------------------------------------------
      // Register Active SDK Session
      //--------------------------------------------

      this.session =
        sdkSession;

      this.connected =
        true;

      //--------------------------------------------
      // Register Resilience Connection
      //--------------------------------------------

      GeminiLiveResilienceService
        .beginConnection(
          this.callId
        );

      //--------------------------------------------
      // Ready
      //--------------------------------------------

      log.info(
        {
          event:
            "gemini.live.connected",

          model:
            this.model,

          resumed:
            Boolean(
              resumeHandle
            ),

          contextWindowCompression:
            true,

          sessionResumption:
            true,
        },
        "Gemini Live session connected"
      );
    } catch (
      error
    ) {
      //--------------------------------------------
      // Only Clear Current Generation
      //--------------------------------------------

      if (
        generation ===
        this.connectionGeneration
      ) {
        this.connected =
          false;

        this.session =
          null;
      }

      log.error(
        {
          event:
            "gemini.live.connection_failed",

          model:
            this.model,

          resuming:
            Boolean(
              resumeHandle
            ),

          error:
            normalizeError(
              error
            ),
        },
        "Gemini Live connection failed"
      );

      throw error;
    }
  }

  //------------------------------------------------
  // Send PCM16 Audio
  //------------------------------------------------

  sendPcm16Audio(
    audio:
      Buffer,

    sampleRate:
      number =
        16000
  ): void {
    //----------------------------------------------
    // Validate
    //----------------------------------------------

    if (
      !Buffer.isBuffer(
        audio
      )
    ) {
      throw new TypeError(
        "Gemini Live audio must be a Buffer"
      );
    }

    if (
      audio.length ===
      0
    ) {
      return;
    }

    /*
     * PCM16 must contain complete 16-bit samples.
     */

    if (
      audio.length %
        2 !==
      0
    ) {
      throw new Error(
        "Gemini Live PCM16 audio must contain an even number of bytes"
      );
    }

    if (
      !Number.isFinite(
        sampleRate
      ) ||
      sampleRate <=
        0
    ) {
      throw new Error(
        "Gemini Live audio sample rate must be positive"
      );
    }

    //----------------------------------------------
    // Require Connected Session
    //----------------------------------------------

    const session =
      this.requireSession();

    //----------------------------------------------
    // Send Realtime Audio
    //----------------------------------------------

    session.sendRealtimeInput({
      audio: {
        data:
          audio.toString(
            "base64"
          ),

        mimeType:
          `audio/pcm;rate=${Math.floor(
            sampleRate
          )}`,
      },
    });
  }

  //------------------------------------------------
  // Send Text
  //------------------------------------------------

  sendText(
    text:
      string
  ): void {
    const normalized =
      text.trim();

    if (
      !normalized
    ) {
      return;
    }

    const session =
      this.requireSession();

    //----------------------------------------------
    // Explicit User Turn
    //----------------------------------------------

    session.sendClientContent({
      turns: [
        {
          role:
            "user",

          parts: [
            {
              text:
                normalized,
            },
          ],
        },
      ],

      turnComplete:
        true,
    });
  }

  //------------------------------------------------
  // End Audio Stream
  //------------------------------------------------

  endAudioStream():
    void {
    const session =
      this.requireSession();

    session.sendRealtimeInput({
      audioStreamEnd:
        true,
    });
  }

  //------------------------------------------------
  // Send Function Responses
  //------------------------------------------------

  sendToolResponses(
    responses:
      GeminiLiveSdkFunctionResponse[]
  ): void {
    if (
      responses.length ===
      0
    ) {
      return;
    }

    const session =
      this.requireSession();

    session.sendToolResponse({
      functionResponses:
        responses,
    });

    const log =
      createCallLogger(
        this.callId
      );

    log.info(
      {
        event:
          "gemini.live.tool_responses_sent",

        responseCount:
          responses.length,
      },
      "Gemini Live function responses sent"
    );
  }

  //------------------------------------------------
  // Connected?
  //------------------------------------------------

  isConnected():
    boolean {
    return (
      this.connected &&
      this.session !==
        null
    );
  }

  //------------------------------------------------
  // Close
  //------------------------------------------------

  close():
    void {
    const log =
      createCallLogger(
        this.callId
      );

    /*
     * Invalidate callbacks belonging to the
     * currently active or in-flight generation.
     */

    this.connectionGeneration +=
      1;

    this.connected =
      false;

    const session =
      this.session;

    this.session =
      null;

    if (
      !session
    ) {
      return;
    }

    try {
      session.close();

      log.info(
        {
          event:
            "gemini.live.close_requested",
        },
        "Gemini Live session close requested"
      );
    } catch (
      error
    ) {
      log.warn(
        {
          event:
            "gemini.live.close_failed",

          error:
            normalizeError(
              error
            ),
        },
        "Gemini Live session could not be closed cleanly"
      );
    }
  }

  //------------------------------------------------
  // Require Session
  //------------------------------------------------

  private requireSession():
    GeminiLiveSdkSession {
    if (
      !this.connected ||
      !this.session
    ) {
      throw new Error(
        "Gemini Live session is not connected"
      );
    }

    return this.session;
  }

  //------------------------------------------------
  // Handle Server Message
  //------------------------------------------------

  private handleServerMessage(
    message:
      unknown
  ): void {
    const serverMessage =
      message as
        GeminiLiveServerMessage;

    const log =
      createCallLogger(
        this.callId
      );

    //----------------------------------------------
    // Setup Complete
    //----------------------------------------------

    const setupComplete =
      serverMessage
        .setupComplete;

    if (
      setupComplete
    ) {
      log.info(
        {
          event:
            "gemini.live.setup_complete",

          sessionIdPresent:
            Boolean(
              setupComplete
                .sessionId
            ),
        },
        "Gemini Live setup completed"
      );
    }

    //----------------------------------------------
    // M10 4F — Session Resumption Update
    //
    // Google can temporarily report
    // resumable=false while generating or while a
    // function call is in progress.
    //
    // Only the newest server-approved handle should
    // therefore be considered safe.
    //----------------------------------------------

    const rawResumptionUpdate =
      serverMessage
        .sessionResumptionUpdate;

    if (
      rawResumptionUpdate
    ) {
      const newHandle =
        rawResumptionUpdate
          .newHandle
          ?.trim() ||
        null;

      const consumedIndex =
        rawResumptionUpdate
          .lastConsumedClientMessageIndex
          ?.trim() ||
        null;

      const update:
        GeminiLiveSessionResumptionUpdate =
      {
        resumable:
          rawResumptionUpdate
            .resumable ===
          true,

        newHandle,

        lastConsumedClientMessageIndex:
          consumedIndex,
      };

      //--------------------------------------------
      // Durable Per-Call Resilience State
      //--------------------------------------------

      GeminiLiveResilienceService
        .noteSessionResumptionUpdate(
          this.callId,
          {
            resumable:
              update.resumable,

            newHandle:
              update.newHandle ??
              undefined,

            lastConsumedClientMessageIndex:
              update
                .lastConsumedClientMessageIndex ??
              undefined,
          }
        );

      //--------------------------------------------
      // Upper-Layer Callback
      //--------------------------------------------

      this.dispatchCallback(
        () =>
          this.callbacks
            .onSessionResumptionUpdate
            ?.(
              update
            ),
        "onSessionResumptionUpdate"
      );
    }

    //----------------------------------------------
    // M10 4F — GoAway
    //
    // Provider tells us the current connection will
    // soon be terminated.
    //----------------------------------------------

    const goAway =
      serverMessage
        .goAway;

    if (
      goAway
    ) {
      const timeLeft =
        goAway
          .timeLeft
          ?.trim() ||
        null;

      //--------------------------------------------
      // Resilience State
      //--------------------------------------------

      GeminiLiveResilienceService
        .noteGoAway(
          this.callId,
          timeLeft
        );

      log.warn(
        {
          event:
            "gemini.live.go_away",

          timeLeft,

          resumable:
            Boolean(
              GeminiLiveResilienceService
                .getResumeHandle(
                  this.callId
                )
            ),
        },
        "Gemini Live connection received GoAway"
      );

      //--------------------------------------------
      // Upper-Layer Callback
      //
      // 4F-C will perform actual handover.
      //--------------------------------------------

      this.dispatchCallback(
        () =>
          this.callbacks
            .onGoAway
            ?.({
              timeLeft,
            }),
        "onGoAway"
      );
    }

    //----------------------------------------------
    // Function Calls
    //----------------------------------------------

    const functionCalls =
      serverMessage
        .toolCall
        ?.functionCalls ??
      [];

    if (
      functionCalls.length >
      0
    ) {
      log.info(
        {
          event:
            "gemini.live.tool_call_received",

          functionCallCount:
            functionCalls.length,

          functionNames:
            functionCalls.map(
              functionCall =>
                functionCall
                  .name ??
                "unknown"
            ),
        },
        "Gemini Live requested function execution"
      );

      this.dispatchCallback(
        () =>
          this.callbacks
            .onToolCall
            ?.(
              functionCalls
            ),
        "onToolCall"
      );
    }

    //----------------------------------------------
    // Function Call Cancellation
    //----------------------------------------------

    const cancelledToolCallIds =
      serverMessage
        .toolCallCancellation
        ?.ids ??
      [];

    if (
      cancelledToolCallIds.length >
      0
    ) {
      log.info(
        {
          event:
            "gemini.live.tool_call_cancelled",

          cancellationCount:
            cancelledToolCallIds
              .length,
        },
        "Gemini Live cancelled function calls"
      );

      this.dispatchCallback(
        () =>
          this.callbacks
            .onToolCallCancellation
            ?.(
              cancelledToolCallIds
            ),
        "onToolCallCancellation"
      );
    }

    //----------------------------------------------
    // Server Content
    //----------------------------------------------

    const content =
      serverMessage
        .serverContent;

    if (
      !content
    ) {
      return;
    }

    //----------------------------------------------
    // Native Audio Parts
    //----------------------------------------------

    const parts =
      content
        .modelTurn
        ?.parts ??
      [];

    for (
      const part
      of parts
    ) {
      const inlineData =
        part.inlineData;

      const encodedAudio =
        inlineData
          ?.data
          ?.trim();

      if (
        !encodedAudio
      ) {
        continue;
      }

      let audio:
        Buffer;

      try {
        audio =
          Buffer.from(
            encodedAudio,
            "base64"
          );
      } catch (
        error
      ) {
        log.warn(
          {
            event:
              "gemini.live.invalid_audio_payload",

            error:
              normalizeError(
                error
              ),
          },
          "Gemini Live returned invalid base64 audio"
        );

        continue;
      }

      if (
        audio.length ===
        0
      ) {
        continue;
      }

      const mimeType =
        inlineData
          ?.mimeType
          ?.trim() ||
        "audio/pcm;rate=24000";

      this.dispatchCallback(
        () =>
          this.callbacks
            .onAudio
            ?.(
              audio,
              mimeType
            ),
        "onAudio"
      );
    }

    //----------------------------------------------
    // Caller Transcription
    //----------------------------------------------

    const inputText =
      content
        .inputTranscription
        ?.text
        ?.trim();

    if (
      inputText
    ) {
      this.dispatchCallback(
        () =>
          this.callbacks
            .onInputTranscript
            ?.(
              inputText
            ),
        "onInputTranscript"
      );
    }

    //----------------------------------------------
    // Assistant Transcription
    //----------------------------------------------

    const outputText =
      content
        .outputTranscription
        ?.text
        ?.trim();

    if (
      outputText
    ) {
      this.dispatchCallback(
        () =>
          this.callbacks
            .onOutputTranscript
            ?.(
              outputText
            ),
        "onOutputTranscript"
      );
    }

    //----------------------------------------------
    // Interruption / Barge-In
    //----------------------------------------------

    if (
      content.interrupted ===
      true
    ) {
      this.dispatchCallback(
        () =>
          this.callbacks
            .onInterrupted
            ?.(),
        "onInterrupted"
      );
    }

    //----------------------------------------------
    // Generation Complete
    //
    // This means generation itself has finished.
    // turnComplete remains the conversation-state
    // transition used by our media coordinator.
    //----------------------------------------------

    if (
      content.generationComplete ===
      true
    ) {
      log.debug(
        {
          event:
            "gemini.live.generation_complete",
        },
        "Gemini Live generation completed"
      );
    }

    //----------------------------------------------
    // Turn Complete
    //----------------------------------------------

    if (
      content.turnComplete ===
      true
    ) {
      this.dispatchCallback(
        () =>
          this.callbacks
            .onTurnComplete
            ?.(),
        "onTurnComplete"
      );
    }
  }

  //------------------------------------------------
  // Safe Callback Dispatch
  //
  // Provider message processing must not be broken
  // because a dashboard/database/business callback
  // failed.
  //------------------------------------------------

  private dispatchCallback(
    callback:
      () =>
        void |
        Promise<void>,

    callbackName:
      string
  ): void {
    const log =
      createCallLogger(
        this.callId
      );

    try {
      const result =
        callback();

      void Promise.resolve(
        result
      )
        .catch(
          error => {
            log.error(
              {
                event:
                  "gemini.live.callback_failed",

                callbackName,

                error:
                  normalizeError(
                    error
                  ),
              },
              "Gemini Live callback failed"
            );
          }
        );
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "gemini.live.callback_failed",

          callbackName,

          error:
            normalizeError(
              error
            ),
        },
        "Gemini Live callback failed"
      );
    }
  }
}

//--------------------------------------------------
// Normalize WebSocket Error
//--------------------------------------------------

function normalizeSocketError(
  value:
    unknown
): Error {
  //----------------------------------------------
  // Normal Error
  //----------------------------------------------

  if (
    value instanceof
    Error
  ) {
    return value;
  }

  //----------------------------------------------
  // ErrorEvent-Like Object
  //----------------------------------------------

  if (
    isRecord(
      value
    )
  ) {
    const nestedError =
      value.error;

    if (
      nestedError instanceof
      Error
    ) {
      return nestedError;
    }

    const message =
      typeof value.message ===
        "string"
        ? value.message
            .trim()
        : "";

    if (
      message
    ) {
      return new Error(
        message
      );
    }
  }

  return new Error(
    "Gemini Live WebSocket error"
  );
}

//--------------------------------------------------
// Record Guard
//--------------------------------------------------

function isRecord(
  value:
    unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value
    )
  );
}