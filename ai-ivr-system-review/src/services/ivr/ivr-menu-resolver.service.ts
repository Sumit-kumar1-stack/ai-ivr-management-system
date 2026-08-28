import {
  IVRResolvedInput,
  IVRRuntimeMenu,
} from "./ivr-runtime.types";

//--------------------------------------------------
// Valid DTMF
//--------------------------------------------------

const VALID_DTMF =
  /^(?:[0-9]|#|\*)$/;

//--------------------------------------------------
// Resolve DTMF
//--------------------------------------------------

export function resolveIVRDigit(
  menu: IVRRuntimeMenu,
  digit: string
): IVRResolvedInput {
  const normalizedDigit =
    digit.trim();

  //------------------------------------------------
  // Missing / malformed input
  //------------------------------------------------

  if (
    !normalizedDigit ||
    !VALID_DTMF.test(
      normalizedDigit
    )
  ) {
    return {
      valid:
        false,

      digit:
        normalizedDigit,

      action:
        "INVALID",

      response:
        menu.invalidPrompt,
    };
  }

  //------------------------------------------------
  // Find configured option
  //------------------------------------------------

  const option =
    menu.options.find(
      item =>
        item.digit ===
        normalizedDigit
    );

  if (
    !option
  ) {
    return {
      valid:
        false,

      digit:
        normalizedDigit,

      action:
        "INVALID",

      response:
        menu.invalidPrompt,
    };
  }

  //------------------------------------------------
  // Successful resolution
  //------------------------------------------------

  return {
    valid:
      true,

    digit:
      normalizedDigit,

    action:
      option.action,

    label:
      option.label,

    response:
      option.response ??
      `You selected ${option.label}.`,

    value:
      option.value,
  };
}