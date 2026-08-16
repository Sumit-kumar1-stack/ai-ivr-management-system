//--------------------------------------------------
// Template Keys
//--------------------------------------------------

export type ApprovedMessageTemplateKey =
  | "CALLBACK_CONFIRMATION"
  | "LEAD_FOLLOW_UP"
  | "HUMAN_TRANSFER_UNAVAILABLE";

//--------------------------------------------------
// Variables
//--------------------------------------------------

export interface MessageTemplateVariables {
  customerName?:
    string;

  callbackTime?:
    string;

  businessName?:
    string;
}

//--------------------------------------------------
// Render
//--------------------------------------------------

export function renderApprovedMessageTemplate(
  templateKey:
    ApprovedMessageTemplateKey,

  variables:
    MessageTemplateVariables
): string {
  const customerName =
    sanitizeVariable(
      variables.customerName
    );

  const callbackTime =
    sanitizeVariable(
      variables.callbackTime
    );

  const businessName =
    sanitizeVariable(
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
          "callbackTime is required for CALLBACK_CONFIRMATION"
        );
      }

      const greeting =
        customerName
          ? `Hi ${customerName}, `
          : "";

      return (
        `${greeting}your callback request is confirmed for ` +
        `${callbackTime}. ${businessName} will contact you at the confirmed number.`
      );
    }

    case "LEAD_FOLLOW_UP": {
      const greeting =
        customerName
          ? `Hi ${customerName}, `
          : "";

      return (
        `${greeting}thank you for your interest. ` +
        `${businessName} will follow up with you shortly.`
      );
    }

    case "HUMAN_TRANSFER_UNAVAILABLE": {
      const greeting =
        customerName
          ? `Hi ${customerName}, `
          : "";

      return (
        `${greeting}a human agent was unavailable during your call. ` +
        `${businessName} will assist you as soon as possible.`
      );
    }
  }
}

//--------------------------------------------------
// Sanitize Template Variable
//--------------------------------------------------

function sanitizeVariable(
  value:
    string |
    undefined
): string {
  if (
    !value
  ) {
    return "";
  }

  return value
    .trim()
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
    );
}