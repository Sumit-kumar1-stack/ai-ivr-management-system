//--------------------------------------------------
// Base Application Error
//--------------------------------------------------

export class AppError extends Error {

  public readonly statusCode:
    number;

  public readonly code:
    string;

  public readonly details?:
    unknown;


  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: unknown
  ) {

    super(
      message
    );

    this.name =
      this.constructor.name;

    this.statusCode =
      statusCode;

    this.code =
      code;

    this.details =
      details;


    Error.captureStackTrace?.(
      this,
      this.constructor
    );

  }

}


//--------------------------------------------------
// 400
//--------------------------------------------------

export class ValidationError
  extends AppError {

  constructor(
    message =
      "Invalid request",
    details?: unknown
  ) {

    super(
      message,
      400,
      "VALIDATION_ERROR",
      details
    );

  }

}


//--------------------------------------------------
// 401
//--------------------------------------------------

export class AuthenticationRequiredError
  extends AppError {

  constructor(
    message =
      "Authentication required"
  ) {

    super(
      message,
      401,
      "AUTHENTICATION_REQUIRED"
    );

  }

}


//--------------------------------------------------
// 403
//--------------------------------------------------

export class ForbiddenError
  extends AppError {

  constructor(
    message =
      "You are not allowed to perform this action"
  ) {

    super(
      message,
      403,
      "FORBIDDEN"
    );

  }

}


//--------------------------------------------------
// 404
//--------------------------------------------------

export class NotFoundError
  extends AppError {

  constructor(
    resource:
      string,
    identifier?:
      string
  ) {

    super(
      identifier
        ? `${resource} not found: ${identifier}`
        : `${resource} not found`,
      404,
      "NOT_FOUND",
      {
        resource,
        identifier,
      }
    );

  }

}


export class CampaignNotFoundError
  extends AppError {

  constructor(
    campaignId?:
      string
  ) {

    super(
      campaignId
        ? `Campaign not found: ${campaignId}`
        : "Campaign not found",
      404,
      "CAMPAIGN_NOT_FOUND",
      {
        campaignId,
      }
    );

  }

}


//--------------------------------------------------
// 409
//--------------------------------------------------

export class ConflictError
  extends AppError {

  constructor(
    message:
      string,
    code =
      "CONFLICT",
    details?: unknown
  ) {

    super(
      message,
      409,
      code,
      details
    );

  }

}


export class CampaignConflictError
  extends AppError {

  constructor(
    message =
      "Campaign is already running",
    currentStatus?: string
  ) {

    super(
      message,
      409,
      "CAMPAIGN_CONFLICT",
      {
        currentStatus,
      }
    );

  }

}


//--------------------------------------------------
// 422
//--------------------------------------------------

export class NoCallableContactsError
  extends AppError {

  constructor(
    campaignId?:
      string
  ) {

    super(
      "Campaign has no callable contacts",
      422,
      "NO_CALLABLE_CONTACTS",
      {
        campaignId,
      }
    );

  }

}


//--------------------------------------------------
// 503
//--------------------------------------------------

export class ProviderUnavailableError
  extends AppError {

  constructor(
    message =
      "Telephony provider is currently unavailable",
    details?: unknown
  ) {

    super(
      message,
      503,
      "PROVIDER_UNAVAILABLE",
      details
    );

  }

}