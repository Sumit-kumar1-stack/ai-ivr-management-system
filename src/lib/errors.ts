export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode = 500
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not Found") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation Failed") {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Already Exists") {
    super(message, 409);
  }
}