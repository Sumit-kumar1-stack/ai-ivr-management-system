//--------------------------------------------------
// Approved WhatsApp Templates
//--------------------------------------------------

export type ApprovedWhatsAppTemplateKey =
  | "CALLBACK_CONFIRMATION"
  | "LEAD_FOLLOW_UP"
  | "HUMAN_TRANSFER_UNAVAILABLE";

//--------------------------------------------------
// Variables
//--------------------------------------------------

export interface WhatsAppTemplateVariables {
  customerName?:
    string;

  callbackTime?:
    string;

  businessName?:
    string;
}

//--------------------------------------------------
// Resolved Template
//--------------------------------------------------

export interface ResolvedWhatsAppTemplate {
  name:
    string;

  language:
    string;

  bodyParameters:
    string[];
}

//--------------------------------------------------
// Resolve
//--------------------------------------------------

export function resolveWhatsAppTemplate(
  templateKey:
    ApprovedWhatsAppTemplateKey,

  variables:
    WhatsAppTemplateVariables
): ResolvedWhatsAppTemplate {
  const customerName =
    clean(
      variables.customerName
    );

  const callbackTime =
    clean(
      variables.callbackTime
    );

  const businessName =
    clean(
      variables.businessName
    ) ||
    "our team";

  switch (
    templateKey
  ) {
    case "CALLBACK_CONFIRMATION": {
      if (
        !callbackTime
      ) {
        throw new Error(
          "callbackTime is required"
        );
      }

      return {
        name:
          getTemplateName(
            "META_WA_TEMPLATE_CALLBACK_CONFIRMATION",
            "callback_confirmation"
          ),

        language:
          getTemplateLanguage(),

        bodyParameters: [
          customerName ||
            "Customer",

          callbackTime,

          businessName,
        ],
      };
    }

    case "LEAD_FOLLOW_UP": {
      return {
        name:
          getTemplateName(
            "META_WA_TEMPLATE_LEAD_FOLLOW_UP",
            "lead_follow_up"
          ),

        language:
          getTemplateLanguage(),

        bodyParameters: [
          customerName ||
            "Customer",

          businessName,
        ],
      };
    }

    case "HUMAN_TRANSFER_UNAVAILABLE": {
      return {
        name:
          getTemplateName(
            "META_WA_TEMPLATE_HUMAN_TRANSFER_UNAVAILABLE",
            "human_transfer_unavailable"
          ),

        language:
          getTemplateLanguage(),

        bodyParameters: [
          customerName ||
            "Customer",

          businessName,
        ],
      };
    }
  }
}

//--------------------------------------------------
// Template Name
//--------------------------------------------------

function getTemplateName(
  envKey:
    string,

  fallback:
    string
): string {
  const value =
    process.env[
      envKey
    ]
      ?.trim();

  return (
    value ||
    fallback
  );
}

//--------------------------------------------------
// Language
//--------------------------------------------------

function getTemplateLanguage():
  string {
  return (
    process.env
      .META_WA_TEMPLATE_LANGUAGE
      ?.trim() ||
    "en_US"
  );
}

//--------------------------------------------------
// Clean Variable
//--------------------------------------------------

function clean(
  value:
    string |
    undefined
): string {
  return (
    value
      ?.trim()
      .replace(
        /[\r\n\t]+/g,
        " "
      )
      .replace(
        /\s{2,}/g,
        " "
      )
      .slice(
        0,
        200
      ) ||
    ""
  );
}